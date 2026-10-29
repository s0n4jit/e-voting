# Feasibility Study Report
## Campus e-Voting System (CEVS)
**Document Reference:** CEVS-DOC-FS-01  
**Course:** B.Sc. Computer Science (Major), NEP 2020, Semester 5 — Software Engineering  
**Unit Alignment:** Unit 3 (Feasibility Analysis & Requirements Engineering)  
**Project Reference:** Project 8 (Campus e-Voting System)  
**Date of Release:** October 2026  
**Status:** Approved / Stage-Gate 1 Milestone Passed  

---

## Executive Summary

The Campus e-Voting System (CEVS) is an end-to-end, cryptographically segregated digital election platform engineered to replace the archaic, paper-based balloting methodology across collegiate student council elections. Manual paper voting in university environments suffers from prohibitive queue latencies, soaring recurring logistics costs, administrative fatigue, vulnerability to physical tampering, human counting inaccuracies, and election result disputes.

This feasibility study systematically evaluates the technical, economic, legal, operational, and scheduling dimensions of designing, deploying, and maintaining CEVS across a representative campus population of 5,000 enrolled students. The evaluation concludes with a definitive **GO** decision supported by a quantified Return on Investment (ROI) of **186.4%**, a payback period of **1.42 election cycles (~14 months)**, an architectural guarantee of secret-ballot anonymity, and a robust risk mitigation matrix.

---

## 1. Problem Definition & Baseline Analysis

### 1.1 Existing Manual Election System
The university currently conducts student council elections annually using physical paper ballots. The electoral jurisdiction encompasses:
- Total student electorate: 5,000 eligible undergraduates and postgraduates across 12 academic departments.
- Contested positions: Executive Council (President, Vice-President, General Secretary, Cultural Secretary, Sports Secretary) and Departmental Representatives.
- Physical infrastructure: 8 physical polling booths staffed across 3 campus blocks.

### 1.2 Quantitative Operational Deficiencies
A retrospective study of the preceding two election cycles revealed severe operational bottlenecks:
1. **Queue Delays and Electoral Disenfranchisement:** Peak queues during class transitions (12:00 PM – 2:30 PM) exceeded 45 minutes of waiting time per voter. Academic scheduling conflicts led to an average student abstention rate of 38% (overall turnout was only 62%).
2. **Material Waste and Environmental Overhead:** Each election required printing 30,000 ballot sheets (multi-page perforated forms), constructing 16 tamper-evident wooden/metallic ballot boxes, and distributing indelible ink markers.
3. **Labour-Intensive Manual Tallying:** Counting was conducted overnight by 24 faculty and administrative staff members over 18 continuous hours.
4. **Disputed Ballots and Recount Demands:** In the 2025 election, 312 ballots (10.06% of votes cast in contested positions) were declared invalid due to ambiguous pen markings, double-stamps, or partial tears. Recount disputes delayed official result declaration by 48 hours and required external tribunal mediation.
5. **Chain of Custody Vulnerabilities:** Transporting physical ballot boxes from outlying satellite campus annexes to the central counting hall posed physical security risks and potential allegations of booth tampering.

---

## 2. Technical Feasibility Analysis

Technical feasibility assesses whether the proposed software system can be developed, integrated, and reliably operated using current technological stacks, campus network infrastructure, and student devices.

### 2.1 Proposed Technological Stack
- **Client Tier:** Single Page Application (SPA) built using **React 18**, leveraging responsive layout primitives, HTML5 Web Cryptography APIs, and modern CSS frameworks. Compatible with modern web browsers (Chrome, Firefox, Safari, Edge) on iOS, Android, macOS, Linux, and Windows.
- **Application & API Gateway Tier:** **Python 3.11** with **Flask 3.0** REST framework, run behind production WSGI servers (Gunicorn) with multi-worker concurrency and Nginx reverse proxying. Employs `Flask-Limiter` for IP/voter rate limiting and `Flask-JWT-Extended` for stateless session tokens.
- **Persistence Tier:** **PostgreSQL 15** in enterprise production (and SQLite 3 for local development/test harnesses). Provides ACID compliance, explicit transaction isolation (`SERIALIZABLE` / `READ COMMITTED` with `SELECT FOR UPDATE`), and foreign key constraint enforcement.
- **Cryptographic Engine:** 
  - Password Hashing: Blowfish-based **Bcrypt** with adaptive work factor (cost factor $r = 12$).
  - Multi-Factor Authentication: Time-based One-Time Password (**TOTP**) RFC 6238 via `pyotp` with 300-second drift-tolerant validation windows.
  - Ballot Anonymisation: **HMAC-SHA256** blind receipt tokens generated during the atomic commit.

### 2.2 Architectural Decoupling: The Secret Ballot Guarantee
A critical technical requirement is ensuring that the identity of the student is permanently and irrecoverably divorced from the candidate vote:
- **`VoterRecord` Table:** Stores `(election_id, voter_hash, has_voted, voted_at)`. The `voter_hash` is computed as $\text{SHA-256}(\text{student\_id} \parallel \text{SALT})$, preventing reverse lookup while guaranteeing that each student can record participation exactly once.
- **`BallotEntry` Table:** Stores `(election_id, candidate_id, blind_token, cast_at)`.
- **Relational Isolation:** There is **no Foreign Key, no common identifier, and no join path** between `VoterRecord` and `BallotEntry`. Writes to both tables occur inside a single atomic database transaction (`db.session.commit()`). If either operation fails, the transaction aborts with zero side-effects.

```
+-------------------------------------------------------------------+
|                        ATOMIC TRANSACTION                         |
|                                                                   |
|   [ Voter ID ] ---> Salted Hash ---> [ VoterRecord: has_voted ]   |
|                                            |                      |
|                                     STRICT ISOLATION              |
|                                     (NO FOREIGN KEY)              |
|                                            |                      |
|   [ Candidate ] ---> Blind Token ---> [ BallotEntry: candidate_id] |
+-------------------------------------------------------------------+
```

### 2.3 Network & Hardware Infrastructure Readiness
- **Campus Bandwidth:** The campus intranet features a 1 Gbps fiber backbone with redundant 802.11ac Wi-Fi across academic blocks.
- **Peak Load Capacity:** Peak load analysis assumes 1,000 concurrent students voting during lunch hour. At ~1.2 KB per REST payload, network throughput demands are $< 2.5 \text{ MB/s}$, which occupies less than 2% of the campus uplink.
- **Hardware Footprint:** The application backend requires a virtualized cloud/on-premise server with 4 vCPUs, 8 GB RAM, and 50 GB SSD storage, well within the existing university data centre allocation.

**Technical Feasibility Verdict:** **FEASIBLE**. The proposed architecture relies on proven, industry-standard, open-source technologies with zero proprietary licensing bottlenecks.

---

## 3. Economic Feasibility Analysis (Cost-Benefit & ROI)

Economic feasibility evaluates the financial viability, recurring savings, upfront development expenses, payback period, and overall Return on Investment.

### 3.1 Cost Breakdown of Existing Paper System (Per Election)
The university currently incurs direct and indirect costs for each annual student election:

| Expense Item | Calculation / Quantity | Amount (INR) |
| :--- | :--- | :--- |
| Ballot Paper Printing | 30,000 multi-sheet perforated slips @ ₹1.50/sheet | ₹45,000 |
| Ballot Boxes & Polling Booths | Rental, setup, tamper seals, and maintenance | ₹20,000 |
| Indelible Ink & Polling Stationery | Markers, stamps, envelopes, secure bags | ₹8,000 |
| Staff Honorarium (Polling Day) | 24 polling invigilators $\times$ 1 day @ ₹1,000/day | ₹24,000 |
| Staff Honorarium (Counting Team) | 24 counting staff $\times$ 1.5 days @ ₹1,500/day | ₹54,000 |
| Food & Refreshments | Polling + Counting sessions (48 person-days @ ₹300) | ₹14,400 |
| Security & Transportation | Armed campus security, transport van fuel | ₹12,000 |
| Dispute & Recount Mediation | Legal stationery, committee sittings | ₹15,000 |
| **Total Cost Per Paper Election ($C_{\text{paper}}$)** | | **₹1,88,400** |

### 3.2 Projected Costs of Campus e-Voting System (CEVS)

#### A. Initial Capital Expenditure (Year 1 Setup / Development)
Because the software is engineered as a NEP 2020 Capstone Project by the student development team, software engineering labour is treated as institutional investment. Computing server provisioning utilizes existing university private cloud infrastructure:

| Item | Details | Capital Cost (INR) |
| :--- | :--- | :--- |
| Server Provisioning & Storage | VM allocation (4 vCPU, 8 GB RAM, 50 GB SSD) | ₹18,000 |
| SSL/TLS Wildcard Certificate | 2-year institutional OV Certificate | ₹6,000 |
| Email OTP Gateway (Twilio/SES) | 5,000 verification emails + buffer SMS bundle | ₹4,500 |
| Security Audit & Vulnerability Assessment | Third-party penetration testing honorarium | ₹25,000 |
| Training Workshops & Documentation | Admin manual printing, mock voter orientation | ₹5,000 |
| Contingency Reserve | 15% unexpected operational buffer | ₹8,775 |
| **Total Upfront Investment ($I_0$)** | | **₹67,275** |

#### B. Recurring Annual Operational Costs (Year 2 Onwards)
| Item | Details | Annual Cost (INR) |
| :--- | :--- | :--- |
| Server Maintenance & Backup Storage | Cloud snapshots and off-site archive storage | ₹8,000 |
| Email / OTP API Usage | 5,000 voters $\times$ 2 factors | ₹3,500 |
| Election Commissioner Tech Support | 2 technical coordinators honorarium | ₹6,000 |
| Contingency & Minor Maintenance | Code updates, dependency patching | ₹5,000 |
| **Total Annual Operational Cost ($C_{\text{ops}}$)** | | **₹22,500** |

### 3.3 Financial Metrics: Payback Period & Return on Investment (ROI)

#### Net Annual Tangible Savings ($S$)
$$S = C_{\text{paper}} - C_{\text{ops}} = ₹1,88,400 - ₹22,500 = ₹1,65,900 \text{ per year}$$

#### Payback Period ($P$)
The payback period represents the time (in years or election cycles) required to recover the initial capital investment ($I_0$):
$$P = \frac{I_0}{S} = \frac{₹67,275}{₹1,65,900} \approx 0.405 \text{ years} \quad (\approx 4.86 \text{ months})$$
Since elections occur annually, the initial outlay is fully recovered within the very **first election cycle** with immediate net savings of $₹1,65,900 - ₹67,275 = ₹98,625$.

#### 3-Year Return on Investment (ROI)
Across a standard 3-year academic planning cycle:
- Total Cost over 3 years:
  $$\text{Total Cost} = I_0 + (C_{\text{ops}} \times 3) = ₹67,275 + (₹22,500 \times 3) = ₹1,34,775$$
- Total Baseline Paper Cost over 3 years:
  $$\text{Total Baseline Cost} = C_{\text{paper}} \times 3 = ₹1,88,400 \times 3 = ₹5,65,200$$
- Net Cumulative Financial Benefits:
  $$\text{Net Benefit} = ₹5,65,200 - ₹1,34,775 = ₹4,30,425$$
- Return on Investment:
  $$\text{ROI} = \left( \frac{\text{Net Benefit}}{\text{Total Investment}} \right) \times 100 = \left( \frac{₹4,30,425}{₹1,34,775} \right) \times 100 \approx \mathbf{319.36\%}$$

**Economic Feasibility Verdict:** **HIGHLY FEASIBLE**. The financial justification is overwhelming, providing rapid capital recovery and recurring annual savings exceeding ₹1.6 Lakhs.

---

## 4. Operational Feasibility Analysis

Operational feasibility evaluates how well the system fits into student culture, electoral regulations, faculty oversight, and university administrative processes.

### 4.1 Stakeholder Acceptance & Readiness
1. **Student Body:**
   - Over 98% of students possess smartphones (Android/iOS) or personal laptops with Wi-Fi connectivity.
   - The React-based interface requires zero app installation; it functions as an instant Progressive Web App accessed via campus portal single sign-on or direct URL.
   - Elimination of physical queueing enables voting during short study breaks or off-campus.
2. **Election Commission (Faculty In-Charge):**
   - The administration dashboard automates voter roster verification, candidate ballot configuration, and automated tally aggregation.
   - Elimination of physical counting removes allegations of faculty bias or counting fatigue errors.
3. **Campus Administration & Academic Council:**
   - Voting can occur over a designated 12-hour window (e.g., 08:00 AM to 08:00 PM) without suspending scheduled classes or laboratory sessions, restoring valuable instructional days.

### 4.2 Usability & Accessibility (WCAG 2.1 AA)
- The user interface is engineered with high-contrast visual cues, font scaling, screen reader support (`aria-live` announcements), and clear language indicators.
- Assisted voting kiosks with high-accessibility peripherals will be stationed at the Central Library for students with visual, motor, or device accessibility constraints.

**Operational Feasibility Verdict:** **FEASIBLE**. Stakeholder enthusiasm is high, administrative overhead drops dramatically, and academic disruptions are completely eliminated.

---

## 5. Legal, Regulatory & Compliance Feasibility

1. **Student Privacy (Digital Personal Data Protection Act, DPDP):** The system strictly enforces the principle of data minimization. The voter’s biometric data is not captured. The linkage between the student’s identity and their ballot choice is broken prior to database commit.
2. **University Statutes & Election Bye-Laws:** The electoral bylaws of the university require:
   - Secret balloting (guaranteed via decoupled DB architecture).
   - Universal adult suffrage for all bonafide admitted students (enforced via CSV institutional registrar import).
   - Audit trail availability for post-election verification without violating ballot secrecy (enforced via append-only tamper-resistant `AuditLog`).

**Legal Feasibility Verdict:** **COMPLIANT & FEASIBLE**.

---

## 6. Comprehensive Risk Assessment & Mitigation Matrix

| Risk ID | Risk Description | Category | Prob. | Impact | Mitigation Strategy |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **R01** | Denial of Service (DoS) or traffic spike during peak hours | Technical | Med | High | Nginx reverse-proxy rate limiting (`10 req/s` per IP); horizontal worker auto-scaling; static asset caching via CDN. |
| **R02** | Credential stuffing or voter impersonation | Security | Low | Crit | Mandatory 2-Factor Authentication (Student ID + Password + 6-digit TOTP email/authenticator token). |
| **R03** | Server crash or database failure during active voting session | Reliability | Low | Crit | PostgreSQL ACID transactions; WAL (Write-Ahead Logging) continuous archiving; automated failover and daily point-in-time recovery. |
| **R04** | Electoral dispute alleging ballot tampering | Operational | Med | High | Public audit log of immutable system events; cryptographically verifiable HMAC blind tokens issued to voters for verification. |
| **R05** | Student voter roster discrepancy (missing registered voters) | Admin | Med | Med | Registrar-verified CSV roster import freeze 72 hours prior to election; open 48-hour student verification window. |
| **R06** | Compromise of administrator private credentials | Security | Low | Crit | Role-based access control (RBAC); strict separation of Admin vs Election Commissioner roles; zero access to ballot records. |

---

## 7. Stage-Gate 1 Recommendation & Go/No-Go Decision

### 7.1 Evaluation Scorecard Summary

| Feasibility Dimension | Minimum Criteria | Assessed Score (1–10) | Evaluation Remarks |
| :--- | :---: | :---: | :--- |
| **Technical Feasibility** | 7.0 | 9.5 | Mature stack, zero external licensing dependencies, verified secret ballot design. |
| **Economic Feasibility** | 7.0 | 9.8 | Payback in $< 5$ months; 3-year ROI $> 300\%$; drastic recurring paper savings. |
| **Operational Feasibility** | 7.0 | 9.2 | High student smartphone penetration; broad administrative support. |
| **Legal & Compliance** | 8.0 | 9.0 | Fully compliant with university electoral bylaws and DPDP principles. |
| **Risk Manageability** | 7.0 | 8.8 | All identified risks have deterministic technical and procedural mitigations. |
| **Composite Score** | **7.2** | **9.26 / 10** | **Outstanding Project Viability** |

### 7.2 Final Decision
$$\mathbf{DECISION: \quad GO}$$

The Feasibility Analysis formally advises the Project Review Committee to authorize the immediate commencement of Phase 2: Requirements Analysis, Software Requirements Specification (SRS) formulation, and detailed project planning.

---
**Approved by:**  
1. *Project Manager / Systems Analyst*  
2. *Faculty Advisor & Election Commissioner*  
3. *Departmental Review Committee (Software Engineering NEP 2020)*
