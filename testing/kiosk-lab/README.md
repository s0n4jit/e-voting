# Campus E-Voting System (CEVS) — Windows Kiosk Testing Lab

This testing lab provides a complete, self-contained environment to test the **examination-style locked voting booth**, **staff maintenance shortcuts**, and **multi-tier network diagnostics** on a Windows 10/11 laptop without rebooting into Ubuntu or dual-booting.

---

## 1. Prerequisites
* **Windows 10 / 11** with WSL2 enabled.
* **Docker Desktop** installed and running.
* **PowerShell 5.1+** or **PowerShell 7+**.

---

## 2. Quick Start on Windows

Open a PowerShell terminal in `testing/kiosk-lab/` and run:

```powershell
.\start.ps1
```

The script will automatically:
1. Verify Docker Engine status.
2. Spin up isolated test containers (`cevs_test_db`, `cevs_test_backend`, `cevs_test_frontend`, `cevs_kiosk_browser_sim`).
3. Seed the test database with sample voters (`STU001`–`STU020`), polling desk officers (`DESK001`, `DESK002`), and 9 union executive portfolios.
4. Output the live testing URLs.

---

## 3. Testing Interfaces & Access Points

| Component | URL | Description |
| :--- | :--- | :--- |
| **Kiosk Web Application** | [http://localhost:3001/kiosk](http://localhost:3001/kiosk) | Direct web kiosk interface in any Windows browser. |
| **Linux noVNC Kiosk Simulator** | [http://localhost:8080](http://localhost:8080) | Live interactive Linux GUI browser container running in strict kiosk mode. |
| **Physical Polling Desk Portal** | [http://localhost:3001/desk](http://localhost:3001/desk) | Desk officer portal to look up students and issue single-use PIN slips. |
| **Staff Maintenance Panel** | `Ctrl + Alt + Shift + M` | Opens maintenance modal on kiosk screen (Default PIN: `948201`). |
| **Diagnostics REST Endpoint** | [http://localhost:5001/api/maintenance/diagnostics](http://localhost:5001/api/maintenance/diagnostics) | Real-time multi-tier network and hardware diagnostic status. |

---

## 4. Staff Keyboard Shortcuts

When viewing the kiosk interface, electoral staff can press:

* **`Ctrl + Alt + Shift + M`**: Open the Staff Maintenance Panel.
* **`Ctrl + Alt + Shift + N`**: Open directly to Network Diagnostics.
* **`Ctrl + Alt + Shift + R`**: Open Reboot Booth confirmation dialog.
* **`Ctrl + Alt + Shift + L`**: Instantly return to the voting kiosk interface.
* **`Ctrl + Alt + Shift + T`**: Re-run multi-tier network connectivity probe.

---

## 5. Automated Playwright Testing

To run the automated browser tests:

```powershell
# Install test dependencies (one-time)
npm install

# Run test suite
npx playwright test

# Run tests with visible browser window
npx playwright test --headed
```

---

## 6. Stopping & Resetting the Lab

```powershell
# Stop all testing containers
.\stop.ps1

# Reset test database to initial state (guaranteed zero impact on production)
.\reset.ps1
```
