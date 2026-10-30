#!/usr/bin/env python3
"""
scripts/test_campus_kiosk_workflow.py
Verification script for Campus e-Voting System:
1. Physical Registration Desk PIN Issuance
2. Computer Lab Kiosk Authorization (X-Kiosk-Token)
3. Multi-Position Balloting with NOTA
4. Double-Vote & Replay Defense
5. Direct Remote Voting Prevention
"""

import sys
import requests

BASE_URL = "http://localhost:5000"

def run_tests():
    print("=" * 70)
    print(">>> CEVS END-TO-END VERIFICATION: DESK PIN & LAB KIOSK BOOTH WORKFLOW")
    print("=" * 70)

    # 1. Admin Login
    print("\n[Step 1] Authenticating Admin (ADMIN001)...")
    res = requests.post(f"{BASE_URL}/api/auth/login", json={
        "student_id": "ADMIN001",
        "password": "Admin@1234"
    })
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    login_json = res.json()
    temp_token = login_json.get("temp_token")
    assert temp_token, f"Expected temp_token in login response: {login_json}"

    # OTP Verification for Admin
    otp_res = requests.post(f"{BASE_URL}/api/auth/verify-otp", json={
        "temp_token": temp_token,
        "otp": "123456"
    })
    assert otp_res.status_code == 200, f"OTP verification failed: {otp_res.text}"
    admin_token = otp_res.json().get("access_token")
    assert admin_token, f"Expected access_token in OTP response: {otp_res.json()}"
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("  [OK] Admin logged in successfully.")

    # 2. Register a Lab Kiosk Terminal
    print("\n[Step 2] Authorizing Computer Lab Kiosk Terminal...")
    res = requests.post(
        f"{BASE_URL}/api/admin/kiosk/register",
        headers=admin_headers,
        json={
            "device_name": "Library Terminal 1"
        }
    )
    assert res.status_code in [200, 201], f"Kiosk registration failed: {res.text}"
    kiosk_data = res.json()
    kiosk_token = kiosk_data.get("kiosk_token")
    assert kiosk_token, f"Expected kiosk_token: {kiosk_data}"
    print(f"  [OK] Kiosk registered! Kiosk Token: {kiosk_token[:16]}...")

    # 3. Dynamic Unvoted Student Selection & Desk PIN Issuance
    print("\n[Step 3] Polling Desk: Finding an eligible student who has not yet voted...")
    voters_res = requests.get(
        f"{BASE_URL}/api/admin/desk/voters",
        headers=admin_headers
    )
    assert voters_res.status_code == 200, f"Desk voter lookup failed: {voters_res.text}"
    voters_list = voters_res.json().get("voters", [])
    unvoted = [v for v in voters_list if not v.get("has_voted")]
    assert len(unvoted) >= 2, "Need at least 2 unvoted students to run full test suite"
    
    target_student = unvoted[0]
    target_student_id = target_student["student_id"]
    unauthorized_test_student = unvoted[1]["student_id"]
    print(f"  [OK] Selected unvoted voter: {target_student_id} ({target_student['name']})")

    print(f"  Issuing PIN for {target_student_id}...")
    desk_res = requests.post(
        f"{BASE_URL}/api/admin/desk/issue-pin",
        headers=admin_headers,
        json={"student_id": target_student_id}
    )
    assert desk_res.status_code == 200, f"PIN issuance failed: {desk_res.text}"
    desk_data = desk_res.json()
    voting_pin = desk_data.get("pin") or desk_data.get("voting_pin")
    election_id = desk_data.get("election_id", 3)
    assert voting_pin, f"Expected voting PIN: {desk_data}"
    print(f"  [OK] PIN issued for {target_student_id}: [{voting_pin}] (Expires in: {desk_data.get('validity_minutes', 20)} mins)")

    # 4. Kiosk Booth Login with Student ID + PIN
    print(f"\n[Step 4] Student arrives at Lab Booth, logs in with Student ID + PIN...")
    kiosk_headers = {"X-Kiosk-Token": kiosk_token}
    kiosk_login_res = requests.post(
        f"{BASE_URL}/api/auth/voter-pin-login",
        headers=kiosk_headers,
        json={
            "student_id": target_student_id,
            "voting_pin": voting_pin,
            "election_id": election_id,
            "kiosk_token": kiosk_token
        }
    )
    assert kiosk_login_res.status_code == 200, f"Kiosk login failed: {kiosk_login_res.text}"
    voter_session_token = kiosk_login_res.json().get("access_token")
    assert voter_session_token, f"Expected access_token: {kiosk_login_res.json()}"
    print("  [OK] Kiosk login successful. One-time voter session token granted.")

    # 5. Fetch Multi-Position Ballot
    voter_auth_headers = {
        "Authorization": f"Bearer {voter_session_token}",
        "X-Kiosk-Token": kiosk_token
    }
    print(f"\n[Step 5] Fetching ballot for Election {election_id}...")
    ballot_res = requests.get(
        f"{BASE_URL}/api/voter/elections/{election_id}/ballot",
        headers=voter_auth_headers
    )
    assert ballot_res.status_code == 200, f"Ballot fetch failed: {ballot_res.text}"
    ballot_data = ballot_res.json()
    positions = ballot_data.get("positions", [])
    print(f"  [OK] Ballot retrieved. Election: '{ballot_data.get('title')}'")
    print(f"  [OK] Found {len(positions)} positions on ballot:")
    
    ballot_selections = []
    for pos_obj in positions:
        pos_name = pos_obj["position"]
        cands = pos_obj["candidates"]
        print(f"    - Position: '{pos_name}' ({len(cands)} candidates available)")
        for c in cands:
            print(f"        * [ID {c['id']}] {c['name']} ({c['party']})")
        
        # Prepare selection: For 'General Secretary', pick NOTA; for others, pick candidate 1
        if "General Secretary" in pos_name:
            ballot_selections.append({
                "position": pos_name,
                "candidate_id": None,
                "is_nota": True
            })
            print(f"        -> Selected: [NOTA - None of the Above]")
        else:
            selected_cand = cands[0]
            ballot_selections.append({
                "position": pos_name,
                "candidate_id": selected_cand["id"],
                "is_nota": False
            })
            print(f"        -> Selected: Candidate ID {selected_cand['id']} ({selected_cand['name']})")

    # 6. Cast Multi-Position Secret Ballot
    print(f"\n[Step 6] Casting ballot across all positions...")
    cast_res = requests.post(
        f"{BASE_URL}/api/voter/elections/{election_id}/cast-ballot",
        headers=voter_auth_headers,
        json={"selections": ballot_selections}
    )
    assert cast_res.status_code in [200, 201], f"Ballot cast failed: {cast_res.text}"
    cast_data = cast_res.json()
    receipts = cast_data.get("receipts", [])
    print(f"  [OK] Ballot accepted! Message: {cast_data.get('message')}")
    print(f"  [OK] Blind tokens generated: {len(receipts)} positions confirmed.")

    # 7. Security Test: Double-Vote Prevention
    print(f"\n[Step 7] Testing Double-Vote Prevention (replay attack)...")
    recast_res = requests.post(
        f"{BASE_URL}/api/voter/elections/{election_id}/cast-ballot",
        headers=voter_auth_headers,
        json={"selections": ballot_selections}
    )
    assert recast_res.status_code in [400, 403], f"Double voting was not blocked! Status: {recast_res.status_code}"
    print(f"  [OK] Blocked duplicate vote: {recast_res.json().get('message')}")

    # 8. Security Test: Attempt Login with Burned PIN
    print(f"\n[Step 8] Testing Burned PIN reuse...")
    relogin_res = requests.post(
        f"{BASE_URL}/api/auth/voter-pin-login",
        headers=kiosk_headers,
        json={
            "student_id": target_student_id,
            "voting_pin": voting_pin,
            "election_id": election_id,
            "kiosk_token": kiosk_token
        }
    )
    assert relogin_res.status_code in [400, 401, 403], f"Burned PIN allowed login! Status: {relogin_res.status_code}"
    print(f"  [OK] Blocked burned PIN login: {relogin_res.json().get('message')}")

    # 9. Security Test: Attempt Voting Without Kiosk Token (Remote Home Attempt)
    print(f"\n[Step 9] Testing Remote Voting Prevention (Voting from home without Kiosk token)...")
    desk_res3 = requests.post(
        f"{BASE_URL}/api/admin/desk/issue-pin",
        headers=admin_headers,
        json={"student_id": unauthorized_test_student}
    )
    pin3 = desk_res3.json().get("pin") or desk_res3.json().get("voting_pin")
    # Attempt login with invalid kiosk token
    unauthorized_kiosk_res = requests.post(
        f"{BASE_URL}/api/auth/voter-pin-login",
        json={
            "student_id": unauthorized_test_student,
            "voting_pin": pin3,
            "election_id": election_id,
            "kiosk_token": "UNAUTHORIZED-HOME-BROWSER"
        }
    )
    assert unauthorized_kiosk_res.status_code in [400, 401, 403], f"Home/Unauthorized device was not blocked!"
    print(f"  [OK] Remote unauthorized device blocked: {unauthorized_kiosk_res.json().get('message')}")

    # 10. Audit Results & Anonymous Integrity
    print(f"\n[Step 10] Checking Position Breakdown & NOTA Tally in Results...")
    results_res = requests.get(
        f"{BASE_URL}/api/results/{election_id}",
        headers=admin_headers
    )
    assert results_res.status_code == 200, f"Results fetch failed: {results_res.text}"
    results_data = results_res.json()
    print(f"  [OK] Total Unique Voters Counted: {results_data.get('total_votes')}")
    print(f"  [OK] Total Ballot Entries: {results_data.get('total_ballot_entries')}")
    
    positions_list = results_data.get("by_position", [])
    for p in positions_list:
        print(f"    - Position '{p.get('position')}':")
        print(f"        Total Votes: {p.get('total_votes')}")
        print(f"        NOTA Votes: {p.get('nota_count')} ({p.get('nota_percentage')}%)")
        print(f"        Winner: {p.get('winner')}")
        for c in p.get("candidates", []):
            print(f"          * {c['name']} ({c['party']}): {c['votes']} votes ({c['percentage']}%) [Winner: {c['is_winner']}]")

    print("\n" + "=" * 70)
    print(">>> ALL 10/10 VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

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
