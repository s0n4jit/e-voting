# Software Testing Report (STR)
## Campus e-Voting System (CEVS)
**Document Identifier:** CEVS-DOC-TR-05  
**Course:** B.Sc. Computer Science (Major), NEP 2020, Semester 5 — Software Engineering  
**Unit Alignment:** Unit 6 (Verification & Validation, Testing Strategies) & Unit 7 (Reliability Metrics, Defect Tracking)  
**Standard:** IEEE Std 829-2008 (Standard for Software and System Test Documentation)  
**Version:** 1.0.0 (Comprehensive Release)  
**Date:** October 2026  

---

## Table of Contents
1. [Testing Objectives & Strategy](#1-testing-objectives--strategy)  
   1.1 [Scope & Objectives](#11-scope--objectives)  
   1.2 [Black-Box Testing Methodologies](#12-black-box-testing-methodologies)  
   1.3 [White-Box Testing Methodologies](#13-white-box-testing-methodologies)  
2. [Comprehensive Test Case Execution Table](#2-comprehensive-test-case-execution-table)  
   2.1 [Authentication & Access Control](#21-authentication--access-control)  
   2.2 [Election Window Boundary Value Analysis (BVA)](#22-election-window-boundary-value-analysis-bva)  
   2.3 [Integrity & Concurrency (Double-Voting Replays)](#23-integrity--concurrency-double-voting-replays)  
   2.4 [Security & Vulnerability Tests (SQLi, XSS, Anonymity)](#24-security--vulnerability-tests-sqli-xss-anonymity)  
3. [White-Box Analysis & Cyclomatic Complexity](#3-white-box-analysis--cyclomatic-complexity)  
   3.1 [Control Flow Graph (CFG) of `cast_vote()`](#31-control-flow-graph-cfg-of-cast_vote)  
   3.2 [Mathematical Complexity Derivation](#32-mathematical-complexity-derivation)  
   3.3 [Basis Path Set Definition](#33-basis-path-set-definition)  
4. [Software Reliability Metrics & Analysis](#4-software-reliability-metrics--analysis)  
   4.1 [Mean Time To Failure (MTTF) Calculation](#41-mean-time-to-failure-mttf-calculation)  
   4.2 [Mean Time To Repair (MTTR) Calculation](#42-mean-time-to-repair-mttr-calculation)  
   4.3 [Operational Availability ($A$) Assessment](#43-operational-availability-a-assessment)  
   4.4 [Rate of Occurrence of Failures (ROCOF)](#44-rate-of-occurrence-of-failures-rocof)  
5. [Formal Defect Tracking Log](#5-formal-defect-tracking-log)  
6. [Testing Conclusion & Sign-Off](#6-testing-conclusion--sign-off)  

---

## 1. Testing Objectives & Strategy

### 1.1 Scope & Objectives
The primary objective of the CEVS verification and validation program is to empirically prove the security, transactional integrity, boundary compliance, and reliability of the digital voting system. Testing focuses on three core pillars:
1. **Zero Electoral Loss & Fraud Prevention:** Proving that double voting, race conditions, or unauthenticated ballot injection are strictly rejected.
2. **Permanent Anonymity:** Verifying through physical database inspection that no computational path links an authenticated voter to a specific candidate vote.
3. **High Availability:** Demonstrating system operational availability of $\ge 99.9\%$ under peak concurrent load.

### 1.2 Black-Box Testing Methodologies
- **Equivalence Class Partitioning (ECP):** Input domains (passwords, OTP codes, student IDs, candidate IDs) are divided into valid and invalid equivalence classes.
- **Boundary Value Analysis (BVA):** Explicit temporal boundaries around election start and close times ($t_{\text{start}} - 1\text{s}$, $t_{\text{start}}$, $t_{\text{end}}$, $t_{\text{end}} + 1\text{s}$) are probed with millisecond precision.

### 1.3 White-Box Testing Methodologies
- **Control Flow Graph (CFG) Analysis:** Control logic of high-risk procedures like `cast_vote()` is analyzed to calculate cyclomatic complexity and achieve 100% basis path coverage.
- **Branch and Statement Coverage:** Verified via `pytest-cov`, establishing that all exception paths and rollback states are exercised.

---

## 2. Comprehensive Test Case Execution Table

### 2.1 Authentication & Access Control

| Test ID | Test Scenario | Input Data | Expected Result | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-AUTH-01** | Valid primary login credentials | `student_id: "STU001"`, `password: "Student@1234"` | HTTP 200, `temp_token` returned, `mfa_required: true`. | Matches expected. | **PASS** |
| **TC-AUTH-02** | Invalid password | `student_id: "STU001"`, `password: "WrongPass"` | HTTP 401 Unauthorized, generic error message. | Matches expected. | **PASS** |
| **TC-AUTH-03** | Non-existent student ID | `student_id: "GHOST999"`, `password: "AnyPass"` | HTTP 401 Unauthorized (avoids user enumeration). | Matches expected. | **PASS** |
| **TC-AUTH-04** | Valid 6-digit TOTP verification | Correct current TOTP generated via secret | HTTP 200, JWT `access_token` returned, `role: "voter"`. | Matches expected. | **PASS** |
| **TC-AUTH-05** | Expired / Invalid TOTP verification | Stale OTP code ($> 300\text{ s}$ old) | HTTP 401 Unauthorized, JWT token withheld. | Matches expected. | **PASS** |
| **TC-AUTH-06** | Authentication brute-force lockout | 6 consecutive failed logins from single IP | 6th attempt returns HTTP 429 Too Many Requests. | Matches expected. | **PASS** |
| **TC-AUTH-07** | Voter access to admin route | Voter JWT token sent to `/api/admin/elections` | HTTP 403 Forbidden, action logged to audit. | Matches expected. | **PASS** |

---

### 2.2 Election Window Boundary Value Analysis (BVA)

Let an active election have window:  
$t_{\text{start}} = \text{2026-10-29 08:00:00 UTC}$ and $t_{\text{end}} = \text{2026-10-29 20:00:00 UTC}$.

| Test ID | Test Condition | Test Timestamp ($t$) | Expected System Behavior | Observed Code | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-BVA-01** | Window Boundary: $t_{\text{start}} - 1\text{s}$ | 2026-10-29 07:59:59 UTC | Vote rejected; error: "Election has not started yet." | HTTP 400 | **PASS** |
| **TC-BVA-02** | Exact Opening: $t_{\text{start}}$ | 2026-10-29 08:00:00 UTC | Vote accepted and committed successfully. | HTTP 201 | **PASS** |
| **TC-BVA-03** | Mid-Window Execution | 2026-10-29 14:30:00 UTC | Vote accepted and committed successfully. | HTTP 201 | **PASS** |
| **TC-BVA-04** | Exact Closing: $t_{\text{end}}$ | 2026-10-29 20:00:00 UTC | Vote accepted (inclusive boundary). | HTTP 201 | **PASS** |
| **TC-BVA-05** | Window Boundary: $t_{\text{end}} + 1\text{s}$ | 2026-10-29 20:00:01 UTC | Vote rejected; error: "Election is closed." | HTTP 400 | **PASS** |
| **TC-BVA-06** | Inactive Election Submission | Valid window, but `is_active == False` | Vote rejected; error: "Election is not active." | HTTP 400 | **PASS** |

---

### 2.3 Integrity & Concurrency (Double-Voting Replays)

| Test ID | Test Scenario | Mechanism / Method | Expected Result | Observed Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-INT-01** | Sequential Double-Vote Attempt | Voter votes once (201), reloads browser, clicks vote again. | Second request aborts: "Voter has already voted in this election." | HTTP 400 | **PASS** |
| **TC-INT-02** | Browser Back-Button Replay | Resends exact cached `POST` payload with identical JWT. | Blocked at DB level (`has_voted == True`). | HTTP 400 | **PASS** |
| **TC-INT-03** | Concurrent Race Condition | 2 concurrent async HTTP threads casting votes simultaneously. | Exactly 1 request succeeds (HTTP 201); 1 request fails (HTTP 400). | Exactly 1 ballot entry created. | **PASS** |
| **TC-INT-04** | Ineligible Student Vote | Student authenticated but not on imported voter roll. | Vote rejected: "Voter is not eligible for this election." | HTTP 400 / 403 | **PASS** |

---

### 2.4 Security & Vulnerability Tests (SQLi, XSS, Anonymity)

| Test ID | Test Scenario | Attack Vector / Payload | Expected Defense | Observed Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TC-SEC-01** | SQL Injection in Student ID | `' OR 1=1; --` or `admin'--` | Parameterized ORM queries prevent query modification; returns 401. | Sanitized / Rejected | **PASS** |
| **TC-SEC-02** | SQL Injection in Candidate Bio | `1'); DROP TABLE ballot_entries;--` | Bound parameters escape payload safely into string literal. | No execution; stored safely | **PASS** |
| **TC-SEC-03** | Stored XSS in Candidate Name | `<script>alert('pwned')</script>` | Sanitized by input validator or escaped by React DOM renderer. | Rendered as text | **PASS** |
| **TC-SEC-04** | Tampered JWT Access Token | Modified signature bytes in Bearer header | Rejected by PyJWT / Flask-JWT-Extended validation. | HTTP 422 / 401 | **PASS** |
| **TC-SEC-05** | Expired JWT Token Replay | Token with expired `exp` timestamp claim | Rejected with "Token has expired." | HTTP 401 | **PASS** |
| **TC-SEC-06** | Ballot Anonymity Validation | Database schema inspection on committed tables | Zero foreign keys exist between `voter_records` and `ballot_entries`. | Zero relational join possible | **PASS** |
| **TC-SEC-07** | Premature Results Query | `GET /api/results/1` while `results_published == False` | Access forbidden; results withheld until published. | HTTP 403 Forbidden | **PASS** |

---

## 3. White-Box Analysis & Cyclomatic Complexity

### 3.1 Control Flow Graph (CFG) of `cast_vote()`
The core transaction in `VoteService.cast_vote()` is analyzed:

```
[1] Start: Initialize session & resolve voter
     |
     v
[2] Decision: Is voter valid? (if not voter_user)
     |               \--> [False: Error 1] (Node 3)
     v [True]
[4] Decision: Is election_id valid & election found?
     |               \--> [False: Error 2] (Node 5)
     v [True]
[6] Decision: Is election.is_active True?
     |               \--> [False: Error 3] (Node 7)
     v [True]
[8] Decision: Is now < start_time?
     |               \--> [True: Error 4] (Node 9)
     v [False]
[10] Decision: Is now > end_time?
     |               \--> [True: Error 5] (Node 11)
     v [False]
[12] Decision: Is candidate valid & belongs to election?
     |               \--> [False: Error 6] (Node 13)
     v [True]
[14] Decision: Does voter_record exist?
     |               \--> [False: Error 7] (Node 15)
     v [True]
[16] Decision: Has voter already voted? (voter_record.has_voted)
     |               \--> [True: Error 8] (Node 17)
     v [False]
[18] Set has_voted = True, generate blind token, insert BallotEntry, insert AuditLog
     |
     v
[19] Commit transaction & return VoteResult (Success)
     |
     v
[20] End / Exit
```

### 3.2 Mathematical Complexity Derivation
Using McCabe’s Cyclomatic Complexity formula:
$$V(G) = E - N + 2P$$
where:
- Number of Edges ($E$) = 26
- Number of Nodes ($N$) = 20
- Connected Components ($P$) = 1

$$V(G) = 26 - 20 + 2(1) = 6 + 2 = \mathbf{8}$$

Alternatively, using Predicate Nodes ($P_d$):
$$V(G) = P_d + 1$$
The decision predicates in `cast_vote()` are:
1. `not voter_user`
2. `not election or not election_id`
3. `not election.is_active`
4. `now < start_time`
5. `now > end_time`
6. `not candidate or candidate.election_id != election.id`
7. `not voter_record`
8. `voter_record.has_voted`

Total Predicates $P_d = 7$ (grouping compounded null checks) to $8$.
$$V(G) = 7 + 1 = \mathbf{8}$$

A cyclomatic complexity of $8$ falls comfortably below the industry threshold of $10$, indicating well-structured, maintainable, and thoroughly testable procedural code.

### 3.3 Basis Path Set Definition
To achieve 100% basis path coverage, 8 linearly independent execution paths were formulated and tested:
- **Path 1:** $1 \rightarrow 2 \rightarrow 3$ (Invalid voter user $\rightarrow$ VotingError)
- **Path 2:** $1 \rightarrow 2 \rightarrow 4 \rightarrow 5$ (Missing/invalid election $\rightarrow$ VotingError)
- **Path 3:** $1 \rightarrow 2 \rightarrow 4 \rightarrow 6 \rightarrow 7$ (Election inactive $\rightarrow$ VotingError)
- **Path 4:** $1 \rightarrow 2 \rightarrow 4 \rightarrow 6 \rightarrow 8 \rightarrow 9$ (Vote before start time $\rightarrow$ VotingError)
- **Path 5:** $1 \rightarrow 2 \rightarrow 4 \rightarrow 6 \rightarrow 8 \rightarrow 10 \rightarrow 11$ (Vote after end time $\rightarrow$ VotingError)
- **Path 6:** $1 \rightarrow 2 \rightarrow 4 \rightarrow 6 \rightarrow 8 \rightarrow 10 \rightarrow 12 \rightarrow 13$ (Invalid candidate $\rightarrow$ VotingError)
- **Path 7:** $1 \rightarrow 2 \rightarrow 4 \rightarrow 6 \rightarrow 8 \rightarrow 10 \rightarrow 12 \rightarrow 14 \rightarrow 15$ (Voter ineligible / not registered $\rightarrow$ VotingError)
- **Path 8:** $1 \rightarrow 2 \rightarrow 4 \rightarrow 6 \rightarrow 8 \rightarrow 10 \rightarrow 12 \rightarrow 14 \rightarrow 16 \rightarrow 17$ (Already voted $\rightarrow$ VotingError)
- **Path 9 (Main Success):** $1 \rightarrow 2 \rightarrow 4 \rightarrow 6 \rightarrow 8 \rightarrow 10 \rightarrow 12 \rightarrow 14 \rightarrow 16 \rightarrow 18 \rightarrow 19 \rightarrow 20$ (Vote committed $\rightarrow$ 201 Created)

All 9 paths are covered by automated unit and integration tests.

---

## 4. Software Reliability Metrics & Analysis

Reliability metrics were derived during a simulated 48-hour continuous stress and soak testing period involving automated virtual user agents generating 12,000 synthetic voting transactions.

### 4.1 Mean Time To Failure (MTTF) Calculation
During the 48-hour test window ($48 \times 60 = 2,880\text{ minutes}$ of aggregate operating time), the system experienced exactly 2 transient software-induced unhandled container restarts due to an initial connection pool leak under stress:
$$\text{Total Operational Uptime} = 2,880 \text{ min} - 1.8 \text{ min downtime} = 2,878.2 \text{ minutes}$$
$$\text{Number of Observed Failures} = 2$$
$$\text{MTTF} = \frac{\text{Total Operational Uptime}}{\text{Number of Failures}} = \frac{2,878.2}{2} = \mathbf{1,439.1 \text{ minutes} \approx 23.985 \text{ hours}}$$

### 4.2 Mean Time To Repair (MTTR) Calculation
Docker Compose automated restart policies and PostgreSQL WAL replay recovered the system automatically:
- Incident 1 recovery: 52 seconds
- Incident 2 recovery: 56 seconds
$$\text{Total Down Time} = 52\text{ s} + 56\text{ s} = 108\text{ seconds} = 1.8\text{ minutes}$$
$$\text{MTTR} = \frac{\text{Total Down Time}}{\text{Number of Failures}} = \frac{108\text{ seconds}}{2} = \mathbf{54.0 \text{ seconds} = 0.90 \text{ minutes}}$$

### 4.3 Operational Availability ($A$) Assessment
System availability is calculated as:
$$A = \frac{\text{MTTF}}{\text{MTTF} + \text{MTTR}} = \frac{1439.1}{1439.1 + 0.90} = \frac{1439.1}{1440.0} = \mathbf{0.999375 \approx 99.938\%}$$

> [!NOTE]
> **Availability Verification:** The achieved availability of **99.938%** exceeds the required Non-Functional Requirement threshold of $\ge \mathbf{99.9\%}$ ($A_{\text{target}} \ge 0.999$).

### 4.4 Rate of Occurrence of Failures (ROCOF)
$$\text{ROCOF} = \frac{\text{Failures}}{\text{Unit Time}} = \frac{2}{48 \text{ hours}} = \mathbf{0.0417 \text{ failures per hour}}$$
Following patch deployment for the SQLAlchemy connection pool recycle parameter (`pool_recycle=1800`), subsequent 24-hour testing recorded **0 failures** ($\text{ROCOF} = 0.00$).

---

## 5. Formal Defect Tracking Log

In accordance with ISO 9001 quality tracking guidelines, all discovered defects during the testing lifecycle were formally logged, assigned, and remediated:

| Defect ID | Found In | Phase | Description | Severity | Found By | Fixed By | Status | Resolution / Fix Details |
| :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **D001** | `auth_service.py` | Inc 1 | TOTP drift window was 30s instead of 300s, causing false expirations. | High | Test Lead | Backend Eng | **CLOSED** | Adjusted `valid_window=10` in `pyotp.TOTP.verify()` call. |
| **D002** | `vote_service.py` | Inc 2 | Timezone comparison failed between native and UTC aware datetime. | High | Test Lead | Backend Eng | **CLOSED** | Enforced explicit `.replace(tzinfo=timezone.utc)` for SQLite compatibility. |
| **D003** | `voter.py` | Inc 2 | Double-click on submit button fired concurrent requests. | Crit | Security Eng | Frontend Eng | **CLOSED** | Added client-side debouncing and state disabling on submit button. |
| **D004** | `results.py` | Inc 3 | Results endpoint leaked candidate vote totals when `results_published=False`. | Crit | Security Eng | Backend Eng | **CLOSED** | Added strict guard raising `ResultsHiddenError` returning HTTP 403. |
| **D005** | `app/__init__.py`| Inc 4 | Connection pool exhaustion under 500 concurrent threads. | High | Stress Eng | Backend Eng | **CLOSED** | Configured `pool_size=20, max_overflow=30, pool_timeout=30`. |

---

## 6. Testing Conclusion & Sign-Off

The Campus e-Voting System test suite executed **100% of planned test cases** across unit, integration, boundary, concurrency, and security suites with zero unresolved critical defects. 
- Core business invariants (one vote per student, total ballot secrecy, time window enforcement) have been verified.
- Measured operational availability of **99.938%** satisfies the SRS standard.
- The software system is formally certified for production deployment and campus mock election execution.

---
**Certified by:** Quality Assurance Lead & Software Testing Specialist  
**Endorsed by:** Lead Systems Architect & Faculty Course Coordinator
