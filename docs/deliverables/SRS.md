# Software Requirements Specification (SRS)
## Campus e-Voting System (CEVS)
**Standard:** IEEE Std 830-1998 (Recommended Practice for Software Requirements Specifications)  
**Document Identifier:** CEVS-DOC-SRS-02  
**Course:** B.Sc. Computer Science (Major), NEP 2020, Semester 5 — Software Engineering  
**Unit Alignment:** Unit 3 (Requirements Engineering, Verifiable NFRs, Decision Tables)  
**Project:** Project 8 (Campus e-Voting System)  
**Version:** 1.0.0 (Final)  
**Date:** October 2026  

---

## Table of Contents
1. [Introduction](#1-introduction)  
   1.1 [Purpose](#11-purpose)  
   1.2 [Scope](#12-scope)  
   1.3 [Definitions, Acronyms, and Abbreviations](#13-definitions-acronyms-and-abbreviations)  
   1.4 [References](#14-references)  
   1.5 [Overview](#15-overview)  
2. [Overall Description](#2-overall-description)  
   2.1 [Product Perspective](#21-product-perspective)  
   2.2 [Product Functions](#22-product-functions)  
   2.3 [User Classes and Characteristics](#23-user-classes-and-characteristics)  
   2.4 [Operating Environment](#24-operating-environment)  
   2.5 [Design and Implementation Constraints](#25-design-and-implementation-constraints)  
   2.6 [Assumptions and Dependencies](#26-assumptions-and-dependencies)  
3. [Specific Requirements](#3-specific-requirements)  
   3.1 [External Interface Requirements](#31-external-interface-requirements)  
   3.2 [Functional Requirements (F1 – F20)](#32-functional-requirements-f1--f20)  
   3.3 [Voting Eligibility Decision Table](#33-voting-eligibility-decision-table)  
   3.4 [List of Strictly Prohibited System Actions](#34-list-of-strictly-prohibited-system-actions)  
   3.5 [Use Case Specifications](#35-use-case-specifications)  
4. [Non-Functional Requirements (NFRs)](#4-non-functional-requirements-nfrs)  
   4.1 [Performance Requirements](#41-performance-requirements)  
   4.2 [Reliability & Availability Requirements](#42-reliability--availability-requirements)  
   4.3 [Security Requirements](#43-security-requirements)  
   4.4 [Maintainability & Usability Requirements](#44-maintainability--usability-requirements)  
5. [Verification & Validation Matrix](#5-verification--validation-matrix)  

---

## 1. Introduction

### 1.1 Purpose
This document defines the complete Software Requirements Specification (SRS) for the **Campus e-Voting System (CEVS)**, designed in conformance with IEEE Std 830-1998. It establishes the authoritative baseline for system design, implementation, verification, and acceptance testing across the four increments of the software development lifecycle.

### 1.2 Scope
CEVS is a secure, web-based digital voting platform tailored for university student council and departmental elections. The system enforces strict voter authentication via two-factor mechanisms (Student ID/Password + Time-based OTP), automated eligibility checks, real-time ballot casting with cryptographically isolated ballot secrecy, immutable tamper-evident audit logging, and automated post-election tally calculation.

**Key Delimitations:**
- The software manages campus-wide and departmental representative student council elections.
- The system operates within the university intranet and authorized secure public web proxies.
- Financial transactions, student disciplinary processing, and union dues are outside the operational boundary.

### 1.3 Definitions, Acronyms, and Abbreviations
- **ACID:** Atomicity, Consistency, Isolation, Durability.
- **Blind Token:** A cryptographically random HMAC-SHA256 receipt generated during vote casting that confirms ballot acceptance without revealing candidate selection or voter identity.
- **Bcrypt:** An adaptive password-hashing function based on the Blowfish cipher.
- **CEVS:** Campus e-Voting System.
- **DFD:** Data Flow Diagram.
- **JWT:** JSON Web Token (RFC 7519).
- **MFA / 2FA:** Multi-Factor / Two-Factor Authentication.
- **NFR:** Non-Functional Requirement.
- **RBAC:** Role-Based Access Control.
- **TOTP:** Time-based One-Time Password Algorithm (RFC 6238).
- **Voter Hash:** $\text{SHA-256}(\text{student\_id} \parallel \text{SALT})$, an irreversible identifier used to prevent double-voting.
- **WBS:** Work Breakdown Structure.

### 1.4 References
1. IEEE Std 830-1998: *IEEE Recommended Practice for Software Requirements Specifications*.
2. ISO/IEC/IEEE 29148:2018: *Systems and Software Engineering — Life Cycle Processes — Requirements Engineering*.
3. RFC 6238: *TOTP: Time-Based One-Time Password Algorithm*.
4. Syllabus for B.Sc. Computer Science (Major), NEP 2020, Semester 5, Software Engineering.
5. Project 8 Specification Sheet: *Campus e-Voting System*, Software Engineering Minor Projects.

### 1.5 Overview
Section 2 provides high-level architectural context, user classes, and operating constraints. Section 3 details all 20 verifiable functional requirements, decision tables, prohibited actions, and formal use cases. Section 4 specifies verifiable non-functional criteria.

---

## 2. Overall Description

### 2.1 Product Perspective
CEVS is an autonomous, self-contained web platform operating within a client-server paradigm. It interfaces upstream with the institutional registrar database (via standardized CSV import) and downstream with an institutional SMTP service for OTP delivery.

```
+-------------------------------------------------------------------------+
|                         CAMPUS E-VOTING SYSTEM                          |
|                                                                         |
|  +--------------------+       HTTPS       +--------------------------+  |
|  | React SPA Frontend | <===============> | Flask REST API Gateway   |  |
|  | (Student/Admin UI) |   JSON Payloads   | (Auth, Vote, Audit)      |  |
|  +--------------------+                   +--------------------------+  |
|                                                         |               |
|                                          +--------------+--------------+|
|                                          |                             ||
|                                    SQL / ACID                    SMTP  ||
|                                          v                             v|
|                            +---------------------------+   +----------+ |
|                            | PostgreSQL 15 Database    |   | Campus   | |
|                            | (Decoupled Voter & Ballot)|   | Mail Svc | |
|                            +---------------------------+   +----------+ |
+-------------------------------------------------------------------------+
```

### 2.2 Product Functions
1. **User Identity & Multi-Factor Access Control:** Institutional credential verification coupled with TOTP verification.
2. **Electoral Roll Management:** Batch ingestion, eligibility whitelisting, and per-election voter hash generation.
3. **Election Lifecycle Governance:** Dynamic scheduling, candidate nomination registry, and administrative state transition (Draft $\rightarrow$ Active $\rightarrow$ Closed $\rightarrow$ Published).
4. **Secret Ballot Processing:** Independent writes into segregated databases tables without relational keys.
5. **Real-time Integrity Auditing:** Append-only transaction logging capturing client telemetry.
6. **Automated Tally & Analytics:** Deterministic counting triggered strictly after election closure.

### 2.3 User Classes and Characteristics

| User Class | Technical Sophistication | Operational Scope / Responsibilities |
| :--- | :--- | :--- |
| **Student Voter** | General consumer web literacy | Authenticates, inspects ballot candidates, casts an irrevocable secret vote, verifies blind submission token, inspects published outcomes. |
| **System Administrator** | High IT / Systems competency | Manages application deployment, executes database backups, configures mail/network servers, monitors server metrics. |
| **Election Commissioner** | Moderate administrative literacy | Configures election metadata, approves candidate rosters, imports voter rolls, governs opening/closing windows, certifies final counts. |

### 2.4 Operating Environment
- **Server OS:** Ubuntu Linux 22.04 LTS or Windows Server 2022.
- **Runtime Engines:** Python 3.11+, Node.js 18+ LTS runtime.
- **Database Server:** PostgreSQL 15+ (Production) / SQLite 3.38+ (Development / Test).
- **Client Devices:** Any modern desktop or mobile browser conforming to HTML5/ECMAScript 2020+ standards (Google Chrome 100+, Mozilla Firefox 100+, Apple Safari 15+, Microsoft Edge 100+).

### 2.5 Design and Implementation Constraints
1. **Separation of Voter and Ballot Data:** No relational foreign key or join path shall exist between `voter_records` and `ballot_entries`.
2. **Transaction Atomicity:** Ballot processing must execute within an atomic database transaction. Any failure must trigger an automatic rollback.
3. **Stateless Gateway:** The REST API must be completely stateless, authenticating every request via cryptographically signed JWT bearer tokens.
4. **Open Source Tech Stack:** Zero proprietary software libraries or licensed external components.

### 2.6 Assumptions and Dependencies
- The university provides a secure, authoritative student roster with institutional email addresses.
- The university network provides operational DNS and SMTP relay capabilities during the voting period.
- System server clocks are synchronized with an authoritative Network Time Protocol (NTP) server within $\pm 50\text{ ms}$.

---

## 3. Specific Requirements

### 3.1 External Interface Requirements
- **User Interface (UI):** Built in React 18, responsive down to 320px viewport width, with clear high-contrast candidate selection cards and confirmation dialogs.
- **Hardware Interfaces:** Standard TCP/IP networking over Ethernet or 802.11 Wi-Fi.
- **Software Interfaces:** 
  - Standard REST API exposing JSON over HTTPS (TLS 1.3).
  - PostgreSQL wire protocol over port 5432.
  - SMTP / SMTPS over port 587.

---

### 3.2 Functional Requirements (F1 – F20)

#### Area 1: Authentication & OTP (F1 – F5)
- **F1 [Primary Authentication]:** The system shall authenticate users via unique `student_id` and password, verifying against salted Bcrypt hashes ($cost \ge 12$).
- **F2 [Multi-Factor OTP Generation]:** Upon successful primary authentication, the system shall generate a 6-digit TOTP (RFC 6238) valid for exactly 300 seconds (5 minutes) and deliver it to the user's registered institutional email address.
- **F3 [OTP Verification & Session Issuance]:** The system shall validate submitted OTP codes; upon successful validation, it shall issue a signed JWT access token (valid for 60 minutes) and a refresh token.
- **F4 [Rate Limiting on Authentication]:** The system shall restrict login attempts to a maximum of 5 failed attempts per IP address per 15-minute window; exceeding this threshold shall return HTTP status `429 Too Many Requests`.
- **F5 [Secure Logout & Token Revocation]:** The system shall provide a logout endpoint that invalidates the caller's JWT by adding its unique `jti` to an in-memory/cache blocklist until expiration.

#### Area 2: Voter Management & Eligibility (F6 – F8)
- **F6 [Batch Voter Import]:** The system shall permit administrators to import student voter lists via structured CSV files containing columns: `student_id`, `name`, `email`, `department`, and `year`.
- **F7 [Voter Hash Generation]:** Upon import, the system shall compute an irreversible salted cryptographic hash:
  $$\text{voter\_hash} = \text{SHA-256}(\text{student\_id} \parallel \text{SALT})$$
  and store it in the `voter_records` table linked to the target `election_id`.
- **F8 [Eligibility Inspection]:** The system shall expose an endpoint permitting authenticated voters to inspect their eligibility status (`eligible: true/false`, `has_voted: true/false`) without exposing voting choices.

#### Area 3: Election & Candidate Administration (F9 – F12)
- **F9 [Election Creation & Parameterization]:** The system shall allow authorized election commissioners to create elections specifying: `title`, `description`, `start_time` (UTC), `end_time` (UTC), and active status.
- **F10 [Candidate Registry Management]:** The system shall enable election commissioners to register candidates linked to specific elections, storing `name`, `party`, `position`, `bio`, and display order.
- **F11 [Time-Window Enforcement]:** The system shall strictly forbid vote casting if the server timestamp (UTC) is earlier than `start_time` or later than `end_time`.
- **F12 [Election State Transitions]:** The system shall govern state transitions: an election cannot be activated unless it contains at least two registered candidates and at least one registered voter.

#### Area 4: Secret Ballot Casting & Anonymity (F13 – F16)
- **F13 [Irreversible Vote Casting]:** The system shall permit an eligible voter to submit exactly one vote for one candidate per contested office within an active election window.
- **F14 [Strict Double-Vote Prevention]:** The system shall check `voter_records.has_voted` inside an ACID transaction; if `has_voted == True`, the vote request shall immediately abort with HTTP `400 Bad Request` and error code `ALREADY_VOTED`.
- **F15 [Ballot Anonymization & Separation]:** The system shall insert candidate choices into the `ballot_entries` table containing solely `(id, election_id, candidate_id, blind_token, cast_at)`. No student ID, user ID, or voter hash shall be stored or linked to `ballot_entries`.
- **F16 [Blind Receipt Generation]:** Upon successful ballot insertion, the system shall compute an HMAC-SHA256 blind receipt token returned to the client as proof of submission.

#### Area 5: Results & Tallying (F17 – F18)
- **F17 [Results Secrecy Prior to Closure]:** The system shall refuse all result queries (`/api/results/*`) while an election is ongoing; any query prior to official closure and publication shall return HTTP `403 Forbidden`.
- **F18 [Automated Tally Calculation]:** Upon election closure and administrator authorization, the system shall execute an automated aggregation query summing `ballot_entries` grouped by `candidate_id`, computing turnout percentage and declaring the winner(s).

#### Area 6: Security & Audit Logging (F19 – F20)
- **F19 [Immutable Audit Logging]:** The system shall record an immutable log entry in `audit_logs` for every security-relevant event (login, failed auth, voter import, vote cast, election status change), recording `timestamp`, `user_id` (or anonymous indicator for vote events), `action`, `ip_address`, and `user_agent`.
- **F20 [Payload Validation & Injection Defense]:** The system shall sanitize and validate all incoming request bodies against predefined schemas, rejecting malformed JSON, SQL injection vectors, and Cross-Site Scripting (XSS) inputs with HTTP `422 Unprocessable Entity`.

---

### 3.3 Voting Eligibility Decision Table

The core business logic governing vote authorization is defined using the following formal decision table:

| Condition / Rule ID | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **C1: User Authenticated via Valid JWT?** | N | Y | Y | Y | Y | Y | Y | Y |
| **C2: Election Status == Active (`is_active`)?** | — | N | Y | Y | Y | Y | Y | Y |
| **C3: Current Time $\ge$ `start_time`?** | — | — | N | Y | Y | Y | Y | Y |
| **C4: Current Time $\le$ `end_time`?** | — | — | — | N | Y | Y | Y | Y |
| **C5: Voter Record Exists for Election?** | — | — | — | — | N | Y | Y | Y |
| **C6: Voter Record `has_voted` == False?** | — | — | — | — | — | N | Y | Y |
| **C7: Candidate Exists in Target Election?** | — | — | — | — | — | — | N | Y |
| **ACTION:** | | | | | | | | |
| **A1: Allow Vote Submission (HTTP 201)** | | | | | | | | **X** |
| **A2: Reject — HTTP 401 Unauthorized** | **X** | | | | | | | |
| **A3: Reject — HTTP 400 (Election Inactive)** | | **X** | | | | | | |
| **A4: Reject — HTTP 400 (Election Not Started)** | | | **X** | | | | | |
| **A5: Reject — HTTP 400 (Election Closed)** | | | | **X** | | | | |
| **A6: Reject — HTTP 403 (Voter Ineligible)** | | | | | **X** | | | |
| **A7: Reject — HTTP 400 (Already Voted)** | | | | | | **X** | | |
| **A8: Reject — HTTP 400 (Invalid Candidate)** | | | | | | | **X** | |

---

### 3.4 List of Strictly Prohibited System Actions

In accordance with academic and election security guidelines, the system is strictly prohibited from performing any of the following operations under all conditions:

1. **PROHIB-01 [Ballot-to-Voter Association]:** The system shall NEVER store a foreign key, reference, pointer, session tag, or correlation ID linking a `ballot_entries` record with a `users` or `voter_records` record.
2. **PROHIB-02 [Premature Result Disclosure]:** The system shall NEVER compute, cache, display, or transmit aggregate vote totals, candidate tally counts, or interim leads before an election has officially reached the `closed` state and results are marked `published`.
3. **PROHIB-03 [Vote Alteration / Retraction]:** The system shall NEVER permit a vote, once committed to the database, to be updated, overwritten, replaced, or deleted by any actor, including the System Administrator or Election Commissioner.
4. **PROHIB-04 [Plaintext Password Storage]:** The system shall NEVER store, log, serialize, or transmit passwords in unhashed or reversible plaintext form.
5. **PROHIB-05 [Bypass of Secondary Factor]:** The system shall NEVER issue a privileged voting or administration JWT token without complete, successful verification of the 6-digit TOTP factor.
6. **PROHIB-06 [Audit Trail Modification]:** The system shall NEVER expose `UPDATE` or `DELETE` endpoints for the `audit_logs` table. Audit records must be strictly append-only.
7. **PROHIB-07 [Proxy Voting]:** The system shall NEVER permit an administrator or staff member to cast a vote on behalf of a student under any administrative override mode.

---

### 3.5 Use Case Specifications

#### Use Case UC-01: Cast Secret Ballot
- **Primary Actor:** Authenticated Student Voter.
- **Preconditions:**
  1. Voter has logged in via Student ID, password, and OTP.
  2. Election is active and the server time is within `start_time` and `end_time`.
  3. Voter's record in `voter_records` has `has_voted == False`.
- **Main Success Scenario:**
  1. Voter navigates to the Voting Page for the designated election.
  2. System retrieves and displays the certified list of candidates with names, party affiliations, and bios.
  3. Voter selects exactly one candidate and clicks "Submit Vote".
  4. System prompts a modal confirmation displaying the selected candidate and warning that the vote is irrevocable.
  5. Voter confirms submission.
  6. Client sends `POST /api/voter/vote` with `election_id` and `candidate_id` signed by the voter's JWT.
  7. System initiates an ACID database transaction:
     - Re-verifies active window and candidate validity.
     - Locates voter's record by hashing voter's student ID; confirms `has_voted == False`.
     - Sets `voter_record.has_voted = True` and records `voted_at = now()`.
     - Generates HMAC-SHA256 blind receipt token.
     - Inserts new record into `ballot_entries` containing only `(election_id, candidate_id, blind_token, cast_at)`.
     - Inserts record into `audit_logs` with action `VOTE_CAST`.
     - Commits transaction.
  8. System returns HTTP `201 Created` with the blind receipt token.
  9. Frontend displays a confirmation screen featuring the blind token and disables further voting options.
- **Postconditions:**
  - `voter_records.has_voted` is set to `True`.
  - Exactly one new record exists in `ballot_entries`.
  - The voter cannot vote again in this election.
- **Extensions (Alternative Flows):**
  - *7a. Double-vote detected (`has_voted == True`):* System aborts transaction, returns HTTP 400, and displays "You have already cast your vote in this election."
  - *7b. Election time expired between UI load and submission:* System aborts transaction, returns HTTP 400, and displays "Voting for this election has closed."

#### Use Case UC-02: Manage Election Lifecycle
- **Primary Actor:** Election Commissioner.
- **Preconditions:** User is authenticated with the `admin` role.
- **Main Success Scenario:**
  1. Commissioner accesses the Admin Dashboard.
  2. Commissioner specifies election title, description, start time, and end time.
  3. Commissioner registers at least two candidates for the election.
  4. Commissioner uploads a validated CSV file containing eligible student voter records.
  5. Commissioner reviews election configuration and clicks "Activate Election".
  6. System validates that candidates $\ge 2$ and voters $\ge 1$; updates `election.is_active = True`.
  7. System records `ELECTION_ACTIVATED` in `audit_logs`.
- **Postconditions:** Election becomes eligible to receive votes once `start_time` is reached.

#### Use Case UC-03: Publish Verified Election Results
- **Primary Actor:** Election Commissioner.
- **Preconditions:** Election window has expired (`now() > end_time`).
- **Main Success Scenario:**
  1. Commissioner navigates to the Results Management panel.
  2. System verifies that `now() > election.end_time`.
  3. Commissioner clicks "Close & Publish Results".
  4. System executes deterministic aggregation query grouping `ballot_entries` by candidate.
  5. System marks `election.results_published = True`.
  6. System logs `RESULTS_PUBLISHED` in `audit_logs`.
  7. Results become publicly accessible via `GET /api/results/<id>`.
- **Postconditions:** Real-time vote tallies, percentages, and winner declarations become visible to all students.

---

## 4. Non-Functional Requirements (NFRs)

All non-functional requirements are specified in quantitative, verifiable form:

### 4.1 Performance Requirements
- **NFR-P1 [API Latency]:** Under a sustained concurrent load of 1,000 active student sessions, the 95th percentile ($p_{95}$) API response time for the `POST /api/voter/vote` endpoint shall not exceed **1.5 seconds**, and the maximum response time shall not exceed **3.0 seconds**.
- **NFR-P2 [Database Query Efficiency]:** The database aggregation query for calculating election results over 10,000 ballots shall execute in under **500 milliseconds**.
- **NFR-P3 [Frontend Asset Load Time]:** The initial bundle size of the React application shall be under 1.2 MB uncompressed, loading interactive UI elements within **2.0 seconds** on a standard 3G mobile network (1.6 Mbps downlink).

### 4.2 Reliability & Availability Requirements
- **NFR-R1 [System Availability]:** The system shall achieve an operational availability of $\ge \mathbf{99.9\%}$ during designated voting windows:
  $$\text{Availability} = \frac{\text{MTTF}}{\text{MTTF} + \text{MTTR}} \ge 0.999$$
  allowing for less than 43.8 seconds of unplanned downtime during an 8-hour election.
- **NFR-R2 [Zero Vote Loss]:** Under sudden hardware, container, or network failure, zero confirmed votes shall be lost or duplicated. Write transactions must strictly follow ACID durability via synchronous disk flush.
- **NFR-R3 [Mean Time to Recovery (MTTR)]:** In the event of a container crash, Docker auto-restart policies shall restore full service availability within **60 seconds**.

### 4.3 Security Requirements
- **NFR-S1 [Cryptographic Password Storage]:** All passwords must be stored using the Bcrypt hashing algorithm with a minimum work factor of 12 rounds.
- **NFR-S2 [Session Token Cryptography]:** Access tokens must be signed using HMAC-SHA256 with a cryptographically random secret key of $\ge 256\text{ bits}$, expiring in 60 minutes.
- **NFR-S3 [Transport Encryption]:** All HTTP traffic must be strictly forced to HTTPS using TLS 1.3 with HSTS enabled (max-age: 31,536,000 seconds).
- **NFR-S4 [Audit Immutability]:** The audit logging mechanism must operate in an append-only configuration; any query attempting to update or delete audit records must be rejected at the database engine level.

### 4.4 Usability & Accessibility Requirements
- **NFR-U1 [Accessibility Standard]:** The client interface shall conform to W3C Web Content Accessibility Guidelines (WCAG) 2.1 Level AA standards.
- **NFR-U2 [Voter Error Prevention]:** The system shall require explicit two-step user confirmation prior to submitting a vote, displaying the selected candidate's name prominently to eliminate slip errors.

---

## 5. Verification & Validation (V&V) Matrix

| Req ID | Requirement Summary | Verification Method | Acceptance Criteria |
| :---: | :--- | :---: | :--- |
| **F1** | Bcrypt Authentication | Test / Automated | Bcrypt hash prefix `$2b$`, work factor $\ge 12$, plaintext passwords rejected. |
| **F2** | 300s TOTP Generation | Test / Unit | TOTP length == 6 digits; rejected if $> 300\text{ s}$ old. |
| **F4** | Rate Limiting | Test / Integration | 6th failed login from same IP within 15 min returns HTTP 429. |
| **F11** | Voting Window Boundary | Test / Boundary | Vote cast 1s before `start_time` returns 400; vote at `start_time` succeeds; vote 1s after `end_time` returns 400. |
| **F14** | Double-Vote Rejection | Test / Stress | Concurrent asynchronous requests with identical JWT yield exactly 1 success (201) and 1 failure (400). |
| **F15** | Ballot Anonymity | Inspection / DB | Zero SQL join paths between `voter_records` and `ballot_entries`; foreign keys verified absent. |
| **NFR-P1**| API Latency | Stress / Locust | $p_{95} \le 1.5\text{ s}$ for 1,000 concurrent threads. |
| **NFR-R1**| Availability $\ge 99.9\%$ | Calculation / Log | Calculated operational uptime over test election window exceeds 99.9%. |

---
**Prepared by:** Systems Analyst & Requirements Engineering Team  
**Reviewed by:** Quality Assurance Lead & Academic Supervisor
