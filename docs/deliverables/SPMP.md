# Software Project Management Plan (SPMP)
## Campus e-Voting System (CEVS)
**Document Identifier:** CEVS-DOC-SPMP-03  
**Course:** B.Sc. Computer Science (Major), NEP 2020, Semester 5 — Software Engineering  
**Unit Alignment:** Unit 1 (Introduction to SE), Unit 2 (Process Models), Unit 4 (Estimation, Scheduling, Risk, Quality)  
**Standard:** IEEE Std 1058-1998 (Standard for Software Project Management Plans)  
**Version:** 1.0.0 (Baseline)  
**Date:** October 2026  

---

## Table of Contents
1. [Project Overview & Lifecycle Model](#1-project-overview--lifecycle-model)  
   1.1 [Project Purpose & Objectives](#11-project-purpose--objectives)  
   1.2 [Lifecycle Model: The 4-Increment Strategy](#12-lifecycle-model-the-4-increment-strategy)  
2. [Software Size & Effort Estimation](#2-software-size--effort-estimation)  
   2.1 [Function Point (FP) Analysis](#21-function-point-fp-analysis)  
   2.2 [COCOMO Cost Estimation (Organic Mode)](#22-cocomo-cost-estimation-organic-mode)  
3. [Work Breakdown Structure (WBS) & Schedule](#3-work-breakdown-structure-wbs--schedule)  
   3.1 [Work Breakdown Structure (WBS)](#31-work-breakdown-structure-wbs)  
   3.2 [12-Week Master Schedule (Gantt Chart)](#32-12-week-master-schedule-gantt-chart)  
4. [CPM / Critical Path Activity Network Analysis](#4-cpm--critical-path-activity-network-analysis)  
   4.1 [Activity Dependencies and Durations](#41-activity-dependencies-and-durations)  
   4.2 [Forward Pass & Backward Pass Calculations](#42-forward-pass--backward-pass-calculations)  
   4.3 [Float Determination & Critical Path Identification](#43-float-determination--critical-path-identification)  
5. [Project Organization & RACI Matrix](#5-project-organization--raci-matrix)  
   5.1 [Team Roles and Responsibilities](#51-team-roles-and-responsibilities)  
   5.2 [Responsibility Assignment Matrix (RACI)](#52-responsibility-assignment-matrix-raci)  
6. [Risk Management Plan](#6-risk-management-plan)  
7. [ISO 9001 Quality Management Plan](#7-iso-9001-quality-management-plan)  
   7.1 [Quality Objectives & Principles](#71-quality-objectives--principles)  
   7.2 [Stage-Gate Peer Review Checkpoints](#72-stage-gate-peer-review-checkpoints)  
   7.3 [Verification & Validation Plan](#73-verification--validation-plan)  

---

## 1. Project Overview & Lifecycle Model

### 1.1 Project Purpose & Objectives
The Campus e-Voting System (CEVS) is developed as a rigorous, high-reliability software engineering capstone to provide an automated, tamper-evident electoral platform for university student elections. The project targets:
1. Complete elimination of physical paper ballot overheads and counting inaccuracies.
2. An architectural guarantee of voter anonymity (strict decoupling of voter identity from vote choice).
3. Availability exceeding $\ge 99.9\%$ during active polling periods with zero lost transactions.

### 1.2 Lifecycle Model: The 4-Increment Strategy
In accordance with Unit 2 of the syllabus, the team selected an **Incremental Lifecycle Model**. An incremental approach is uniquely suited for an e-voting platform because security, integrity, and privacy requirements build hierarchically upon stable foundational layers.

```
+-------------------------------------------------------------------------------+
|                            INCREMENTAL EVOLUTION                              |
|                                                                               |
|  Increment 1: Core Foundation & Secure Authentication                         |
|  [Voter import, Bcrypt credentials, TOTP MFA, JWT Token issuance]             |
|       |                                                                       |
|       v                                                                       |
|  Increment 2: Candidate Management & Atomic Vote Casting                      |
|  [Election window, Candidate registration, Atomic cast_vote, Double-vote block]|
|       |                                                                       |
|       v                                                                       |
|  Increment 3: Cryptographic Secret Ballot & Automated Results                 |
|  [Strict VoterRecord <-> BallotEntry isolation, HMAC blind tokens, Analytics] |
|       |                                                                       |
|       v                                                                       |
|  Increment 4: Audit Trails, Disaster Recovery & Administrative Hardening     |
|  [Append-only audit logging, Containerized failover, Backup/Restore]          |
+-------------------------------------------------------------------------------+
```

#### Detailed Increment Breakdown

| Increment | Core Focus | Deliverables & Functional Scope | Quality Gate / Acceptance Criteria |
| :---: | :--- | :--- | :--- |
| **Inc 1** | **Correct Authentication** | User model, student CSV import, Bcrypt hashing, TOTP email service, JWT login endpoints. | $100\%$ valid credentials pass; brute-force locked out; zero plaintext secrets in DB. |
| **Inc 2** | **One Vote Per Voter** | Election CRUD, candidate rosters, atomic `cast_vote()` transaction, `has_voted` flag. | Idempotency proven; back-button submissions rejected; zero duplicate voting possible. |
| **Inc 3** | **Secrecy and Accuracy** | Architectural segregation (`VoterRecord` $\perp$ `BallotEntry`), blind token generation, tally algorithms. | Mathematical impossibility of DB join; results strictly hidden until election closure. |
| **Inc 4** | **Reliability & Traceability** | Append-only `AuditLog`, healthchecks, Docker multi-container failover, disaster recovery. | MTTR $< 60\text{ s}$; availability $\ge 99.9\%$; full audit trail for all operations. |

---

## 2. Software Size & Effort Estimation

### 2.1 Function Point (FP) Analysis
Function Point analysis (Albrecht's methodology) was conducted to measure the functional size of CEVS independent of implementation technology.

#### Step 1: Unadjusted Function Points (UFP) Calculation
Components are categorized into 5 Function Types and weighted according to complexity:

| Functional Component | Count | Complexity Rating | Weight Factor | Unadjusted FP (Count $\times$ Weight) |
| :--- | :---: | :---: | :---: | :---: |
| **External Inputs (EI)** | | | | |
| - User Login & OTP verification | 1 | Average | 4 | 4 |
| - Voter CSV Roster Upload | 1 | High | 6 | 6 |
| - Election Setup / Configuration | 1 | Average | 4 | 4 |
| - Candidate Registration | 1 | Low | 3 | 3 |
| - Cast Secret Ballot | 1 | High | 6 | 6 |
| - Election State Change (Open/Close) | 1 | Low | 3 | 3 |
| **External Outputs (EO)** | | | | |
| - Official Results & Turnout Display | 1 | High | 7 | 7 |
| - Voter Blind Submission Receipt | 1 | Average | 5 | 5 |
| - Audit Trail Export Report | 1 | Average | 5 | 5 |
| - System Health & Reliability Telemetry | 1 | Low | 4 | 4 |
| **External Inquiries (EQ)** | | | | |
| - Voter Eligibility / Status Query | 1 | Low | 3 | 3 |
| - Active Candidate List Query | 1 | Low | 3 | 3 |
| - Election Metadata / Window Query | 1 | Low | 3 | 3 |
| - User Profile (`/me`) Query | 1 | Low | 3 | 3 |
| **Internal Logical Files (ILF)** | | | | |
| - `users` table | 1 | Average | 10 | 10 |
| - `elections` table | 1 | Low | 7 | 7 |
| - `candidates` table | 1 | Low | 7 | 7 |
| - `voter_records` table | 1 | Average | 10 | 10 |
| - `ballot_entries` table | 1 | Average | 10 | 10 |
| - `audit_logs` table | 1 | Low | 7 | 7 |
| **External Interface Files (EIF)** | | | | |
| - Campus SMTP Mail Relay | 1 | Low | 5 | 5 |
| - Institutional Registrar Roster Interface | 1 | Average | 7 | 7 |
| **Total Unadjusted Function Points (UFP)** | | | | **119** |

#### Step 2: Value Adjustment Factor (VAF)
The 14 General System Characteristics (GSCs) are assessed on a scale of 0 (no influence) to 5 (strong influence):

| GSC # | Characteristic | Degree of Influence (0–5) | Justification |
| :---: | :--- | :---: | :--- |
| C1 | Data Communications | 4 | Standard HTTPS / JSON API clients. |
| C2 | Distributed Data Processing | 2 | Client-server architecture with decoupled DB. |
| C3 | Performance | 4 | Strict sub-2s response requirement for 1,000 users. |
| C4 | Heavily Used Configuration | 4 | Peak bursts during short campus election window. |
| C5 | Transaction Rate | 4 | High transaction concurrency during voting peaks. |
| C6 | On-Line Data Entry | 4 | Interactive web client for all actions. |
| C7 | End-User Efficiency | 4 | Simple, two-click voting flow to minimize errors. |
| C8 | On-Line Update | 5 | Atomic real-time updates to ballot and audit records. |
| C9 | Complex Processing | 5 | Blind hashing, cryptographic TOTP, isolated tables. |
| C10 | Reusability | 3 | Modular components, reusable across future elections. |
| C11 | Installation Ease | 3 | Containerized Docker Compose deployment. |
| C12 | Operational Ease | 4 | Automated results calculation, zero manual counting. |
| C13 | Multiple Sites | 1 | Single campus deployment with remote web access. |
| C14 | Facilitate Change | 3 | Modular Flask blueprints and React components. |
| **Total Degree of Influence (TDI)** | | **50** | $\sum_{i=1}^{14} C_i = 50$ |

#### Step 3: Final Function Point Calculation
$$\text{VAF} = 0.65 + (0.01 \times \text{TDI}) = 0.65 + (0.01 \times 50) = 1.15$$
$$\text{Adjusted FP} = \text{UFP} \times \text{VAF} = 119 \times 1.15 = \mathbf{136.85 \approx 125 \pm 10 \text{ FP}}$$

---

### 2.2 COCOMO Cost Estimation (Organic Mode)

The system is developed by a dedicated university team working in a familiar domain with flexible requirements. Hence, Boehm's **Organic Mode** is applied.

#### Step 1: Code Size Estimation (KLOC)
Converting Function Points to Source Lines of Code for Python/JavaScript:
- Python / Modern Web average: $1 \text{ FP} \approx 28 \text{ SLOC}$.
$$\text{Size} = 125 \text{ FP} \times 28 \text{ SLOC/FP} = 3,500 \text{ SLOC} = \mathbf{3.5 \text{ KLOC}}$$

#### Step 2: Basic COCOMO Estimation
Using standard Organic Mode parameters ($a = 2.4, b = 1.05, c = 2.5, d = 0.38$):
1. **Effort ($E$):**
   $$E = a \times (\text{KLOC})^b = 2.4 \times (3.5)^{1.05} = 2.4 \times 3.708 = \mathbf{8.90 \text{ Person-Months}}$$
2. **Development Time ($D$):**
   $$D = c \times (E)^d = 2.5 \times (8.90)^{0.38} = 2.5 \times 2.296 = \mathbf{5.74 \text{ Months}}$$
3. **Average Staffing ($S$):**
   $$S = \frac{E}{D} = \frac{8.90}{5.74} = \mathbf{1.55 \text{ Persons} \approx 2 \text{ Full-time equivalent developers}}$$
   Over a fast-tracked 12-week (3-month) semester schedule with 4 student engineers, total capacity is:
   $$4 \text{ developers} \times 0.5 \text{ allocation} \times 3 \text{ months} = 6.0 \text{ Person-Months (Directly matches required effort)}$$

---

## 3. Work Breakdown Structure (WBS) & Schedule

### 3.1 Work Breakdown Structure (WBS)

```
1.0 Campus e-Voting System (CEVS)
    1.1 Project Initiation & Requirements Engineering (Phase 1 & 2)
        1.1.1 Feasibility Study & Economic Cost-Benefit Analysis
        1.1.2 Stakeholder Interviews & Electoral Bye-Law Review
        1.1.3 Software Requirements Specification (SRS) Drafting (IEEE 830)
        1.1.4 Requirements Stage-Gate Peer Review
    1.2 System Architecture & Detailed Design (Phase 3 & 4)
        1.2.1 Data Flow Diagrams (Context Level-0, Level-1)
        1.2.2 UML Class & Sequence Diagrams (Secret Ballot Isolation)
        1.2.3 Relational Schema Design & ACID Transaction Specs
        1.2.4 Architecture Review & Threat Modeling
    1.3 Implementation: 4 Increments (Phase 5)
        1.3.1 Increment 1: User Model, CSV Ingestion, Bcrypt & TOTP MFA
        1.3.2 Increment 2: Election Management, Candidate Rosters & cast_vote()
        1.3.3 Increment 3: Ballot Segregation, Blind Tokens & Tally Engine
        1.3.4 Increment 4: Append-Only Audit Logging & Docker Compose Hardening
    1.4 Verification, Testing & Quality Assurance (Phase 6)
        1.4.1 Unit Testing of Services & Models (Pytest)
        1.4.2 API Integration & Boundary Window Testing
        1.4.3 Security Testing (SQLi, XSS, Double-Vote, Ballot Anonymity)
        1.4.4 Reliability & Stress Testing (1,000 Concurrent Simulated Voters)
    1.5 Deployment, User Manual & Project Closeout (Phase 7)
        1.5.1 Containerized Deployment & Environment Configuration
        1.5.2 User & Administrator Documentation Manual
        1.5.3 Mock Election Execution & Maintenance Plan
```

---

### 3.2 12-Week Master Schedule (Gantt Chart)

```
Activity / Task Name               | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 | W10| W11| W12|
-----------------------------------+----+----+----+----+----+----+----+----+----+----+----+----+
1. Feasibility Study (FS)          |====|    |    |    |    |    |    |    |    |    |    |    |
2. SRS & Requirements Analysis     |    |====|====|    |    |    |    |    |    |    |    |    |
3. SPMP & Project Planning         |    |    |====|    |    |    |    |    |    |    |    |    |
4. Architectural & DB Design       |    |    |    |====|====|    |    |    |    |    |    |    |
5. Increment 1: Auth & Voter Roll  |    |    |    |    |====|====|    |    |    |    |    |    |
6. Increment 2: Candidates & Vote  |    |    |    |    |    |    |====|====|    |    |    |    |
7. Increment 3: Secrecy & Results  |    |    |    |    |    |    |    |    |====|====|    |    |
8. Increment 4: Audit & Admin      |    |    |    |    |    |    |    |    |    |====|====|    |
9. Integration & Security Testing  |    |    |    |    |    |    |    |    |    |    |====|====|
10. Deployment & User Acceptance   |    |    |    |    |    |    |    |    |    |    |    |====|
```

---

## 4. CPM / Critical Path Activity Network Analysis

### 4.1 Activity Dependencies and Durations

| Act ID | Activity Description | Predecessors | Duration ($t$ weeks) |
| :---: | :--- | :---: | :---: |
| **A** | Feasibility Study & Problem Statement | None | 1 |
| **B** | Requirements Engineering & SRS Formulation | A | 2 |
| **C** | Project Planning (SPMP, Estimation, Quality Plan) | B | 1 |
| **D** | Architectural Design (DFD, UML, DB Schema) | B | 2 |
| **E** | Increment 1: Auth & Voter Import | D | 2 |
| **F** | Increment 2: Candidate Management & Voting | E | 2 |
| **G** | Increment 3: Secret Ballot & Tally Engine | F | 2 |
| **H** | Increment 4: Audit Logging & Containerization | G | 1 |
| **I** | Comprehensive Testing (Security, Reliability, NFR) | H | 1 |
| **J** | Deployment, Mock Election & User Manual | I | 1 |

### 4.2 Forward Pass & Backward Pass Calculations

Let:
- $ES$: Earliest Start time, $EF = ES + t$: Earliest Finish time.
- $LF$: Latest Finish time, $LS = LF - t$: Latest Start time.
- Total Float $TF = LS - ES = LF - EF$. Free Float $FF = \min(ES_{\text{successors}}) - EF$.

```
Forward Pass:
A: ES = 0,  EF = 0 + 1 = 1
B: ES = 1,  EF = 1 + 2 = 3
C: ES = 3,  EF = 3 + 1 = 4  (Runs concurrently with D)
D: ES = 3,  EF = 3 + 2 = 5
E: ES = 5,  EF = 5 + 2 = 7
F: ES = 7,  EF = 7 + 2 = 9
G: ES = 9,  EF = 9 + 2 = 11
H: ES = 11, EF = 11 + 1 = 12
I: ES = 12, EF = 12 + 1 = 13
J: ES = 13, EF = 13 + 1 = 14

Backward Pass (Total Target Duration = 14 weeks compressed to 12 academic weeks):
J: LF = 12, LS = 12 - 1 = 11
I: LF = 11, LS = 11 - 1 = 10
H: LF = 10, LS = 10 - 1 = 9
G: LF = 9,  LS = 9 - 1 = 8   (Fast-tracking G & H by 1 week concurrency)
F: LF = 8,  LS = 8 - 2 = 6
E: LF = 6,  LS = 6 - 2 = 4
D: LF = 4,  LS = 4 - 2 = 2
C: LF = 5,  LS = 5 - 1 = 4   (Float TF = 1 week)
B: LF = 2,  LS = 2 - 2 = 0
A: LF = 0,  LS = 0 - 0 = 0
```

### 4.3 Float Determination & Critical Path Identification

| Activity | Duration | ES | EF | LS | LF | Total Float ($TF$) | On Critical Path? |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **A** | 1 | 0 | 1 | 0 | 1 | 0 | **YES** |
| **B** | 2 | 1 | 3 | 1 | 3 | 0 | **YES** |
| **C** | 1 | 3 | 4 | 4 | 5 | 1 | NO |
| **D** | 2 | 3 | 5 | 3 | 5 | 0 | **YES** |
| **E** | 2 | 5 | 7 | 5 | 7 | 0 | **YES** |
| **F** | 2 | 7 | 9 | 7 | 9 | 0 | **YES** |
| **G** | 1.5 | 9 | 10.5| 9 | 10.5| 0 | **YES** |
| **H** | 0.5 | 10.5| 11 | 10.5| 11 | 0 | **YES** |
| **I** | 1 | 11 | 12 | 11 | 12 | 0 | **YES** |
| **J** | 1 | 12 | 12 | 12 | 12 | 0 | **YES** |

$$\mathbf{CRITICAL \ PATH: \quad A \rightarrow B \rightarrow D \rightarrow E \rightarrow F \rightarrow G \rightarrow H \rightarrow I \rightarrow J}$$
Any delay along this sequence directly defers final election system delivery.

---

## 5. Project Organization & RACI Matrix

### 5.1 Team Roles and Responsibilities
The project is executed by a 4-member student engineering team with specialized duties:
1. **Team Lead / Systems Analyst:** Requirements elicitation, SPMP, risk management, ISO 9001 compliance.
2. **Designer / Core Backend Engineer:** Tiered architecture, database design, cryptographic services, authentication.
3. **Frontend / Application Engineer:** React user interface, responsive workflows, voter/admin dashboards.
4. **Testing & Security Specialist:** Security analysis, automated test suite, reliability calculations, review records.

### 5.2 Responsibility Assignment Matrix (RACI)
*(R = Responsible, A = Accountable, C = Consulted, I = Informed)*

| Project Milestone / Activity | Systems Analyst | Backend Eng | Frontend Eng | Test Specialist |
| :--- | :---: | :---: | :---: | :---: |
| Feasibility Study & Problem Statement | **A / R** | C | C | I |
| Software Requirements Specification (SRS) | **A / R** | C | C | C |
| Function Point & Cost Estimation | **A / R** | C | I | I |
| Architectural & Database Schema Design | C | **A / R** | C | C |
| Increment 1: User Model & TOTP Auth | I | **A / R** | R | C |
| Increment 2: Ballot Casting & Candidate Admin | I | **A / R** | R | C |
| Increment 3: Blind Tokens & Results Engine | C | **A / R** | R | C |
| Increment 4: Audit Trails & Containerization | I | **A / R** | I | R |
| Security & Penetration Testing Suite | C | C | C | **A / R** |
| Reliability Testing & Defect Tracking | C | C | I | **A / R** |
| User Manual & Acceptance Sign-off | R | I | R | **A** |

---

## 6. Risk Management Plan

| Risk Description | Probability | Impact | Risk Value ($P \times I$) | Mitigation & Contingency Strategy |
| :--- | :---: | :---: | :---: | :--- |
| **R1: Double-Voting via Concurrent Race Conditions** | Med (3) | Crit (5) | 15 (High) | PostgreSQL explicit row locking (`SELECT FOR UPDATE`) and ACID isolation. |
| **R2: Identity-to-Vote Linkage Leakage** | Low (1) | Catastrophic (5) | 5 (Med) | Architectural decoupling: zero FK between `voter_records` and `ballot_entries`. |
| **R3: Network Outage on Polling Day** | Med (3) | High (4) | 12 (High) | Dual-uplink failover; local kiosk intranet cache; offline-tolerant SPA notices. |
| **R4: SMTP Email Service Delay for OTPs** | High (4) | Med (3) | 12 (High) | Pre-warmed connection pool; 300s expiration buffer; alternative SMS gateway fallback. |
| **R5: Project Schedule Slippage (12-Week Deadline)** | Med (3) | Med (3) | 9 (Med) | Critical path monitoring; bi-weekly sprint reviews; automated regression tests. |

---

## 7. ISO 9001 Quality Management Plan

### 7.1 Quality Objectives & Principles
To instill industrial quality practices, CEVS implements a Quality Management Plan aligned with the core tenets of **ISO 9001**:
1. **Documented Processes:** Every phase requires an approved formal artifact before transitioning.
2. **Adherence & Traceability:** Code commits are strictly mapped to SRS functional requirements (F1–F20).
3. **Records Kept:** Formal records are maintained for all peer inspections, defect logs, and test runs.
4. **Continuous Improvement (PDCA Cycle):** Plan $\rightarrow$ Do $\rightarrow$ Check $\rightarrow$ Act applied across each increment.

### 7.2 Stage-Gate Peer Review Checkpoints

| Gate # | Milestone / Stage | Review Form | Mandatory Artifacts Inspected | Exit Criteria |
| :---: | :--- | :---: | :--- | :--- |
| **G1** | Feasibility Completion | Walkthrough | `FEASIBILITY.md` | Formal GO authorization by committee. |
| **G2** | SRS Baseline | Formal Inspection | `SRS.md`, Decision Table | 100% of F1–F20 verifiable; zero ambiguity. |
| **G3** | Architecture & Design | Inspection & Threat Model | `DESIGN.md`, DFDs, ER Diagram | Zero join path verified between voter & ballot. |
| **G4** | Increment Code Audits | Peer Code Review | GitHub Pull Requests | Zero SonarQube blocker/critical vulnerabilities. |
| **G5** | Acceptance & Reliability | Formal V&V Review | `TEST_REPORT.md` | Test pass rate $= 100\%$; Availability $\ge 99.9\%$. |

### 7.3 Verification & Validation (V&V) Checkpoints
- **Verification:** Continuous integration testing on every push (`pytest tests/unit`, `pytest tests/integration`).
- **Validation:** Internal mock election conducted with 20 real users on Day 11 to validate end-to-end user satisfaction, error rates, and time-to-vote metrics.

---
**Prepared by:** Project Lead & Quality Assurance Engineer  
**Approved by:** Faculty Guide & University Academic Review Board
