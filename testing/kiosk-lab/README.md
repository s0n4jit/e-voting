# Campus E-Voting System (CEVS) — Windows Kiosk Testing Lab

A complete, self-contained Windows testing environment for **Campus E-Voting System (CEVS)**. This lab allows developers and QA teams to thoroughly test the fullscreen voting kiosk experience, polling desk student verification and PIN generation, staff maintenance controls, and network resilience directly on **Windows 10/11** without needing a dedicated physical Ubuntu machine or dual-booting.

---

## 🏛️ Architecture & Services Overview

The lab spins up five isolated Docker containers connected via a private bridge network (`kiosk_lab_net`):

```
                                  +---------------------------------------+
                                  |   Windows 10/11 Host Machine          |
                                  +---------------------------------------+
                                      |                 |              |
                      http://localhost:8080     http://localhost:3001  http://localhost:8090
                                      |                 |              |
+-------------------------------------v-----------------v--------------v-------------------------+
| kiosk_lab_net (Isolated Bridge Network)                                                        |
|                                                                                                |
|  +--------------------+        +-----------------------+        +---------------------------+  |
|  | kiosk_browser_novnc|        |  kiosk_test_frontend  |        |  kiosk_network_simulator  |  |
|  | Alpine Linux X11   |------->|  Nginx + React SPA    |        |  Chaos Daemon             |  |
|  | Chromium Kiosk     |        |  Port 3001 (Internal 80)|      |  Port 8090                |  |
|  | noVNC on Port 8080 |        +-----------+-----------+        +---------------------------+  |
|  +--------------------+                    |                                                   |
|                                     /api/* Reverse Proxy                                       |
|                                            v                                                   |
|                                +-----------------------+                                       |
|                                |  kiosk_test_backend   |                                       |
|                                |  Flask REST API (5001)|                                       |
|                                |  Auto-Seeding Enabled |                                       |
|                                +-----------+-----------+                                       |
|                                            |                                                   |
|                                     PostgreSQL Link                                            |
|                                            v                                                   |
|                                +-----------------------+                                       |
|                                |    kiosk_test_db      |                                       |
|                                | PostgreSQL 15 (5433)  |                                       |
|                                | DB: evoting_test_db   |                                       |
|                                +-----------------------+                                       |
+------------------------------------------------------------------------------------------------+
```

### Complete Isolation Guarantee
- **Database Isolation:** PostgreSQL 15 runs inside `kiosk_test_db` with a dedicated database `evoting_test_db` on exposed port `5433`. It is 100% isolated from any local development database (`evoting_dev.db`) or production database on port `5432`.
- **Port Conflict-Free:** Uses dedicated host ports (`3001`, `5001`, `5433`, `8080`, `8090`) to prevent collisions with existing development servers running on `3000`, `5000`, or `5432`.
- **State Reset:** Resetting the testing lab only purges `evoting_test_db` and leaves all other project files and databases untouched.

---

## ⚡ Service Matrix & Access Endpoints

| Component | URL | Description |
| :--- | :--- | :--- |
| **Kiosk Web App** | [http://localhost:3001/kiosk](http://localhost:3001/kiosk) | Direct touch-friendly voter kiosk interface |
| **Linux noVNC Kiosk Simulator** | [http://localhost:8080](http://localhost:8080) | Live Linux GUI browser running locked-down Chromium in kiosk mode |
| **Polling Desk Terminal** | [http://localhost:3001/desk](http://localhost:3001/desk) | Desk officer student verification & 6-digit PIN slip generation |
| **Election Administration** | [http://localhost:3001/login](http://localhost:3001/login) | Chief Election Officer admin panel |
| **Network Chaos Simulator** | [http://localhost:8090/status](http://localhost:8090/status) | Network disruption & latency simulation API |
| **Isolated Test Database** | `localhost:5433` (`evoting_test_db`) | Isolated PostgreSQL 15 test database |

---

## 🔑 Test Credentials

The test environment is pre-seeded with official Student Union portfolios and test accounts:

### 1. Staff & Administration
- **Chief Election Officer (Admin):** `ADMIN001` / `Admin@1234` (2FA TOTP OTP: `123456`)
- **Polling Desk Officer 1:** `DESK001` / `Desk@1234` (2FA TOTP OTP: `123456`)
- **Polling Desk Officer 2:** `DESK002` / `Desk@1234` (2FA TOTP OTP: `123456`)
- **Staff Maintenance PIN:** `948201`

### 2. Sample Enrolled Voters
- **Student IDs:** `STU001` through `STU020`
- **Password:** `Student@1234`

### 3. Student Union Portfolios (9 Executive Positions)
1. Vice President
2. General Secretary
3. Assistant General Secretary
4. Cultural Secretary
5. Magazine Secretary
6. Boys Common Room Secretary
7. Girls Common Room Secretary
8. Major Games Secretary
9. Minor Games Secretary
*(Each position includes nominated candidates + None of the Above / NOTA)*

---

## 🚀 Quick Start on Windows

### Prerequisites
- Windows 10 or 11
- PowerShell 5.1+ or PowerShell 7+
- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) with Linux containers enabled
- Node.js 18+ (for running Playwright automated tests)

### 1. Launch the Kiosk Lab
Open PowerShell and navigate to `testing/kiosk-lab/`:

```powershell
cd D:\Codes\Projects\EVoting\testing\kiosk-lab
.\start.ps1
```

To automatically open both the Kiosk Web App and the Linux noVNC simulator in your Windows browser:
```powershell
.\start.ps1 -OpenBrowser
```

The script will:
1. Verify Docker Desktop / daemon is active.
2. Build and start all 5 containers with `--env-file .env.test`.
3. Wait for database and backend health checks.
4. Output a formatted console dashboard.

---

## 🖥️ Interactive Linux noVNC Kiosk Simulator

Open **`http://localhost:8080`** in Google Chrome, Microsoft Edge, or Firefox on Windows.

- You will see a containerized Linux X11 desktop running locked-down Chromium in fullscreen kiosk mode.
- Test touch emulation, mouse clicks, and keyboard inputs exactly as if you were standing at a physical polling booth.
- Use fullscreen mode (`F11`) on Windows for complete immersion.

---

## 🛠️ Staff Maintenance & Diagnostics Controls

While inside the kiosk booth (`/kiosk` or via the noVNC simulator):

1. **Open Maintenance Panel:** Press `Ctrl + Alt + Shift + M`
2. **Authenticate:** Enter the staff security PIN: **`948201`** and click **Unlock Maintenance Terminal**.
3. **Diagnostics Available:**
   - **System Health:** CPU, Memory, Disk, Uptime, Booth Station ID (`BOOTH-LAB-01`).
   - **Database Diagnostics:** PostgreSQL latency and connection pool health.
   - **Network Topology:** Real-time round-trip latency to election backend and campus gateway.
   - **Privileged Actions:** Safe browser restart, user session reload, and system self-check.
4. **Return to Voting Mode:** Press `Ctrl + Alt + Shift + L` or click **Return to Voting Kiosk**.

---

## 🌐 Network Resilience & Chaos Simulation

Test how the kiosk handles network drops, latency, or DNS failures:

### Using the PowerShell Helper:
```powershell
# Check current simulator status
.\simulate-network.ps1 -Action status

# Simulate complete network disconnect / gateway severance
.\simulate-network.ps1 -Action disconnect

# Simulate 2000ms latency
.\simulate-network.ps1 -Action latency -DelayMs 2000

# Simulate campus DNS failure
.\simulate-network.ps1 -Action dns-failure

# Restore network to normal healthy condition
.\simulate-network.ps1 -Action restore
```

### What Happens During Network Outage:
- The kiosk detects the disconnection via real-time heartbeat and browser network listeners.
- A modal **`Terminal Temporarily Offline`** overlay appears with the reassuring message **"Ballot Integrity Protected"**.
- Interactive inputs and ballot submissions are securely blocked.
- Once connectivity is restored (`.\simulate-network.ps1 -Action restore`), the overlay automatically dismisses.

---

## 🧪 Automated Playwright Test Suite

The lab includes end-to-end Playwright tests covering the entire voter journey, staff controls, and network resilience.

### Install Playwright Dependencies (One-time)
```powershell
cd D:\Codes\Projects\EVoting\testing\kiosk-lab
npm install
npx playwright install chromium
```

### Run All Tests
```powershell
npm test
```

### Run Tests in Headed Mode (Watch Browser Live)
```powershell
npm run test:headed
```

### Run Individual Test Suites
```powershell
# 1. Full 9-Portfolio Kiosk Workflow + NOTA + Review + Staff Maintenance
npm run test:workflow

# 2. Network Disconnection & Chaos Resilience
npm run test:resilience
```

### View Interactive HTML Test Report
```powershell
npm run test:report
```

---

## 🔄 Database Reset & Lab Teardown

### Reset Test Database to Pristine State
To wipe all cast ballots, reset student voted statuses to "unvoted", and re-seed the 9 portfolios without restarting containers:

```powershell
.\reset.ps1
```

### Stop & Tear Down Kiosk Lab
To safely stop and clean up all containers, networks, and temporary volumes:

```powershell
.\stop.ps1
```

To stop containers while preserving database volume data:
```powershell
.\stop.ps1 -KeepVolumes
```

---

## 📁 Directory Structure

```
testing/kiosk-lab/
├── .env.test                     # Isolated testing environment variables
├── docker-compose.yml            # 5-service testing compose definition
├── start.ps1                     # PowerShell lab starter with health checks
├── stop.ps1                      # PowerShell lab teardown script
├── reset.ps1                     # PowerShell clean seed database reset script
├── simulate-network.ps1          # PowerShell network chaos controller
├── README.md                     # Comprehensive documentation
├── package.json                  # Node.js dependencies for Playwright
├── playwright.config.js          # Playwright test configuration
├── docker/
│   ├── backend/
│   │   ├── Dockerfile            # Backend test container definition
│   │   └── entrypoint.sh         # Auto-migration & seed verification entrypoint
│   ├── kiosk-browser/
│   │   ├── Dockerfile            # Alpine X11 + Chromium + noVNC image
│   │   ├── supervisord.conf      # Supervisor multi-process manager
│   │   └── start-kiosk.sh        # Kiosk browser launcher with auto-retry
│   └── network-simulator/
│       ├── Dockerfile            # Chaos daemon Dockerfile
│       ├── app.py                # REST API for network failure simulation
│       └── requirements.txt      # Python dependencies
└── tests/
    ├── helpers/
    │   └── desk-api.js           # Desk officer login & PIN issuance helper
    ├── kiosk-workflow.spec.js    # 9-portfolio voting & staff maintenance spec
    └── network-resilience.spec.js# Offline overlay & network resilience spec
```
