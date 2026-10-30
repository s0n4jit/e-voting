# Campus E-Voting System (CEVS)

[![Python](https://img.shields.io/badge/Python-3.11-blue.svg)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey.svg)](https://flask.palletsprojects.com/)
[![React](https://img.shields.io/badge/React-18.2-blue.svg)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg)](https://www.docker.com/)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-26.04%20LTS-E95420.svg)](https://ubuntu.com/)

A secure, verifiable, and confidential Campus E-Voting System designed for college and university student union elections. Features a physical registration desk with single-use PIN slips, examination-style locked-down physical booth kiosks, staff-only maintenance controls, and an isolated Windows testing lab.

---

## 🏛️ System Architecture

```
                               ┌──────────────────────────────────────────────┐
                               │       PHYSICAL REGISTRATION DESK            │
                               │  - Student shows physical ID card            │
                               │  - Polling Desk Officer verifies roster      │
                               │  - Issues single-use 6-digit Voting PIN slip │
                               └──────────────────────┬───────────────────────┘
                                                      │ (Voter walks to booth)
                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                          EXAMINATION-STYLE COMPUTER LAB VOTING BOOTH                        │
│  - Ubuntu 26.04 LTS (Noble Numbat) with GNOME Wayland & Snap Firefox                        │
│  - Dedicated restricted 'evote' account with locked shell & autologin                       │
│  - Enterprise Policies: DevTools, downloads, tabs, about:config, and non-whitelisted URLs   │
│  - 9-Portfolio guided balloting stepper with NOTA (None of the Above) on each position      │
│  - Atomic burn-on-cast with zero relational linkage between voter identity and vote         │
│  - Concealed Staff Maintenance shortcuts (Ctrl+Alt+Shift+M/N/R/L/T) with salted PIN auth    │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │ (Encrypted JSON over HTTPS)
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                             CENTRAL HIGH-INTEGRITY E-VOTING API                             │
│  - Flask application factory with PostgreSQL 15 & Redis cache                               │
│  - Decoupled VoterRecord (SHA-256 voter hash) & BallotEntry (SHA-256 HMAC blind token)     │
│  - Append-only cryptographic security audit trail                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Production / Campus Deployment (Docker Compose)
```bash
# Clone the repository
git clone https://github.com/s0n4jit/e-voting.git
cd e-voting

# Start services
docker compose up -d --build

# Seed active Student Union election & candidates
docker exec evoting_backend python migrations/seed_data.py
```

* **Voting Kiosk**: [http://localhost:3000/kiosk](http://localhost:3000/kiosk)
* **Polling Desk**: [http://localhost:3000/desk](http://localhost:3000/desk)
* **Election Admin**: [http://localhost:3000/login](http://localhost:3000/login)

---

### 2. Windows Testing Lab (`testing/kiosk-lab/`)
Test the complete kiosk booth experience and staff maintenance shortcuts on Windows without rebooting into Ubuntu or running heavy VMs:

```powershell
cd testing/kiosk-lab
.\start.ps1
```

* **Web Kiosk Terminal**: [http://localhost:3001/kiosk](http://localhost:3001/kiosk)
* **Linux noVNC Kiosk Simulator**: [http://localhost:8080](http://localhost:8080)
* **Staff Maintenance Shortcut**: `Ctrl + Alt + Shift + M` (PIN: `948201`)

To stop or reset:
```powershell
.\stop.ps1    # Stops containers safely
.\reset.ps1   # Resets test data to clean state (zero impact on production)
```

---

### 3. Physical Ubuntu 26.04 LTS Kiosk Booth Setup
To configure a physical terminal machine in the computer lab:

```bash
cd kiosk/ubuntu
sudo VOTING_URL="https://evote.campus.internal/kiosk" bash setup-kiosk.sh
```

---

## 🔐 Staff Maintenance Shortcuts

| Shortcut | Description |
| :--- | :--- |
| `Ctrl + Alt + Shift + M` | Open Staff Maintenance Panel (PIN challenge) |
| `Ctrl + Alt + Shift + N` | Open directly to Network Diagnostics |
| `Ctrl + Alt + Shift + R` | Reboot Terminal prompt |
| `Ctrl + Alt + Shift + L` | Return to clean Voting Kiosk interface |
| `Ctrl + Alt + Shift + T` | Re-run network and API health probe |

---

## 📚 Technical Documentation

* [Ubuntu Kiosk Setup Guide](docs/KIOSK_SETUP.md)
* [Staff Maintenance Runbook](docs/KIOSK_MAINTENANCE.md)
* [Network Diagnostics Architecture](docs/NETWORK_DIAGNOSTICS.md)
* [Windows Testing Environment](docs/WINDOWS_TESTING.md)
* [Security & Threat Model](docs/SECURITY.md)
* [Operational Troubleshooting](docs/TROUBLESHOOTING.md)

---

## 🧪 Testing

```bash
# Run backend pytest suite (93 tests)
pytest tests/

# Run end-to-end campus kiosk integration test
python scripts/test_campus_kiosk_workflow.py

# Run Playwright automated browser tests
cd testing/kiosk-lab && npx playwright test
```

---

## 📄 License
Academic Software Project — Minor Project 8 for B.Sc. Computer Science (NEP 2020).
All rights reserved.
