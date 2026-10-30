"""
app.py — Kiosk Network Simulation & Chaos Daemon
Simulates latency, network disconnection, DNS failure, and packet loss for Kiosk diagnostic testing.
"""

from flask import Flask, jsonify, request
import time
from datetime import datetime, timezone

app = Flask(__name__)

# Simulator state
sim_state = {
    "status": "active",
    "simulation_state": "normal",
    "offline": False,
    "injected_delay_ms": 0,
    "dns_failure": False,
    "last_updated": datetime.now(timezone.utc).isoformat(),
}

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "kiosk-network-simulator"}), 200

@app.route("/status", methods=["GET"])
def status():
    return jsonify(sim_state), 200

@app.route("/simulate/disconnect", methods=["POST"])
def simulate_disconnect():
    sim_state["simulation_state"] = "disconnected"
    sim_state["offline"] = True
    sim_state["dns_failure"] = False
    sim_state["last_updated"] = datetime.now(timezone.utc).isoformat()
    return jsonify({
        "message": "Simulated complete network disconnect / gateway severance.",
        "state": sim_state,
    }), 200

@app.route("/simulate/latency", methods=["POST"])
def simulate_latency():
    payload = request.get_json(silent=True) or {}
    delay = payload.get("delay_ms", 1500)
    sim_state["simulation_state"] = "latency"
    sim_state["offline"] = False
    sim_state["injected_delay_ms"] = int(delay)
    sim_state["dns_failure"] = False
    sim_state["last_updated"] = datetime.now(timezone.utc).isoformat()
    return jsonify({
        "message": f"Simulated artificial latency of {delay}ms.",
        "state": sim_state,
    }), 200

@app.route("/simulate/dns-failure", methods=["POST"])
def simulate_dns():
    sim_state["simulation_state"] = "dns_failure"
    sim_state["offline"] = True
    sim_state["dns_failure"] = True
    sim_state["last_updated"] = datetime.now(timezone.utc).isoformat()
    return jsonify({
        "message": "Simulated campus DNS resolution failure.",
        "state": sim_state,
    }), 200

@app.route("/simulate/restore", methods=["POST"])
def simulate_restore():
    sim_state["simulation_state"] = "normal"
    sim_state["offline"] = False
    sim_state["injected_delay_ms"] = 0
    sim_state["dns_failure"] = False
    sim_state["last_updated"] = datetime.now(timezone.utc).isoformat()
    return jsonify({
        "message": "Network restored to normal nominal state.",
        "state": sim_state,
    }), 200

@app.route("/proxy/ping", methods=["GET"])
def proxy_ping():
    """Endpoint mimicking election server reachability subject to simulated conditions."""
    if sim_state["offline"] or sim_state["dns_failure"]:
        return jsonify({"error": "Host Unreachable", "details": "Simulated network drop"}), 503

    if sim_state["injected_delay_ms"] > 0:
        time.sleep(sim_state["injected_delay_ms"] / 1000.0)

    return jsonify({"status": "reachable", "latency_ms": sim_state["injected_delay_ms"]}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8090, debug=False)
