# Windows Testing Environment Guide (`testing/kiosk-lab/`)

## Overview
Developers and election commissioners running **Windows 10 or 11** can test the complete physical voting booth experience, staff maintenance controls, and network resilience without rebooting into Ubuntu, installing a virtual machine hypervisor, or requiring a secondary laptop.

---

## 1. Architecture of the Windows Testing Lab

```
[ Windows 10/11 Host Machine ]
   │
   ├── PowerShell Runner: start.ps1 / stop.ps1 / reset.ps1
   │
   └── Docker Engine (WSL2 Backend)
        │
        ├── [ cevs_test_db ] ────────── PostgreSQL 15 on Port 5433 (Isolated evoting_test_db)
        │
        ├── [ cevs_test_backend ] ───── Flask Testing API on Port 5001
        │
        ├── [ cevs_test_frontend ] ──── Nginx React App on Port 3001
        │
        └── [ cevs_kiosk_browser_sim ]  Linux GUI Chromium with noVNC on Port 8080
```

---

## 2. Running the Lab on Windows

### Launching the Environment:
Open PowerShell in `testing/kiosk-lab/` and run:

```powershell
.\start.ps1
```

### Accessing Services:
* **Web Voting Kiosk**: [http://localhost:3001/kiosk](http://localhost:3001/kiosk)
* **Linux noVNC Kiosk Simulator**: [http://localhost:8080](http://localhost:8080)
* **Physical Polling Desk**: [http://localhost:3001/desk](http://localhost:3001/desk) (Login: `DESK001` / `Desk@1234`)
* **Chief Election Officer**: [http://localhost:3001/login](http://localhost:3001/login) (Login: `ADMIN001` / `Admin@1234`)

### Testing Maintenance Shortcuts on Windows:
In either your native Windows browser or the noVNC simulator:
* Press **`Ctrl + Alt + Shift + M`**.
* When prompted for Staff Security PIN, enter: **`948201`**.
* The maintenance dashboard will unlock, displaying system metrics and multi-tier network tests.

---

## 3. Automated Playwright Test Execution

The lab includes automated end-to-end tests for the entire voter journey, staff shortcuts, and network offline resilience:

```powershell
cd testing/kiosk-lab

# Install Playwright dependencies (first run only)
npm install
npx playwright install chromium

# Execute automated tests headlessly
npm test

# Or run tests in visual headed mode
npm run test:headed
```

---

## 4. Resetting and Teardown

```powershell
# Reset test database to clean seed state (STU001-STU020, clean tallies)
.\reset.ps1

# Stop all lab containers safely
.\stop.ps1
```
