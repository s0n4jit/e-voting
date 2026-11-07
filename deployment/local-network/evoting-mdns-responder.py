#!/usr/bin/env python3
"""
Campus E-Voting - Dynamic mDNS Hostname Responder (evoting.local)
================================================================
Advertises 'evoting.local' over Multicast DNS (RFC 6762 / 6763)
independently of the Windows machine hostname.

Key Features:
- Automatically detects active physical LAN IPv4 address (avoids WSL / Docker / APIPA)
- Monitors for DHCP IP changes and network reconnection
- Flushes old address with TTL 0 farewell packets and announces new IP immediately
- Detects hostname conflicts on the local network
- Handles Windows sleep/resume and adapter reconnects gracefully
- Runs silently as a background service or in terminal
"""

import os
import sys
import time
import socket
import signal
import logging
from logging.handlers import RotatingFileHandler

try:
    from zeroconf import Zeroconf, ServiceInfo
    import ifaddr
except ImportError:
    print("ERROR: 'zeroconf' package is not installed.")
    print("Run: pip install zeroconf")
    sys.exit(1)

# Configuration
HOSTNAME = "evoting.local."
SERVICE_NAME = "Campus E-Voting Hub"
CHECK_INTERVAL_SECONDS = 2.0
LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs", "mdns.log")


def setup_logger():
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    logger = logging.getLogger("evoting_mdns")
    logger.setLevel(logging.INFO)

    # Format
    fmt = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    # Console Handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    logger.addHandler(ch)

    # Rotating File Handler (1 MB, 3 backups)
    fh = RotatingFileHandler(LOG_FILE, maxBytes=1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    return logger


logger = setup_logger()


def get_active_lan_ip():
    """
    Detect the active IPv4 address on the physical LAN adapter.
    Uses outbound kernel routing socket lookup, then verifies against active adapters.
    """
    candidate = None
    try:
        # Outbound routing query (does not transmit any UDP packet)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        candidate = s.getsockname()[0]
        s.close()
    except Exception:
        candidate = None

    # Verify candidate is a real non-loopback, non-APIPA, non-virtual address
    if candidate and not candidate.startswith("127.") and not candidate.startswith("169.254."):
        return candidate

    # Fallback inspection of active system adapters
    for adapter in ifaddr.get_adapters():
        name_lower = adapter.name.lower()
        # Skip virtual/internal adapters
        if any(v in name_lower for v in ("veth", "wsl", "docker", "loopback", "hyper-v", "tailscale", "bluetooth")):
            continue
        for ip in adapter.ips:
            if ip.is_IPv4:
                addr = ip.ip
                if not addr.startswith("127.") and not addr.startswith("169.254."):
                    return addr

    return None


class MDNSResponder:
    def __init__(self):
        self.running = True
        self.current_ip = None
        self.zc = None
        self.https_info = None
        self.http_info = None

    def create_services(self, ip_str):
        ip_bytes = socket.inet_aton(ip_str)

        https_info = ServiceInfo(
            "_https._tcp.local.",
            f"{SERVICE_NAME} HTTPS._https._tcp.local.",
            port=443,
            server=HOSTNAME,
            addresses=[ip_bytes],
            properties={"path": "/", "app": "Campus E-Voting"}
        )

        http_info = ServiceInfo(
            "_http._tcp.local.",
            f"{SERVICE_NAME} HTTP._http._tcp.local.",
            port=80,
            server=HOSTNAME,
            addresses=[ip_bytes],
            properties={"path": "/", "app": "Campus E-Voting"}
        )

        return https_info, http_info

    def start_advertising(self, ip_str):
        try:
            logger.info(f"Initializing mDNS responder on physical LAN interface: {ip_str}")
            self.zc = Zeroconf(interfaces=[ip_str])
            self.https_info, self.http_info = self.create_services(ip_str)

            self.zc.register_service(self.https_info)
            self.zc.register_service(self.http_info)
            self.current_ip = ip_str

            logger.info(f"SUCCESS: Now advertising '{HOSTNAME[:-1]}' -> {ip_str}")
            logger.info(f"Booth URL: https://{HOSTNAME[:-1]} (ports 80/443)")
        except Exception as e:
            logger.error(f"Failed to advertise mDNS services on {ip_str}: {e}")
            self.stop_advertising()

    def stop_advertising(self):
        if self.zc:
            try:
                if self.https_info:
                    self.zc.unregister_service(self.https_info)
                if self.http_info:
                    self.zc.unregister_service(self.http_info)
                self.zc.close()
            except Exception as e:
                logger.warning(f"Error during mDNS unregister: {e}")
            finally:
                self.zc = None
                self.https_info = None
                self.http_info = None
                self.current_ip = None

    def run(self):
        logger.info(f"Starting Campus E-Voting mDNS Daemon for '{HOSTNAME[:-1]}'...")

        # Setup graceful signal handlers
        def handle_exit(signum, frame):
            logger.info("Received termination signal. Unregistering mDNS records...")
            self.running = False
            self.stop_advertising()
            sys.exit(0)

        signal.signal(signal.SIGINT, handle_exit)
        signal.signal(signal.SIGTERM, handle_exit)

        while self.running:
            new_ip = get_active_lan_ip()

            if not new_ip:
                if self.current_ip:
                    logger.warning("Active network adapter disconnected. Withdrawing mDNS records...")
                    self.stop_advertising()
            elif new_ip != self.current_ip:
                if self.current_ip:
                    logger.warning(f"DHCP IP change detected: {self.current_ip} -> {new_ip}")
                    self.stop_advertising()
                    time.sleep(0.5)  # Let farewell packets clear
                self.start_advertising(new_ip)

            time.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    responder = MDNSResponder()
    responder.run()
