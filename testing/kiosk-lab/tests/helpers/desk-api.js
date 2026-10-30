/**
 * desk-api.js — Helper utility for Polling Desk API operations in Playwright tests
 * Handles Polling Desk Officer authentication and single-use 6-digit PIN slip generation.
 */

class DeskApiHelper {
  constructor(baseUrl = process.env.BASE_URL || 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  /**
   * Authenticate as Polling Desk Officer (DESK001) with 2-factor OTP verification.
   */
  async loginDeskOfficer(studentId = 'DESK001', password = 'Desk@1234', otp = '123456') {
    // 1. Initial credential verification
    const loginRes = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id: studentId, password: password })
    });

    if (!loginRes.ok) {
      const err = await loginRes.text();
      throw new Error(`Desk officer login failed (${loginRes.status}): ${err}`);
    }

    const loginData = await loginRes.json();
    const tempToken = loginData.temp_token;

    // 2. Complete 2FA OTP verification
    const otpRes = await fetch(`${this.baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temp_token: tempToken, otp: otp })
    });

    if (!otpRes.ok) {
      const err = await otpRes.text();
      throw new Error(`Desk officer OTP verification failed (${otpRes.status}): ${err}`);
    }

    const otpData = await otpRes.json();
    this.token = otpData.access_token;
    return this.token;
  }

  /**
   * Search voter list at Polling Desk and find unvoted students.
   */
  async getUnvotedVoter() {
    if (!this.token) {
      await this.loginDeskOfficer();
    }

    const res = await fetch(`${this.baseUrl}/api/admin/desk/voters`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch desk voters (${res.status})`);
    }

    const data = await res.json();
    const voters = data.voters || [];
    const unvoted = voters.filter(v => !v.has_voted);

    if (unvoted.length === 0) {
      throw new Error('No unvoted students found in seed database.');
    }

    return unvoted[0];
  }

  /**
   * Issue a single-use 6-digit Voting PIN slip for a verified student.
   * Returns: { student_id, voting_pin, election_id }
   */
  async issueVotingPin(studentId = null) {
    if (!this.token) {
      await this.loginDeskOfficer();
    }

    let targetSid = studentId;
    if (!targetSid) {
      const voter = await this.getUnvotedVoter();
      targetSid = voter.student_id;
    }

    const res = await fetch(`${this.baseUrl}/api/admin/desk/issue-pin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ student_id: targetSid })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PIN issuance failed for ${targetSid} (${res.status}): ${err}`);
    }

    const pinData = await res.json();
    const pin = pinData.pin || pinData.voting_pin;

    return {
      student_id: targetSid,
      voting_pin: pin,
      election_id: pinData.election_id
    };
  }
}

module.exports = { DeskApiHelper };
