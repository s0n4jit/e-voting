# System User Manual
## Campus e-Voting System (CEVS)
**Document Identifier:** CEVS-DOC-UM-06  
**Course:** B.Sc. Computer Science (Major), NEP 2020, Semester 5 — Software Engineering  
**Target Audience:** Enrolled Student Voters, Faculty Election Commissioners, and System Administrators  
**Version:** 1.0.0 (Release Edition)  
**Date:** October 2026  

---

## Table of Contents
1. [Introduction to the Campus e-Voting System](#1-introduction-to-the-campus-e-voting-system)  
2. [Voter Guide: How to Cast Your Secret Ballot](#2-voter-guide-how-to-cast-your-secret-ballot)  
   2.1 [Accessing the Portal & Logging In](#21-accessing-the-portal--logging-in)  
   2.2 [Two-Factor OTP Verification](#22-two-factor-otp-verification)  
   2.3 [Navigating the Voter Dashboard](#23-navigating-the-voter-dashboard)  
   2.4 [Selecting Candidates & Confirming Your Vote](#24-selecting-candidates--confirming-your-vote)  
   2.5 [Receiving & Verifying Your Blind Submission Receipt](#25-receiving--verifying-your-blind-submission-receipt)  
   2.6 [Viewing Certified Election Results](#26-viewing-certified-election-results)  
3. [Administrator & Election Commissioner Guide](#3-administrator--election-commissioner-guide)  
   3.1 [Administrative Sign-In & Dashboard Overview](#31-administrative-sign-in--dashboard-overview)  
   3.2 [Configuring a New Election](#32-configuring-a-new-election)  
   3.3 [Registering Candidates](#33-registering-candidates)  
   3.4 [Importing Eligible Voters via CSV](#34-importing-eligible-voters-via-csv)  
   3.5 [Activating the Election & Polling Window](#35-activating-the-election--polling-window)  
   3.6 [Closing the Election & Publishing Final Results](#36-closing-the-election--publishing-final-results)  
   3.7 [Inspecting the System Audit Trail](#37-inspecting-the-system-audit-trail)  
4. [Frequently Asked Questions (FAQ) & Troubleshooting](#4-frequently-asked-questions-faq--troubleshooting)  

---

## 1. Introduction to the Campus e-Voting System

The **Campus e-Voting System (CEVS)** is the official digital voting platform for university student council elections. The system guarantees that:
- Every eligible student can vote easily from their personal smartphone, tablet, or laptop.
- Each student votes exactly once.
- Your vote is **100% secret**—the system cryptographically separates who you are from which candidate you choose.
- Election counting is completely automated, transparent, and verifiable.

---

## 2. Voter Guide: How to Cast Your Secret Ballot

### 2.1 Accessing the Portal & Logging In
1. Open any standard web browser (Chrome, Safari, Firefox, or Edge) on your smartphone or PC.
2. Navigate to the campus election URL (e.g., `https://evoting.campus.edu` or `http://localhost:3000` in development).
3. The **Login Screen** will appear:
   - Enter your official **Student ID** (e.g., `STU001`).
   - Enter your **Password** (default initial password provided by the university registrar, e.g., `Student@1234`).
   - Click the **"Continue to Verification"** button.

```
+-------------------------------------------------------+
|                Campus e-Voting Portal                 |
|                                                       |
|  Student ID:  [ STU001                              ] |
|  Password:    [ ****************                    ] |
|                                                       |
|              [ Continue to Verification ]             |
+-------------------------------------------------------+
```

### 2.2 Two-Factor OTP Verification
1. To ensure account security, a 6-digit One-Time Password (OTP) is automatically generated and sent to your registered institutional university email address.
2. Open your student email inbox and check for an email with the subject: **"Campus e-Voting: Your One-Time Login Code"**.
3. Return to the portal and enter the 6-digit code into the prompt boxes.
4. Click **"Verify & Enter Portal"**.
> [!NOTE]
> The verification code remains valid for **5 minutes (300 seconds)**. If your code expires, click **"Resend Code"**.

### 2.3 Navigating the Voter Dashboard
Upon successful authentication, the **Voter Dashboard** displays:
- Your verified student profile name and departmental enrollment.
- The list of **Active Elections** currently open for polling.
- Your current voting eligibility status for each election:
  - 🟢 **Eligible to Vote** (Polling is open; you have not yet voted)
  - 🟡 **Already Voted** (Your ballot has been successfully recorded)
  - ⚪ **Election Not Started / Closed** (Outside the authorized polling hours)

### 2.4 Selecting Candidates & Confirming Your Vote
1. Click **"Enter Polling Booth"** for the active election.
2. Review the candidate cards displayed on screen. Each candidate card exhibits:
   - Candidate Full Name
   - Student Slate / Party Affiliation
   - Contested Position (e.g., "President")
   - Candidate Biography and Manifesto
3. Click the radio button or selection card for your chosen candidate.
4. Click the prominent button: **"Review & Submit Vote"**.

```
+-----------------------------------------------------------------+
|                    BALLOT CONFIRMATION MODAL                    |
|                                                                 |
|  Are you sure you want to cast your ballot for:                 |
|                                                                 |
|  Candidate:  Carol Smith                                        |
|  Party:      Student First Party                                |
|  Position:   President                                          |
|                                                                 |
|  WARNING: Votes cannot be retracted, modified, or re-submitted.|
|                                                                 |
|         [ Cancel / Go Back ]       [ Confirm & Cast Ballot ]    |
+-----------------------------------------------------------------+
```

5. A confirmation dialog will appear displaying your selected candidate's name.
6. Verify your selection carefully, then click **"Confirm & Cast Ballot"**.

### 2.5 Receiving & Verifying Your Blind Submission Receipt
Once your vote is committed:
1. The system updates your eligibility record to `has_voted = True`.
2. The candidate selection is stored in a segregated, anonymous ballot container.
3. The screen will immediately display a green success notification:
   > **"Ballot Successfully Recorded!"**
4. An **Anonymous Blind Receipt Token** is displayed (e.g., `a7f9c2e0b5...`).
5. You can copy or screenshot this receipt code. This token proves that your ballot is part of the certified digital ballot box without disclosing who you voted for.
6. The interface transitions your status to **"Already Voted"**, and further submissions are permanently disabled.

### 2.6 Viewing Certified Election Results
1. Results cannot be viewed while the election is active to prevent influencing voter turnout.
2. Once the official election window closes and the Election Commission authorizes publication, navigate to the **"Election Results"** tab.
3. The page renders:
   - Interactive bar charts depicting votes per candidate.
   - Total eligible electorate and final turnout percentage.
   - Officially declared winner with the highest vote tally.

---

## 3. Administrator & Election Commissioner Guide

### 3.1 Administrative Sign-In & Dashboard Overview
1. Navigate to `/login` and sign in with authorized administrator credentials (e.g., `ADMIN001` / `Admin@1234`).
2. Complete the mandatory OTP second-factor step.
3. The **Admin Console** provides access to:
   - Election Manager
   - Candidate Registry
   - Voter Roll CSV Ingestion Tool
   - Live Audit Trail Telemetry

### 3.2 Configuring a New Election
1. Click the **"Create New Election"** button in the Election Manager tab.
2. Provide the following metadata:
   - **Title:** e.g., "Student Council General Elections 2026"
   - **Description:** Overview of rules and guidelines.
   - **Start Time (UTC):** The exact date and time polling opens.
   - **End Time (UTC):** The exact date and time polling closes.
3. Click **"Save Draft"**. Newly created elections remain in `Draft / Inactive` state.

### 3.3 Registering Candidates
1. In the Candidate Manager, select the target election.
2. Click **"Add Candidate"**.
3. Input candidate details:
   - Name (e.g., "Carol Smith")
   - Party / Affiliation (e.g., "Student First Party")
   - Position (e.g., "President")
   - Manifesto / Bio (brief statement for voter inspection)
4. Click **"Register Candidate"**.
> [!IMPORTANT]
> The system enforces that every election must have at least **two candidates** before it can be activated.

### 3.4 Importing Eligible Voters via CSV
1. Download the standardized voter roster template or prepare a UTF-8 CSV file containing:
   ```csv
   student_id,name,email,department,year
   STU001,Alice Smith,alice@uni.edu,Computer Science,3
   STU002,Bob Jones,bob@uni.edu,Electronics,2
   ```
2. Navigate to **"Voter Roll Import"**.
3. Select the target election from the dropdown menu.
4. Choose your prepared CSV file and click **"Upload & Process Roster"**.
5. The system performs:
   - Syntax validation on email formats and student IDs.
   - Duplicate prevention checks.
   - Generation of salted cryptographic hashes (`voter_hash`) stored in `voter_records`.
6. An ingestion summary card displays: *Total records parsed, voters registered, and duplicates skipped*.

### 3.5 Activating the Election & Polling Window
1. Verify that candidate nominations and voter rolls are complete.
2. Click **"Activate Election"**.
3. The election state changes to `Active`. When server time reaches the scheduled `start_time`, registered students will be allowed to cast ballots.

### 3.6 Closing the Election & Publishing Final Results
1. When polling ends (`server_time >= end_time`), the system automatically disables vote casting.
2. The Election Commissioner reviews the closing status on the Admin Dashboard.
3. Click **"Tally & Publish Results"**.
4. The system executes the atomic database tally query, certifies the winner, sets `results_published = True`, and makes the verified analytics publicly visible.

### 3.7 Inspecting the System Audit Trail
1. Click the **"Audit Logs"** tab in the admin portal.
2. Review the chronological, tamper-evident log stream.
3. Every entry captures:
   - Precise UTC Timestamp
   - Event Action (e.g., `LOGIN_SUCCESS`, `VOTER_IMPORT`, `VOTE_CAST`, `ELECTION_ACTIVATED`)
   - Client IP Address and User-Agent
   - Contextual Details
4. Filter by date, event type, or student ID for compliance auditing.

---

## 4. Frequently Asked Questions (FAQ) & Troubleshooting

### Q1: Can an administrator see who I voted for?
**No.** The system architecture physically prevents this. Your student identity is stored in `voter_records` solely to record that you have voted (`has_voted = True`). Your candidate choice is saved in an independent, anonymous table `ballot_entries` that has no user ID or student ID. Even with complete database administrator privileges, it is mathematically impossible to link your identity to your vote.

### Q2: What happens if I lose my internet connection while submitting my vote?
The submission occurs within an ACID database transaction:
- If the connection drops before the server processes the vote, the database transaction rolls back. Your record remains `has_voted = False`. You can log in and submit your vote again.
- If the connection drops after the server successfully commits the vote, your vote is safely counted. When you log back in, the portal will display your confirmed status as "Already Voted".

### Q3: Why am I getting the error "Election is not active or outside voting window"?
Voting is strictly restricted to the official hours configured by the Election Commission. Please verify the start and closing times on your voter dashboard.

### Q4: I did not receive my OTP code in my email.
1. Check your email's Spam or Junk folder.
2. Wait 60 seconds and click **"Resend Code"**.
3. Ensure you are logging in with your official registered institutional email address.

---
**Maintained by:** Campus Election Commission & Technical Support Team  
**Emergency Support Email:** `evoting-support@campus.edu`
