# User guide

## Election Officer

### First time
1. Open the portal. The installation wizard asks for institution details, logo, timezone and language, the slip ID letters (default `SUE`), your account, and the first election with its positions and programmes.
2. Press **Install**, then **turn on two-step verification** with an authenticator app. This is mandatory for security.

### Prepare the election
- **Elections → Edit details**: Title, scheduled date and time, and positions. Positions list can be reordered using arrows, removed with ✕, or customized. Positions lock when voting opens.
- **Candidates**: Add each candidate with name, department, semester/year, bio, and photo. Edit existing candidate details anytime before voting starts. The built-in **Image Cropper Modal** provides a locked 1:1 Square crop preset, zoom, pan, and real-time preview.
- **Voter Slips**: Generate pre-issued slips for each booth. Download high-density **6-per-A4 printable sheets** featuring college logo, election title, voting date, booth number, voter slip ID, 4-digit PIN, cutting guides, and official voter instructions.
- **Voting booths**: Add and manage booth terminals. Contextual actions show **Setup Code** when unconfigured and **Revoke** when active (re-generating a fresh setup code).
- **Desk Officers**: Create accounts for desk officers to monitor sequential slips and voter traffic.
- **Settings → Display & Theme**: Toggle the **Enable Theme Toggle** switch. When Off, booths and public interfaces remain in clean high-contrast Light mode.
- **Settings → Booth Printing**: Configure VVPAT thermal printer settings and copy options.

### Run the election
Move the election through its stages on the **Elections** page:

| Stage | Meaning |
|---|---|
| **Setup** | Configure institution branding, election details, candidates, and initial booth setup |
| **Review / Registration** | Review nominations, verify physical voter rolls, and print A4 6-per-sheet voter slips |
| **Ready** | Booth terminals configured and approved; ready to open voting or run mock practice |
| **Voting active** | Booths accept sequential votes until voting is closed. **Pause voting** temporarily halts ballots, and **Resume voting** re-opens them |
| **Voting closed** | Voting ends. Booths immediately reset to "Voting has ended"; unused slips are closed |
| **Results published** | Results are revealed to the Election Officer and available for presentation |
| **Archived** | Election is finalized and preserved in audit records; a new election can now be created |

### Real-Time Live Monitoring & Security Attacks
- The **Overview**, **Results**, **Election Manager**, and **Kiosks** pages poll the server every 2000ms, providing real-time turnout numbers and live booth heartbeat states.
- The **Audit log** features dedicated real-time **Security & Attacks** monitoring that flags and logs unauthorized booth attempts, wrong PIN submissions, and tamper events with full IP and session tracking.

### Results & Receipts
- **Present on Projector**: Reveals one position at a time (Space/→ to advance, ← to back, F for full screen).
- **Public Results Link**: Can be enabled or deleted anytime by the officer.
- **Vote Receipts**: Central repository of all voter receipts with vector PDF preview, browser print, and one-click ZIP download.
- **Print Result Sheet**: Generates official certification letterhead with declared winners, vote counts, and signature lines for Election Officer, Returning Officer, and Principal.

---

## Polling & Desk Officer Workflow

1. **Station 1 (ID Verification)**: Polling officer verifies the student's physical institutional ID card.
2. **Station 2 (Physical Voter Roll)**: Polling officer takes the student's physical signature on the printed physical voter roll.
3. **Station 3 (Slip Distribution)**: Desk officer hands the voter their pre-printed voting slip containing their **Voter Slip ID** and **4-digit Voting PIN**.
4. **Slip Management**:
   - Filter by booth or status (`All`, `Unused`, `Active`, `Used`).
   - Download slips PDF directly from the upper dropdown (`All Booths` or specific `Booth`).
   - Void or cancel individual damaged or unissued slips with one click.

---

## Voter (Kiosk Booth)

1. **Sequential Slip ID**:
   - The voting booth automatically displays the prefilled sequential **Voter Slip ID** for that booth terminal.
2. **Enter 4-Digit PIN**:
   - The voter uses the mouse on the virtual on-screen numpad to enter the 4-digit voting PIN printed on their slip.
   - The system verifies the credentials against the server in real-time.
3. **Cast Ballot**:
   - Candidates are presented in clear cards with 1:1 square photos, department, and semester.
   - Choose one candidate per position, or select NOTA.
4. **Review Choices**:
   - The review screen displays all selected choices across all positions.
   - Click **Change** to modify any selection, or click **Submit my vote**.
5. **Confirmation & VVPAT**:
   - The ballot is recorded anonymously.
   - The connected silent thermal printer prints the **VVPAT** slip (showing election name, booth no, slip ID, timestamp, and choices).
   - The voter drops the VVPAT paper slip into the physical ballot box and exits the booth.
   - The booth automatically clears itself after 10 seconds for the next sequential voter.
