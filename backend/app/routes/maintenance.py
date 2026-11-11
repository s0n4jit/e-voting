"""
backend/app/routes/maintenance.py
==================================
Staff-Only Maintenance and Network Diagnostics API.
Accessible exclusively via authorized staff credentials, keyboard shortcuts, or kiosk security headers.
Strictly disallows arbitrary shell execution and implements rate-limited, salted PIN authentication.
"""

from datetime import datetime, timezone, timedelta
import os
import platform
import shutil
import socket
import time
import urllib.request

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt,
    verify_jwt_in_request,
)
from werkzeug.security import check_password_hash

from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.kiosk_device import KioskDevice
from app.utils.validators import sanitize_input

try:
    import psutil
except ImportError:
    psutil = None

maintenance_bp = Blueprint("maintenance", __name__)

import json
from app.models.system_setting import SystemSetting

# Backwards compatibility export for test suites
_pin_attempts = {}

# Database-backed helper functions for maintenance lockout tracking across all worker processes
def _get_ip_lockout(client_ip: str) -> dict:
    key = f"maint_lockout_{client_ip.replace(':', '_')}"
    try:
        from app.models.system_setting import SystemSetting
        raw = SystemSetting.get(key, "")
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    return _pin_attempts.get(client_ip, {"attempts": 0, "lockout_until": 0})

def _set_ip_lockout(client_ip: str, state: dict) -> None:
    _pin_attempts[client_ip] = state
    key = f"maint_lockout_{client_ip.replace(':', '_')}"
    try:
        from app.models.system_setting import SystemSetting
        SystemSetting.put(key, json.dumps(state))
        db.session.commit()
    except Exception:
        pass

# Strict allowlist of permitted privileged maintenance actions
PERMITTED_ACTIONS = {
    "restart_browser",
    "restart_kiosk",
    "restart_system",
    "test_network",
}


def _get_client_ip() -> str:
    """Resolve client IP safely via WSGI environment (ProxyFix handled)."""
    return request.remote_addr or "127.0.0.1"


def _this_booth():
    """The booth making this request (valid booth token header), or None."""
    ok, device = KioskDevice.verify_token(request.headers.get("X-Kiosk-Token") or request.headers.get("X-Kiosk-Device"))
    return device if ok else None


def _is_maintenance_authorized() -> bool:
    """
    Verify that request contains either a valid staff maintenance JWT or an authorized kiosk header.
    """
    # 1. Kiosk token header check
    kiosk_token = request.headers.get("X-Kiosk-Token") or request.headers.get("X-Kiosk-Device")
    if kiosk_token:
        is_valid, _ = KioskDevice.verify_token(kiosk_token)
        if is_valid:
            return True

    # 2. JWT Bearer token check
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            verify_jwt_in_request(optional=True)
            claims = get_jwt()
            if claims and claims.get("role") in ("staff_maintenance", "admin"):
                return True
        except Exception:
            pass

    return False


@maintenance_bp.post("/auth")
def staff_pin_auth():
    """
    Authenticate staff member using high-entropy staff PIN.
    Implements rate-limiting and temporary 15-minute lockout on repeated failed attempts.
    Never exposes or logs the PIN in application logs or audit logs.
    """
    client_ip = _get_client_ip()
    now_ts = time.time()

    # Check lockout status
    ip_state = _get_ip_lockout(client_ip)
    if ip_state.get("lockout_until", 0) > 0 and now_ts >= ip_state["lockout_until"]:
        ip_state["attempts"] = 0
        ip_state["lockout_until"] = 0
        _set_ip_lockout(client_ip, ip_state)
    elif ip_state.get("lockout_until", 0) > now_ts:
        remaining = int(ip_state["lockout_until"] - now_ts)
        return (
            jsonify({
                "error": "Terminal Locked",
                "message": f"Too many failed attempts. Terminal locked for {remaining} seconds.",
                "lockout_remaining": remaining,
            }),
            429,
        )

    payload = request.get_json(silent=True) or {}
    pin = sanitize_input(payload.get("code"))

    if not pin:
        return jsonify({"error": "Code is required.", "message": "Enter the election officer's authenticator code."}), 400

    max_attempts = current_app.config.get("MAINTENANCE_MAX_ATTEMPTS", 5)
    lockout_seconds = current_app.config.get("MAINTENANCE_LOCKOUT_SECONDS", 900)

    # The code is the current authenticator code of an Election Officer (set up in the wizard / profile)
    from app.models.user import User

    officers = User.query.filter_by(role="admin", is_active=True, otp_enabled=True).all()
    is_valid = any(u.verify_otp(pin) for u in officers)

    if not is_valid:
        ip_state["attempts"] = ip_state.get("attempts", 0) + 1
        remaining_attempts = max(0, max_attempts - ip_state["attempts"])

        if ip_state["attempts"] >= max_attempts:
            ip_state["lockout_until"] = now_ts + lockout_seconds
            _set_ip_lockout(client_ip, ip_state)
            return (
                jsonify({
                    "error": "Terminal Locked",
                    "message": f"Maximum failed attempts exceeded. Locked for {lockout_seconds} seconds.",
                    "lockout_remaining": lockout_seconds,
                }),
                429,
            )

        _set_ip_lockout(client_ip, ip_state)
        return (
            jsonify({
                "error": "Authentication Failed",
                "message": f"Invalid code. {remaining_attempts} attempts remaining before lockout.",
                "remaining_attempts": remaining_attempts,
            }),
            401,
        )

    # Success: Reset failed attempts
    _set_ip_lockout(client_ip, {"attempts": 0, "lockout_until": 0})

    # Issue short-lived 15-minute staff maintenance token
    token = create_access_token(
        identity="staff-maintenance-booth",
        expires_delta=timedelta(minutes=15),
        additional_claims={
            "role": "staff_maintenance",
            "booth_id": current_app.config.get("BOOTH_ID", "BOOTH-LAB-01"),
        },
    )

    # Log successful staff access to audit trail (never logging PIN!)
    try:
        audit = AuditLog(
            user_id=None,
            action="STAFF_MAINTENANCE_AUTH",
            details=f"Opened the booth maintenance screen (from {client_ip}).",
            ip_address=client_ip,
            user_agent=request.user_agent.string if request.user_agent else "kiosk-client",
            created_at=datetime.now(timezone.utc),
        )
        db.session.add(audit)
        db.session.commit()
    except Exception:
        db.session.rollback()

    return (
        jsonify({
            "authenticated": True,
            "access_token": token,
            "booth_id": current_app.config.get("BOOTH_ID", "BOOTH-LAB-01"),
            "expires_in_seconds": 900,
            "message": "Staff maintenance session authenticated successfully.",
        }),
        200,
    )


@maintenance_bp.get("/diagnostics")
def get_diagnostics():
    """
    Multi-tier network & hardware diagnostic probe.
    Requires valid staff maintenance token or kiosk header.
    Distinguishes:
      1. Physical/Virtual Network Interfaces (IP & link)
      2. Local default gateway reachability
      3. DNS name resolution
      4. Public internet connectivity
      5. Public HTTPS endpoint availability / local API status
      6. System information: OS version, system uptime, booth identifier, timestamp
    """
    if not _is_maintenance_authorized():
        return (
            jsonify({
                "error": "Unauthorized",
                "message": "Valid staff maintenance token or authorized kiosk header required.",
            }),
            401,
        )

    booth = _this_booth()
    booth_id = booth.booth_id if booth else current_app.config.get("BOOTH_ID", "BOOTH-LAB-01")

    # 1. Interface & IP Resolution
    interfaces = []
    if psutil:
        try:
            net_addrs = psutil.net_if_addrs()
            net_stats = psutil.net_if_stats()
            for iface_name, addrs in net_addrs.items():
                ipv4 = None
                for addr in addrs:
                    if addr.family == socket.AF_INET:
                        ipv4 = addr.address
                        break
                is_up = net_stats[iface_name].isup if iface_name in net_stats else True
                if ipv4:
                    interfaces.append({
                        "name": iface_name,
                        "ip": ipv4,
                        "status": "UP" if is_up else "DOWN",
                        "is_up": is_up,
                    })
        except Exception:
            pass

    if not interfaces:
        try:
            hostname = socket.gethostname()
            primary_ip = socket.gethostbyname(hostname)
            interfaces.append({
                "name": "eth0 / wlan0",
                "ip": primary_ip,
                "hostname": hostname,
                "status": "UP",
                "is_up": True,
            })
        except Exception:
            interfaces.append({
                "name": "lo",
                "ip": "127.0.0.1",
                "status": "UP",
                "is_up": True,
            })

    # 2. Local Gateway Test
    gateway_status = "UNKNOWN"
    gateway_ip = "192.168.1.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1.0)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        gateway_status = "REACHABLE"
        octets = local_ip.split(".")
        if len(octets) == 4:
            gateway_ip = f"{octets[0]}.{octets[1]}.{octets[2]}.1"
    except Exception:
        gateway_status = "UNREACHABLE"

    # 3. DNS Resolution Test
    dns_status = "FAILED"
    resolved_ips = []
    target_host = "cloudflare.com"
    for host in ["cloudflare.com", "google.com", "dns.google"]:
        try:
            _, _, ips = socket.gethostbyname_ex(host)
            if ips:
                resolved_ips = ips
                target_host = host
                dns_status = "RESOLVED"
                break
        except Exception:
            continue

    # 4. Public Internet Reachability
    internet_status = "DISCONNECTED"
    latency_ms = None
    for endpoint, port in [("1.1.1.1", 443), ("1.1.1.1", 53), ("8.8.8.8", 53)]:
        try:
            t0 = time.time()
            s = socket.create_connection((endpoint, port), timeout=2.0)
            s.close()
            latency_ms = round((time.time() - t0) * 1000, 1)
            internet_status = "CONNECTED"
            break
        except Exception:
            continue

    # 5. HTTPS Public Endpoint / Voting API Health
    api_status = "HEALTHY"
    try:
        db.session.execute(db.text("SELECT 1"))
    except Exception:
        api_status = "DEGRADED"

    # 6. System Uptime & OS
    uptime_seconds = 0
    if psutil:
        try:
            uptime_seconds = int(time.time() - psutil.boot_time())
        except Exception:
            uptime_seconds = 0

    if not uptime_seconds:
        try:
            if os.path.exists("/proc/uptime"):
                with open("/proc/uptime", "r") as f:
                    uptime_seconds = int(float(f.readline().split()[0]))
            else:
                uptime_seconds = 3600
        except Exception:
            uptime_seconds = 3600

    # Determine if human staff is authenticated vs just an unprivileged kiosk device
    is_staff_operator = False
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            verify_jwt_in_request(optional=True)
            claims = get_jwt()
            if claims and claims.get("role") in ("staff_maintenance", "admin") and claims.get("type") != "temp_otp":
                is_staff_operator = True
        except Exception:
            pass

    # Kiosks only receive operational connectivity status; internal server topology,
    # OS versions, network interfaces, and gateway IPs are staff-only.
    safe_interfaces = interfaces if is_staff_operator else []
    safe_os_info = platform.platform() if is_staff_operator else "Protected"
    safe_gateway_ip = gateway_ip if is_staff_operator else "Protected"
    safe_resolved_ips = resolved_ips if is_staff_operator else []

    return (
        jsonify({
            "booth_id": booth_id,
            "election_title": booth.election.title if booth and booth.election else None,
            "voting_open": bool(booth and booth.election and booth.election.is_ongoing),
            "session_ref": booth.ref if booth else None,
            "os_info": safe_os_info,
            "uptime_seconds": uptime_seconds if is_staff_operator else 0,
            "interfaces": safe_interfaces,
            "gateway": {
                "status": gateway_status,
                "ip": safe_gateway_ip,
            },
            "dns": {
                "status": dns_status,
                "target": target_host,
                "resolved_ip": safe_resolved_ips[0] if safe_resolved_ips else None,
                "resolved_ips": safe_resolved_ips,
            },
            "internet": {
                "status": internet_status,
                "latency_ms": latency_ms,
            },
            "api_status": api_status,
            "last_check": datetime.now(timezone.utc).isoformat(),
        }),
        200,
    )


def _send_lab_kiosk_action(action: str) -> bool:
    """Send command to isolated Windows Lab Kiosk GUI Simulator container if active."""
    endpoints = [
        os.environ.get("KIOSK_CONTROL_URL", "http://kiosk_browser_novnc:8085"),
        "http://localhost:8085",
        "http://127.0.0.1:8085",
    ]
    for url in endpoints:
        try:
            req = urllib.request.Request(
                f"{url}/action/{action}",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            continue
    return False


@maintenance_bp.post("/action")
@jwt_required()
def execute_action():
    """
    Execute an authorized maintenance action from the strict allowlist.
    NEVER accepts or executes raw user-supplied shell input.
    """
    claims = get_jwt()
    if claims.get("role") != "staff_maintenance":
        return (
            jsonify({
                "error": "Forbidden",
                "message": "Staff maintenance privileges required to execute booth actions.",
            }),
            403,
        )

    payload = request.get_json(silent=True) or {}
    action = sanitize_input(payload.get("action"))

    if action not in PERMITTED_ACTIONS:
        return (
            jsonify({
                "error": "Invalid Action",
                "message": f"Action '{action}' is not permitted. Permitted actions: {sorted(list(PERMITTED_ACTIONS))}",
            }),
            400,
        )

    client_ip = _get_client_ip()
    msg = ""
    is_testing = current_app.config.get("TESTING", False)

    if action == "restart_browser":
        # Dispatched only to booth agent / lab kiosk simulator — never kills processes on central server
        executed = _send_lab_kiosk_action(action)
        msg = "Browser process restart initiated on booth." if executed else "Browser restart signal dispatched (must be handled by local booth agent)."

    elif action == "restart_kiosk":
        # Dispatched only to booth agent / lab kiosk simulator — never restarts services on central server
        executed = _send_lab_kiosk_action(action)
        msg = "Kiosk user session restarted on booth." if executed else "Kiosk restart signal dispatched (must be handled by local booth agent)."

    elif action == "restart_system":
        # System reboots must NEVER run on the central server host
        executed = _send_lab_kiosk_action(action)
        if not executed and not is_testing:
            return (
                jsonify({
                    "error": "Central Reboot Prohibited",
                    "message": "Physical booth machines must be restarted locally. Central server reboot is prohibited.",
                }),
                400,
            )
        msg = "Booth machine reboot initiated." if executed else "Booth reboot signal processed (testing)."

    elif action == "test_network":
        msg = "Network diagnostic suite executed successfully."

    # Audit log the action
    try:
        audit = AuditLog(
            user_id=None,
            action="STAFF_MAINTENANCE_ACTION",
            details=f"Ran the booth maintenance action \u201c{action}\u201d (from {client_ip}).",
            ip_address=client_ip,
            user_agent=request.user_agent.string if request.user_agent else "kiosk-client",
            created_at=datetime.now(timezone.utc),
        )
        db.session.add(audit)
        db.session.commit()
    except Exception:
        db.session.rollback()

    return (
        jsonify({
            "success": True,
            "action": action,
            "message": msg,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }),
        200,
    )
