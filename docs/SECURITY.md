# Security Architecture, Threat Model & Hardening Review

## Overview
The Campus E-Voting System (CEVS) balances cryptographic secrecy, voter confidentiality, and physical kiosk containment. This document outlines the threat modeling, cryptographic mechanisms, privilege separation, and inherent physical security limitations.

---

## 1. Threat Matrix & Defense-in-Depth

| Threat Vector | Attack Scenario | Implemented Mitigation |
| :--- | :--- | :--- |
| **Coerced / Proxy Voting** | Students forced to vote from hostel or by peers online | **Physical Polling Desk PIN Slips**: Voters must present physical Student ID cards to obtain a 20-minute ephemeral PIN slip, then vote exclusively at physical campus computer lab terminals. |
| **Ballot De-anonymization** | System administrator attempts to trace vote back to student | **Strict Separation of WHO vs WHAT**: `VoterRecord` stores only `SHA-256(student_id)` and a boolean `has_voted`. `BallotEntry` records the candidate/NOTA choice under a detached, unlinked `blind_token` (HMAC-SHA256). No foreign key or relational correlation exists. |
| **Kiosk Escape / Jailbreak** | Student attempts `F12`, `Ctrl+N`, `Ctrl+Alt+T`, or downloads malware | **Snap Firefox Policies + GNOME Wayland Lockdown**: DevTools, Downloads, NewTabs, and AboutConfig are disabled. Virtual terminals and USB storage drivers are blacklisted. |
| **Staff PIN Brute-Force** | Attacker tries dictionary attacks on staff maintenance shortcut | **Salted PBKDF2/scrypt Hashing + 5-attempt Rate Limit**: 5 consecutive failures triggers an automatic 15-minute system lockdown. Raw PINs are never logged. |
| **Malicious Remote Command Execution** | Compromised kiosk tries to execute shell exploits | **Zero-Shell Execution API**: Maintenance actions use a strict python set allowlist (`PERMITTED_ACTIONS`). No raw frontend input is ever evaluated by a shell. |
| **Duplicate / Burned PIN Voting** | Voter attempts to reuse a 6-digit PIN slip twice | **Atomic Burn-on-Cast**: Once a ballot transaction commits, `VotingToken.is_used` is set to `True` and `VoterRecord.has_voted` is set to `True` within an atomic database transaction. |

---

## 2. Inherent Limitations & Physical Security Realities

* **No Kiosk is 100% Tamper-Proof Against Physical Disassembly**: If an attacker is left unsupervised with physical access, screwdrivers, or hardware keyloggers, software defenses can be circumvented.
* **Presiding Officer Supervision**: Polling booths must be arranged such that the screen faces away from public view (preserving secrecy), while the terminal chassis and cables remain visible to election volunteers.
* **Firmware Integrity**: Workstations must enforce supervisor UEFI passwords, signed kernel modules (`SecureBoot`), and physical port locks.
