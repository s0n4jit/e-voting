# User guide

## Election Officer

### First time
1. Open the portal. The installation wizard asks for institution details, logo, timezone and language, the slip ID letters (default `SUE`), your account, and the first election with its positions and programmes (a template with the college's departments is pre-filled).
2. Press **Install**, then **turn on two-step verification** with an authenticator app. This is required.

### Prepare the election
- **Programmes**: add programmes and departments, or import a CSV (`level,programme,department,terms`).
- **Elections → Edit details**: title, scheduled date and time, and positions. The positions list is ordered: use the arrows to move a position, ✕ to remove it, add your own, or bring back a standard one. The order is the order on the ballot and in the results. Positions can only be changed before voting opens.
- **Candidates**: add each candidate with a photo and department.
- **Desk Officers**: create an account for each person staffing a desk.
- **Voting booths**: generate booth tokens and set up each booth ([booth guide](KIOSK_SETUP.md)).

### Run the election
Move the election through its stages on the **Elections** page:

| Stage | Meaning |
|---|---|
| Setup | Configure everything |
| Registration | Desk Officers register students |
| Ready | Everything is prepared, voting not open yet |
| Voting active | Booths accept votes until you close voting. **Pause voting** stops votes for a break and **Resume voting** continues |
| Voting closed | No more votes. Booths reset and show "Voting has ended"; registration and PIN issue stop; unused PINs are cancelled |
| Results published | Results are unlocked for the officer |
| Archived | Finished; a new election can be created |

The scheduled date and time is shown to staff and voters for information only: **you** decide when voting starts (Open voting), pauses (Pause voting) and ends (Close voting). Positions and candidates lock when voting opens. Only one election runs at a time.

### Results
Nothing is visible until you press **Publish results**. Then open **Results**: **Present on projector** reveals one position at a time (Space or → to reveal and continue, ← to go back, F for full screen); **Create public link** shares the results with anyone; the CSV report is downloadable. Equal top votes show as a draw.

### Backup, reset and import
**Backup and reset** in the sidebar:
1. **Download a backup**: a ZIP with everything (settings, elections, candidates and photos, accounts, registrations, ballots, audit log). It holds password hashes and all ballots, so keep it offline and private.
2. **Reset the system**: erases all data and brings back the setup screen. It needs a backup downloaded in the last 30 minutes, your authenticator code, the word `RESET`, and voting must not be open.
3. **Import a backup**: after a reset, go through the setup screen with temporary details, turn on two-step verification, then import your ZIP. It replaces everything with the backup, so afterwards you sign in with the accounts from the backup. Authenticator secrets are not restored: the Election Officer is taken to the two-step verification set-up at the next sign-in (Desk Officers can set it up again in their profile).

### Your account
Click your name (top right): change your password (with the current password, or with an authenticator code if you forgot it), change your photo, manage two-step verification. The audit log lists every important action.

## Desk Officer

- **Register student**: name, programme, department or stream, semester or year → a Voter Slip ID is generated and can be printed. A warning appears if the same name is already registered for that programme and semester.
- **Import list** (Registrations page, and an optional step in the installation wizard): register many students from a CSV with the columns `name, programme, department, semester`. Programme and department must match the Programmes list. Nothing is imported unless every row is correct; duplicates are skipped; every student gets a Voter Slip ID and you can download the new slip IDs.
- **Remove all** (Election Officer, Registrations page, before voting opens): removes every student registered for the election, with their slips and PINs. The Registrations page only ever shows the current election's students.
- **Registrations**: search by name or slip ID, filter, edit details (until the student has voted), export a CSV. Statuses (Registered, PIN active, Voted) update live.
- **Voter slip and PIN**: every registered student already has a **voting PIN**, created with the slip and printed on it (registering at the desk, importing a list, or the installation wizard). Slips and PINs can be handed out before the election; on the day the student only goes to a booth and enters the slip ID and the PIN. The PIN works once and stays valid until it is used or voting closes.
- **Voter check-in** (lost PIN or slip): enter the slip ID, check the status, and **Issue voting PIN**. It replaces the old PIN. A PIN is cancelled after 5 wrong entries; issue a new one.

## Voter

1. Go to a free booth. The screen shows the election and the slip prefix, for example `SUE26-E1-`.
2. Type the **6 digits** of your slip ID and your **6-digit PIN**.
3. Read the instructions, choose one candidate (or *Abstain*) for each position, **Review**, then **Submit my vote**.
4. A confirmation appears and the booth clears itself for the next voter. Your vote cannot be changed and is never linked to your name.
