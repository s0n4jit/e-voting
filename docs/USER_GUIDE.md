# User guide

## Election Officer

### First time
1. Open the portal. The installation wizard asks for institution details, logo, timezone and language, the slip ID letters (default `SUE`), your account, and the first election with its positions and programmes (a template with the college's departments is pre-filled).
2. Press **Install**, then **turn on two-step verification** with an authenticator app. This is required.

### Prepare the election
- **Programmes**: add programmes and departments, or import a CSV (`level,programme,department,terms`).
- **Elections → Edit details**: title, voting start and end, positions (in the order voters see them).
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
| Voting active | Booths accept votes (inside the configured time window) |
| Voting closed | No more votes |
| Results published | Results are unlocked for the officer |
| Archived | Finished; a new election can be created |

Positions, candidates and the voting period lock when voting opens. Only one election runs at a time.

### Results
Nothing is visible until you press **Publish results**. Then open **Results**: **Present on projector** reveals one position at a time (Space or → to reveal and continue, ← to go back, F for full screen); **Create public link** shares the results with anyone; the CSV report is downloadable. Equal top votes show as a draw.

### Your account
Click your name (top right): change your password (with the current password, or with an authenticator code if you forgot it), change your photo, manage two-step verification. The audit log lists every important action.

## Desk Officer

- **Register student**: name, programme, department or stream, semester or year → a Voter Slip ID is generated and can be printed. A warning appears if the same name is already registered for that programme and semester.
- **Registrations**: search by name or slip ID, filter, edit details (until the student has voted), export a CSV. Statuses (Registered, PIN active, Voted) update live.
- **Voter check-in**: enter the slip ID, check the status, and **Issue voting PIN**. The PIN works once and for 20 minutes. Hand the student their slip and PIN.

## Voter

1. Go to a free booth. The screen shows the election and the slip prefix, for example `SUE26-E1-`.
2. Type the **6 digits** of your slip ID and your **6-digit PIN**.
3. Read the instructions, choose one candidate (or *Abstain*) for each position, **Review**, then **Submit my vote**.
4. A confirmation appears and the booth clears itself for the next voter. Your vote cannot be changed and is never linked to your name.
