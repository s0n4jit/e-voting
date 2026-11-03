# User guide

## Election Officer

### First time
1. Open the portal. The installation wizard asks for institution details, logo, timezone and language, the slip ID letters (default `SUE`), your account, and the first election with its positions and programmes.
2. Press **Install**, then **turn on two-step verification** with an authenticator app. This is mandatory for security.

### Prepare the election
- **Programmes**: Add programmes and departments, or import a CSV (`level,programme,department,terms`).
- **Elections → Edit details**: Title, scheduled date and time, and positions. Positions list can be reordered using arrows, removed with ✕, or customized. Positions lock when voting opens.
- **Candidates**: Add each candidate with name, department, semester/year, and photo. The built-in **Image Cropper Modal** provides 1:1 Square and 3:4 Portrait crop presets, zoom, pan, and real-time preview.
- **Desk Officers**: Create an account for each staff member operating registration desks.
- **Voting booths**: Generate single-use activation tokens (15-minute validity) and activate booths ([booth guide](KIOSK_SETUP.md)).
- **Settings → Display & Theme**: Toggle the **Enable Theme Toggle** switch (default: Off). When Off, voting booths and public interfaces are strictly locked to White (Light mode) and hide the theme toggle button.
- **Settings → Booth Printing**: Configure whether booths print vote copies silently, printer selection, and copy count.

### Run the election
Move the election through its stages on the **Elections** page:

| Stage | Meaning |
|---|---|
| **Setup** | Configure institution branding, election details, candidates, and programmes |
| **Registration** | Desk Officers register students and issue voting PIN slips |
| **Ready** | Booth terminals configured and approved; ready to open voting |
| **Voting active** | Booths accept votes until voting is closed. **Pause voting** temporarily halts ballots, and **Resume voting** re-opens them |
| **Voting closed** | Voting ends. Booths immediately reset to "Voting has ended"; student registration and PIN generation stop; unused PINs are cancelled |
| **Results published** | Results are revealed to the Election Officer and available for presentation |
| **Archived** | Election is finalized and preserved in audit records; a new election can now be created |

### Real-Time Live Monitoring
The **Overview**, **Results**, **Election Manager**, and **Kiosks** pages poll the server every 2000ms, providing real-time turnout numbers, live booth heartbeat states, and instant synchronization without manual browser refreshing.

### Results & Receipts
- **Present on Projector**: Reveals one position at a time (Space/→ to advance, ← to back, F for full screen).
- **Public Results Link**: Can be enabled or deleted anytime by the officer.
- **Vote Receipts**: Central repository of all voter receipts with vector PDF preview, browser print, and one-click ZIP download.
- **Descriptive Filenames**: All exported CSVs, ZIPs, and printable PDF documents automatically receive descriptive filenames based on the election title and document type.

### Backup, Reset and Import
1. **Download Backup**: An encrypted ZIP containing settings, elections, candidates, photos, voter records, and the audit log.
2. **Reset System**: Requires a backup downloaded within the past 30 minutes, TOTP authentication, and confirmation word `RESET`.
3. **Import Backup**: Restores portal state from a previously generated ZIP backup.

---

## Desk Officer

- **Register Student**: Name, programme, department, semester/year, and optional Roll/Enrollment No.
- **Status Badges**:
  - `No PIN yet`: Neutral slate gray (student registered, no active PIN)
  - `PIN issued`: Amber warning (PIN generated, ready for booth)
  - `Active`: Brand blue (voter currently authenticated at a voting booth)
  - `Voted`: Green (ballot successfully cast)
- **Standardized Field**: `Roll/Enrollment No.` is used consistently across registration tables, search filters, side panels, and printed slips.
- **Issue PINs**:
  - Clicking **Issue PIN** shows a dedicated card displaying the generated 6-digit PIN with a one-click **Copy PIN** button. The modal stays open so the officer can confirm or copy the PIN without losing context.
  - **Bulk Issue PINs**: Selecting multiple students and clicking **Issue PINs** opens a confirmation modal before bulk generation, ensuring browser responsiveness.
- **Import List**: Upload a CSV with columns `name, programme, department, semester, roll_no`. Duplicate names or roll numbers within the same programme are flagged.

---

## Voter (Kiosk Booth)

1. **Enter Slip ID**: Type the 6 digits printed on your voter slip.
   - The booth performs **silent real-time verification** against the server as you type.
   - Once verified, the input displays a green checkmark and **automatically jumps focus to the PIN field**.
2. **Enter PIN**: Type your 6-digit voting PIN using the on-screen NumPad or physical keyboard and click Continue.
3. **Voter Verification**:
   - The intro screen displays a structured credentials card immediately above the `"This is me, start voting →"` button.
   - Shows Student Name, Roll/Enrollment No., Semester (e.g. `3rd Sem`), and Programme in clean single-line rows.
   - Instructions state: *"Choose one candidate for each, or NOTA."*
4. **Cast Ballot**:
   - Fixed top header stays permanently anchored while scrolling.
   - Candidate position title stays sticky at the top with zero gap against the header.
   - Candidates are laid out **3 per row** (`grid-cols-3`) with large, clear 1:1 square photos and formatted classes: `Department of <Name> | Semester: <Num><Ordinal>`.
   - When 3 candidates fill up row 1, **NOTA appears on the 2nd line**.
5. **Review Choices**:
   - The screen **automatically scrolls down smoothly to the "Submit my vote" button**.
   - Review your selections across all positions, click **Change** on any position to modify, or click **Submit my vote**.
6. **Confirmation & Receipt**:
   - Ballot is cast securely and anonymously.
   - The silent thermal printer prints your vote copy slip to drop into the physical ballot box.
   - The booth automatically clears itself after 10 seconds for the next voter.
