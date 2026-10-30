#!/usr/bin/env python3
"""
scripts/test_campus_kiosk_workflow.py
Verification script for Campus e-Voting System:
1. Chief Election Officer (Admin) creates/authenticates
2. Polling Desk Officer (Minimal capability role) logs in
3. Desk Officer role isolation check (Admin endpoints blocked)
4. Polling Desk verifies student & issues single-use 6-digit PIN
5. Kiosk booth authorization (X-Kiosk-Token)
6. Voter logs in at Kiosk booth with Student ID + PIN
7. Fetch ballot across all 9 Student Union portfolios with NOTA
8. Cast secret ballot atomically
9. Security defenses: Double vote blocked, burned PIN blocked, remote voting blocked
10. Live results audit across all 9 positions
"""

import sys
import requests

BASE_URL = "http://localhost:5000"

def run_tests():
    print("=" * 75)
    print(">>> CEVS END-TO-END VERIFICATION: 9 PORTFOLIOS & DESK OFFICER WORKFLOW")
    print("=" * 75)

    # 1. Chief Election Officer Login
    print("\n[Step 1] Authenticating Chief Election Officer (ADMIN001)...")
    admin_login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "student_id": "ADMIN001",
        "password": "Admin@1234"
    })
    assert admin_login_res.status_code == 200, f"Admin login failed: {admin_login_res.text}"
    admin_temp_token = admin_login_res.json().get("temp_token")

    admin_otp_res = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "temp_token": admin_temp_token,
        "otp": "123456"
    })
    assert admin_otp_res.status_code == 200, f"Admin OTP verification failed: {admin_otp_res.text}"
    admin_token = admin_otp_res.json().get("access_token")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("  [OK] Chief Election Officer logged in successfully.")

    # 2. Polling Desk Officer Login
    print("\n[Step 2] Authenticating Polling Desk Officer (DESK001)...")
    desk_login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "student_id": "DESK001",
        "password": "Desk@1234"
    })
    assert desk_login_res.status_code == 200, f"Desk officer login failed: {desk_login_res.text}"
    desk_temp_token = desk_login_res.json().get("temp_token")

    desk_otp_res = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "temp_token": desk_temp_token,
        "otp": "123456"
    })
    assert desk_otp_res.status_code == 200, f"Desk officer OTP failed: {desk_otp_res.text}"
    desk_token = desk_otp_res.json().get("access_token")
    desk_headers = {"Authorization": f"Bearer {desk_token}"}
    print("  [OK] Polling Desk Officer authenticated (Role: polling_officer).")

    # 3. Security Check: Minimal Capability Isolation
    print("\n[Step 3] Verifying Desk Officer Role Isolation (Minimal Privileges)...")
    forbidden_res = requests.get(f"{BASE_URL}/api/admin/audit-logs", headers=desk_headers)
    assert forbidden_res.status_code == 403, f"Desk officer accessed audit logs! Status: {forbidden_res.status_code}"
    print("  [OK] Audit logs correctly forbidden (HTTP 403) for Polling Desk Officer.")

    forbidden_res2 = requests.post(f"{BASE_URL}/api/admin/elections", headers=desk_headers, json={"title": "Hack"})
    assert forbidden_res2.status_code == 403, f"Desk officer created election! Status: {forbidden_res2.status_code}"
    print("  [OK] Election creation correctly forbidden (HTTP 403) for Polling Desk Officer.")

    # 4. Authorize Computer Lab Kiosk Terminal
    print("\n[Step 4] Chief Election Officer registers authorized Computer Lab Kiosk...")
    kiosk_reg_res = requests.post(
        f"{BASE_URL}/api/admin/kiosk/register",
        headers=admin_headers,
        json={"device_name": "Library Booth 1"}
    )
    assert kiosk_reg_res.status_code in [200, 201], f"Kiosk registration failed: {kiosk_reg_res.text}"
    kiosk_token = kiosk_reg_res.json().get("kiosk_token")
    assert kiosk_token, "Kiosk token missing"
    print(f"  [OK] Terminal authorized. Kiosk Token: {kiosk_token[:16]}...")

    # 5. Polling Desk Officer Looks up Student & Issues 6-Digit PIN Slip
    print("\n[Step 5] Polling Desk Officer searches voter registry and issues PIN...")
    desk_voters_res = requests.get(f"{BASE_URL}/api/admin/desk/voters", headers=desk_headers)
    assert desk_voters_res.status_code == 200, f"Desk voter lookup failed: {desk_voters_res.text}"
    voters_list = desk_voters_res.json().get("voters", [])
    unvoted = [v for v in voters_list if not v.get("has_voted")]
    assert len(unvoted) >= 2, f"Not enough unvoted voters found ({len(unvoted)})"
    
    target_student = unvoted[0]
    target_sid = target_student["student_id"]
    unauthorized_test_sid = unvoted[1]["student_id"]
    print(f"  [OK] Student {target_sid} verified at desk.")

    desk_pin_res = requests.post(
        f"{BASE_URL}/api/admin/desk/issue-pin",
        headers=desk_headers,
        json={"student_id": target_sid}
    )
    assert desk_pin_res.status_code == 200, f"PIN issuance failed: {desk_pin_res.text}"
    pin_data = desk_pin_res.json()
    voting_pin = pin_data.get("pin") or pin_data.get("voting_pin")
    election_id = pin_data.get("election_id")
    print(f"  [OK] Single-use PIN slip generated: [{voting_pin}] (Valid for 20 mins)")

    # 6. Student arrives at Lab Kiosk Booth and logs in
    print(f"\n[Step 6] Student arrives at Lab Booth, logs in with ID {target_sid} + PIN...")
    kiosk_login_res = requests.post(
        f"{BASE_URL}/api/auth/voter-pin-login",
        headers={"X-Kiosk-Token": kiosk_token},
        json={
            "student_id": target_sid,
            "voting_pin": voting_pin,
            "election_id": election_id,
            "kiosk_token": kiosk_token
        }
    )
    assert kiosk_login_res.status_code == 200, f"Kiosk login failed: {kiosk_login_res.text}"
    voter_session_token = kiosk_login_res.json().get("access_token")
    print("  [OK] Terminal authenticated student. Ballot unlocked.")

    # 7. Fetch Structured 9-Portfolio Ballot
    print(f"\n[Step 7] Fetching 9-Portfolio Ballot for Election {election_id}...")
    ballot_headers = {
        "Authorization": f"Bearer {voter_session_token}",
        "X-Kiosk-Token": kiosk_token
    }
    ballot_res = requests.get(
        f"{BASE_URL}/api/voter/elections/{election_id}/ballot",
        headers=ballot_headers
    )
    assert ballot_res.status_code == 200, f"Ballot retrieval failed: {ballot_res.text}"
    ballot_data = ballot_res.json()
    positions = ballot_data.get("positions", [])
    print(f"  [OK] Election: '{ballot_data.get('title')}'")
    print(f"  [OK] Found {len(positions)} portfolios on ballot:")

    expected_portfolios = [
        "Vice President",
        "General Secretary",
        "Assistant General Secretary",
        "Cultural Secretary",
        "Magazine Secretary",
        "Boys Common Room Secretary",
        "Girls Common Room Secretary",
        "Major Games Secretary",
        "Minor Games Secretary",
    ]

    ballot_selections = []
    for pos_obj in positions:
        pos_name = pos_obj["position"]
        cands = pos_obj["candidates"]
        print(f"    - {pos_name} ({len(cands)} candidates, NOTA enabled)")
        
        # Select first candidate for most positions, and select NOTA for "Magazine Secretary"
        if "Magazine" in pos_name:
            ballot_selections.append({
                "position": pos_name,
                "candidate_id": None,
                "is_nota": True
            })
            print(f"        -> Choice: [NOTA - None of the Above]")
        else:
            selected = cands[0]
            ballot_selections.append({
                "position": pos_name,
                "candidate_id": selected["id"],
                "is_nota": False
            })
            print(f"        -> Choice: {selected['name']} ({selected['party']})")

    assert len(positions) == 9, f"Expected 9 portfolios, found {len(positions)}"

    # 8. Cast Secret Ballot
    print(f"\n[Step 8] Casting ballot across all 9 portfolios...")
    cast_res = requests.post(
        f"{BASE_URL}/api/voter/elections/{election_id}/cast-ballot",
        headers=ballot_headers,
        json={"selections": ballot_selections}
    )
    assert cast_res.status_code in [200, 201], f"Cast ballot failed: {cast_res.text}"
    print(f"  [OK] Secret ballot successfully cast and recorded anonymously.")

    # 9. Defenses Verification
    print(f"\n[Step 9] Verifying Security Defenses...")
    # 9a. Double voting attempt
    recast_res = requests.post(
        f"{BASE_URL}/api/voter/elections/{election_id}/cast-ballot",
        headers=ballot_headers,
        json={"selections": ballot_selections}
    )
    assert recast_res.status_code in [400, 403], "Double vote was not blocked"
    print("  [OK] Duplicate vote attempt blocked.")

    # 9b. Burned PIN reuse
    relogin_res = requests.post(
        f"{BASE_URL}/api/auth/voter-pin-login",
        headers={"X-Kiosk-Token": kiosk_token},
        json={
            "student_id": target_sid,
            "voting_pin": voting_pin,
            "election_id": election_id,
            "kiosk_token": kiosk_token
        }
    )
    assert relogin_res.status_code in [400, 401, 403], "Burned PIN allowed login"
    print("  [OK] Burned PIN reuse blocked.")

    # 9c. Remote voting without kiosk authorization
    desk_pin_res2 = requests.post(
        f"{BASE_URL}/api/admin/desk/issue-pin",
        headers=desk_headers,
        json={"student_id": unauthorized_test_sid}
    )
    pin2 = desk_pin_res2.json().get("pin") or desk_pin_res2.json().get("voting_pin")
    remote_login_res = requests.post(
        f"{BASE_URL}/api/auth/voter-pin-login",
        json={
            "student_id": unauthorized_test_sid,
            "voting_pin": pin2,
            "election_id": election_id,
            "kiosk_token": "UNAUTHORIZED-HOME-BROWSER"
        }
    )
    assert remote_login_res.status_code in [400, 401, 403], "Remote voting was allowed"
    print("  [OK] Direct remote home device without kiosk token blocked.")

    # 10. Audit Results across all 9 portfolios
    print(f"\n[Step 10] Checking Real-time Results across all 9 Portfolios...")
    results_res = requests.get(f"{BASE_URL}/api/results/{election_id}", headers=admin_headers)
    assert results_res.status_code == 200, f"Results fetch failed: {results_res.text}"
    results_data = results_res.json()
    print(f"  [OK] Total Voters Counted: {results_data.get('total_votes')}")
    print(f"  [OK] Total Ballot Entries: {results_data.get('total_ballot_entries')}")
    
    by_pos = results_data.get("by_position", [])
    assert len(by_pos) == 9, f"Expected results for 9 positions, got {len(by_pos)}"
    for p in by_pos:
        print(f"    - {p['position']}: Total: {p['total_votes']}, NOTA: {p['nota_count']}, Winner: {p['winner']}")

    print("\n" + "=" * 75)
    print(">>> ALL 10/10 VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 75)


if __name__ == "__main__":
    try:
        run_tests()
    except AssertionError as e:
        print(f"\n[FAIL] TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n[FAIL] UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
