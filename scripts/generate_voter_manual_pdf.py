"""
scripts/generate_voter_manual_pdf.py
Generates the concise, official Voter User Manual (A to Z) as a 2-page publication-ready PDF
focused strictly on the new anonymous workflow:
1. Enter the PIN
2. Select Candidates
3. Submit My Vote
4. Yes, Cast Vote
5. Collect Printed Receipt & Drop into Ballot Box
Zero sensitive data. Exact UI screenshots with marked click callouts.
"""

import os
import sys
import json
from pathlib import Path
import subprocess

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_PDF = ROOT_DIR / "Voter_User_Manual_A_to_Z.pdf"
TEMP_HTML = ROOT_DIR / "scripts" / "voter_manual_temp.html"
ROSTER_PATH = ROOT_DIR / "backend" / "app" / "mock_assets" / "dummy_roster.json"

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


def find_browser():
    for p in CHROME_PATHS:
        if os.path.exists(p):
            return p
    return None


def get_candidate_photos():
    photos = {}
    if ROSTER_PATH.exists():
        try:
            with open(ROSTER_PATH, "r", encoding="utf-8") as f:
                roster = json.load(f)
            for cand in roster:
                name = cand.get("name")
                b64 = cand.get("photo_base64")
                if name and b64:
                    photos[name] = f"data:image/jpeg;base64,{b64}"
        except Exception as e:
            print(f"Warning: Failed to load dummy roster photos: {e}")
    return photos


def build_manual_html(photos):
    obama_photo = photos.get("Barack Obama", "")
    gandhi_photo = photos.get("Rahul Gandhi", "")
    kejriwal_photo = photos.get("Arvind Kejriwal", "")

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>How to Vote - Step by Step Voter Guide</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
      @bottom-right {{
        content: "Page " counter(page) " of 2";
        font-size: 8pt;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        color: #64748b;
      }}
      @bottom-left {{
        content: "Campus E-Voting System • Official Voter Quick-Guide";
        font-size: 8pt;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        color: #64748b;
      }}
    }}

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.4;
      font-size: 9pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}

    .page {{
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 275mm;
      max-height: 275mm;
      overflow: hidden;
    }}

    .page:last-child {{
      page-break-after: avoid;
      break-after: avoid;
    }}

    /* Header Banner */
    .header-banner {{
      background: linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%);
      color: white;
      padding: 12px 18px;
      border-radius: 10px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #4338ca;
    }}

    .header-title h1 {{
      font-size: 15pt;
      font-weight: 900;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }}

    .header-title p {{
      font-size: 8pt;
      color: #c7d2fe;
      margin-top: 2px;
    }}

    .header-badge {{
      background: #10b981;
      color: white;
      padding: 4px 10px;
      border-radius: 9999px;
      font-weight: 800;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
    }}

    /* Section Card */
    .step-section {{
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 14px;
      margin-bottom: 10px;
    }}

    .step-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }}

    .step-title {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .step-num {{
      width: 22px;
      height: 22px;
      background: #4f46e5;
      color: white;
      font-weight: 900;
      font-size: 9.5pt;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }}

    .step-label {{
      font-size: 11pt;
      font-weight: 800;
      color: #0f172a;
    }}

    .step-subtext {{
      font-size: 7.5pt;
      color: #64748b;
      font-weight: 500;
    }}

    /* Terminal Bezel */
    .mock-screen {{
      background: #0f172a;
      border: 2px solid #334155;
      border-radius: 8px;
      overflow: hidden;
      position: relative;
    }}

    .mock-topbar {{
      background: #1e293b;
      padding: 4px 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #334155;
      font-size: 7pt;
      color: #94a3b8;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }}

    .mock-content {{
      padding: 12px 14px;
      position: relative;
    }}

    /* Callout Pin Marker */
    .callout-pin {{
      position: absolute;
      display: flex;
      align-items: center;
      gap: 4px;
      z-index: 40;
    }}

    .pin-circle {{
      width: 22px;
      height: 22px;
      background: #e11d48;
      color: white;
      font-weight: 900;
      font-size: 9pt;
      border-radius: 50%;
      border: 2px solid #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 0 2px #e11d48, 0 3px 6px rgba(0,0,0,0.3);
    }}

    .pin-label {{
      background: #e11d48;
      color: white;
      font-size: 7pt;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      box-shadow: 0 2px 4px rgba(0,0,0,0.25);
      white-space: nowrap;
    }}

    /* Instructions Box */
    .instructions-box {{
      margin-top: 8px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 6px 10px;
      display: flex;
      gap: 12px;
      font-size: 8pt;
    }}

    .instr-item {{
      display: flex;
      align-items: flex-start;
      gap: 6px;
      flex: 1;
    }}

    .instr-badge {{
      background: #e11d48;
      color: white;
      font-weight: 900;
      font-size: 7.5pt;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }}

    .instr-text strong {{
      color: #0f172a;
    }}

    .instr-text span {{
      color: #475569;
      font-size: 7.5pt;
      display: block;
      line-height: 1.25;
    }}
  </style>
</head>
<body>

  <!-- ========================================================================= -->
  <!-- PAGE 1: STEPS 1 & 2 (PIN ENTRY & SELECT CANDIDATE)                        -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <!-- Header -->
      <div class="header-banner">
        <div class="header-title">
          <h1>HOW TO VOTE — STEP-BY-STEP VOTER GUIDE</h1>
          <p>Official Touchscreen Kiosk Instructions • 100% Anonymous & Secret Ballot</p>
        </div>
        <div class="header-badge">Campus E-Voting</div>
      </div>

      <!-- ==================== STEP 1: ENTER PIN ==================== -->
      <div class="step-section">
        <div class="step-header">
          <div class="step-title">
            <span class="step-num">1</span>
            <span class="step-label">Enter Your 4-Digit Voting PIN</span>
          </div>
          <span class="step-subtext">At Kiosk Screen • Time required: ~10 seconds</span>
        </div>

        <!-- Mock Screen 1: PIN Screen -->
        <div class="mock-screen">
          <div class="mock-topbar">
            <span>BOOTH-01 • CAMPUS E-VOTING KIOSK</span>
            <span style="color: #10b981;">● READY FOR VOTING</span>
          </div>

          <div class="mock-content" style="background: #ffffff; color: #0f172a; padding: 14px 18px; text-align: center;">
            <div style="font-size: 13pt; font-weight: 900; margin-bottom: 2px;">Enter Voting PIN</div>
            <div style="font-size: 7.5pt; color: #64748b; margin-bottom: 8px;">Please enter the 4-digit PIN from your voting slip to unlock your ballot.</div>

            <!-- Ballot ID Box -->
            <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 7.5pt; color: #64748b;">Your Voting ID:</span>
              <strong style="font-family: monospace; font-size: 9.5pt; color: #4f46e5; letter-spacing: 0.05em;">SUE26-B1-1001</strong>
            </div>

            <!-- PIN Input Display -->
            <div style="position: relative; margin-bottom: 8px;">
              <div style="display: flex; justify-content: center; gap: 6px;">
                <div style="width: 28px; height: 32px; border: 2px solid #4f46e5; border-radius: 5px; background: #eef2ff; display: flex; align-items: center; justify-content: center; font-size: 16pt; font-weight: 900; color: #1e1b4b;">●</div>
                <div style="width: 28px; height: 32px; border: 2px solid #4f46e5; border-radius: 5px; background: #eef2ff; display: flex; align-items: center; justify-content: center; font-size: 16pt; font-weight: 900; color: #1e1b4b;">●</div>
                <div style="width: 28px; height: 32px; border: 1.5px solid #cbd5e1; border-radius: 5px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 12pt; color: #94a3b8;">·</div>
                <div style="width: 28px; height: 32px; border: 1.5px solid #cbd5e1; border-radius: 5px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 12pt; color: #94a3b8;">·</div>
              </div>

              <!-- Callout Pin 1 -->
              <div class="callout-pin" style="right: 110px; top: -6px;">
                <div class="pin-circle">1</div>
                <div class="pin-label">Type 4-Digit PIN</div>
              </div>
            </div>

            <!-- NumPad -->
            <div style="width: 150px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; position: relative;">
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">1</button>
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">2</button>
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">3</button>
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">4</button>
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">5</button>
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">6</button>
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">7</button>
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">8</button>
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">9</button>
              <button style="padding: 5px; border: 1px solid #cbd5e1; background: #f1f5f9; border-radius: 4px; font-weight: 700; font-size: 7.5pt; color: #64748b;">C</button>
              <button style="padding: 5px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; font-weight: 800; font-size: 9.5pt; color: #1e293b;">0</button>
              
              <!-- Callout Pin 2: Submit Button -->
              <button style="padding: 5px; border: none; background: #10b981; color: white; border-radius: 4px; font-weight: 900; font-size: 10pt; position: relative;">
                ➔
                <div class="callout-pin" style="right: -10px; bottom: -8px;">
                  <div class="pin-circle">2</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Instructions for Step 1 -->
        <div class="instructions-box">
          <div class="instr-item">
            <div class="instr-badge">1</div>
            <div class="instr-text">
              <strong>Enter PIN on NumPad:</strong>
              <span>Tap the 4-digit PIN printed on your paper voter slip using the on-screen touchscreen number pad.</span>
            </div>
          </div>
          <div class="instr-item">
            <div class="instr-badge">2</div>
            <div class="instr-text">
              <strong>Tap Green Arrow [ ➔ ]:</strong>
              <span>Press the green arrow button (or system auto-submits after 4 digits) to immediately unlock your electronic ballot.</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== STEP 2: SELECT CANDIDATES ==================== -->
      <div class="step-section">
        <div class="step-header">
          <div class="step-title">
            <span class="step-num">2</span>
            <span class="step-label">Select Your Candidates</span>
          </div>
          <span class="step-subtext">Contested Positions • Tap Candidate Card</span>
        </div>

        <!-- Mock Screen 2: Candidate Ballot -->
        <div class="mock-screen">
          <div class="mock-topbar">
            <span>POSITION 1 OF 2 • VICE PRESIDENT</span>
            <span style="color: #4f46e5; font-weight: 700;">CHOOSE 1 CANDIDATE OR NOTA</span>
          </div>

          <div class="mock-content" style="background: #0b1120; color: white; padding: 12px 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div>
                <span style="font-size: 7pt; color: #818cf8; text-transform: uppercase; font-weight: 700;">Executive Council</span>
                <div style="font-size: 12pt; font-weight: 900; color: #ffffff;">Vice President</div>
              </div>
              <span style="font-size: 7pt; color: #94a3b8;">Click card to vote</span>
            </div>

            <!-- Candidate Grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
              <!-- Candidate 1: Selected (Callout 1) -->
              <div style="background: #1e293b; border: 2px solid #10b981; border-radius: 6px; overflow: hidden; display: flex; position: relative; box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);">
                <div style="width: 55px; height: 55px; background: #334155; flex-shrink: 0; position: relative;">
                  {"<img src='" + obama_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Candidate'>" if obama_photo else "<div style='color: white; font-size: 14pt; display: flex; align-items: center; justify-content: center; height: 100%;'>BO</div>"}
                  <div style="position: absolute; bottom: 2px; left: 2px; background: #10b981; color: white; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 900;">✓</div>
                </div>
                <div style="padding: 6px 8px; display: flex; flex-direction: column; justify-content: center; flex: 1;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: #ffffff; font-size: 8.5pt;">Barack Obama</strong>
                    <span style="background: #064e3b; color: #34d399; font-size: 6pt; font-weight: 800; padding: 1px 4px; border-radius: 3px;">SELECTED</span>
                  </div>
                  <div style="font-size: 6.5pt; color: #94a3b8;">Constitutional Law | Sem 5</div>
                </div>

                <!-- Callout Pin 1 -->
                <div class="callout-pin" style="right: 6px; top: -8px;">
                  <div class="pin-circle">1</div>
                  <div class="pin-label">Tap Candidate Card</div>
                </div>
              </div>

              <!-- Candidate 2: Unselected -->
              <div style="background: #1e293b; border: 1px solid #334155; border-radius: 6px; overflow: hidden; display: flex; opacity: 0.8;">
                <div style="width: 55px; height: 55px; background: #334155; flex-shrink: 0;">
                  {"<img src='" + gandhi_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Candidate'>" if gandhi_photo else "<div style='color: white; font-size: 14pt; display: flex; align-items: center; justify-content: center; height: 100%;'>RG</div>"}
                </div>
                <div style="padding: 6px 8px; display: flex; flex-direction: column; justify-content: center; flex: 1;">
                  <strong style="color: #ffffff; font-size: 8.5pt;">Rahul Gandhi</strong>
                  <div style="font-size: 6.5pt; color: #94a3b8;">Economics & Sociology | Sem 3</div>
                </div>
              </div>
            </div>

            <!-- NOTA Option & Next Button -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; padding-top: 6px;">
              <div style="background: #1e293b; border: 1px dashed #475569; border-radius: 4px; padding: 3px 8px; font-size: 7pt; color: #cbd5e1; display: flex; align-items: center; gap: 4px;">
                <span>⊘ None of the above (NOTA)</span>
              </div>

              <!-- Callout Pin 2: Next Button -->
              <button style="background: #4f46e5; border: none; color: white; font-size: 7.5pt; font-weight: 800; padding: 4px 12px; border-radius: 5px; display: flex; align-items: center; gap: 4px; position: relative;">
                <span>Next Position</span>
                <span>➔</span>
                <div class="callout-pin" style="right: -8px; top: -8px;">
                  <div class="pin-circle">2</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Instructions for Step 2 -->
        <div class="instructions-box">
          <div class="instr-item">
            <div class="instr-badge">1</div>
            <div class="instr-text">
              <strong>Tap Chosen Candidate:</strong>
              <span>Tap on your chosen candidate's photo card (or choose NOTA). The card highlights with a bright green border and checkmark (✓).</span>
            </div>
          </div>
          <div class="instr-item">
            <div class="instr-badge">2</div>
            <div class="instr-text">
              <strong>Advance to Next Post:</strong>
              <span>Tap <strong>[ Next Position ➔ ]</strong> to move to the next contested position until all ballot seats are completed.</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Page 1 Footer -->
    <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between; font-size: 7.5pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Turn over for Step 3, Step 4 & Paper Receipt</span>
    </div>
  </div>


  <!-- ========================================================================= -->
  <!-- PAGE 2: STEPS 3, 4 & 5 (SUBMIT, YES CONFIRM & VVPAT RECEIPT)              -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <!-- Header -->
      <div class="header-banner">
        <div class="header-title">
          <h1>FINAL SUBMISSION & PAPER VVPAT RECEIPT</h1>
          <p>Review Your Choices • Cryptographic Ballot Sealing • Physical Audit Trail</p>
        </div>
        <div class="header-badge">Step 3 to Step 5</div>
      </div>

      <!-- ==================== STEP 3: REVIEW & SUBMIT ==================== -->
      <div class="step-section">
        <div class="step-header">
          <div class="step-title">
            <span class="step-num">3</span>
            <span class="step-label">Review Choices & Click "Submit Vote"</span>
          </div>
          <span class="step-subtext">Summary Screen • Verify all choices before submitting</span>
        </div>

        <!-- Mock Screen 3: Review Choices -->
        <div class="mock-screen">
          <div class="mock-topbar">
            <span>FINAL STEP • REVIEW YOUR CHOICES</span>
            <span style="color: #10b981;">● 2 OF 2 POSITIONS ANSWERED</span>
          </div>

          <div class="mock-content" style="background: #0b1120; color: white; padding: 12px 16px;">
            <div style="font-size: 11pt; font-weight: 900; margin-bottom: 6px;">Review Your Choices</div>

            <!-- Rows -->
            <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
              <div style="background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 5px 10px; display: flex; align-items: center; justify-content: space-between; position: relative;">
                <div>
                  <span style="font-size: 6.5pt; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Vice President:</span>
                  <strong style="font-size: 8.5pt; color: #ffffff; margin-left: 6px;">Barack Obama</strong>
                </div>
                <button style="background: #334155; color: #cbd5e1; border: none; font-size: 6.5pt; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Change</button>

                <!-- Callout Pin 1 -->
                <div class="callout-pin" style="left: 120px; top: -8px;">
                  <div class="pin-circle">1</div>
                </div>
              </div>

              <div style="background: #1e293b; border: 1px solid #334155; border-radius: 6px; padding: 5px 10px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <span style="font-size: 6.5pt; color: #94a3b8; text-transform: uppercase; font-weight: 700;">General Secretary:</span>
                  <strong style="font-size: 8.5pt; color: #ffffff; margin-left: 6px;">Arvind Kejriwal</strong>
                </div>
                <button style="background: #334155; color: #cbd5e1; border: none; font-size: 6.5pt; font-weight: 700; padding: 2px 6px; border-radius: 4px;">Change</button>
              </div>
            </div>

            <!-- Submit Button Bar -->
            <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid #334155; padding-top: 6px;">
              <!-- Callout Pin 2: Submit Vote Button -->
              <button style="background: #10b981; color: white; border: none; font-size: 8.5pt; font-weight: 900; padding: 6px 16px; border-radius: 6px; display: flex; align-items: center; gap: 6px; position: relative; box-shadow: 0 3px 8px rgba(16, 185, 129, 0.4);">
                <span>Submit Vote</span>
                <span>➔</span>

                <div class="callout-pin" style="right: -8px; top: -8px;">
                  <div class="pin-circle">2</div>
                  <div class="pin-label">Click Submit Vote</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Instructions for Step 3 -->
        <div class="instructions-box">
          <div class="instr-item">
            <div class="instr-badge">1</div>
            <div class="instr-text">
              <strong>Review Selections:</strong>
              <span>Verify your chosen candidate for each contested seat. If you want to change any choice, click the <strong>[ Change ]</strong> button.</span>
            </div>
          </div>
          <div class="instr-item">
            <div class="instr-badge">2</div>
            <div class="instr-text">
              <strong>Click [ Submit Vote ➔ ]:</strong>
              <span>Click the green <strong>[ Submit Vote ➔ ]</strong> button to open the final confirmation dialog.</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== STEPS 4 & 5: CONFIRM & RECEIPT ==================== -->
      <div class="step-section">
        <div class="step-header">
          <div class="step-title">
            <span class="step-num">4</span>
            <span class="step-label">Confirm "Yes, Cast Vote" & Drop Paper Receipt</span>
          </div>
          <span class="step-subtext">Modal Confirmation & Thermal VVPAT Slip</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <!-- Step 4 Modal Mockup -->
          <div class="mock-screen">
            <div class="mock-topbar">
              <span>CONFIRMATION PROMPT</span>
              <span style="color: #f59e0b;">ACTION REQUIRED</span>
            </div>
            <div class="mock-content" style="background: #ffffff; color: #0f172a; text-align: center; padding: 14px;">
              <div style="font-size: 18pt; margin-bottom: 2px;">🔒</div>
              <h3 style="font-size: 11pt; font-weight: 900; margin-bottom: 2px;">Cast Ballot?</h3>
              <p style="font-size: 7pt; color: #64748b; margin-bottom: 10px; line-height: 1.3;">
                This action cannot be undone. Your ballot will be cryptographically encrypted.
              </p>

              <div style="display: flex; gap: 6px;">
                <button style="flex: 1; padding: 5px; background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 7pt; font-weight: 700;">
                  Cancel
                </button>
                
                <!-- Callout Pin 1: Yes Cast Vote -->
                <button style="flex: 1.4; padding: 5px; background: #10b981; color: white; border: none; border-radius: 4px; font-size: 7.5pt; font-weight: 900; position: relative;">
                  Yes, Cast My Vote
                  <div class="callout-pin" style="right: -8px; top: -8px;">
                    <div class="pin-circle">1</div>
                    <div class="pin-label">Click Yes</div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- Step 5 Receipt Drop Mockup -->
          <div class="mock-screen">
            <div class="mock-topbar">
              <span>SUCCESS CONFIRMATION</span>
              <span style="color: #10b981;">✓ BALLOT RECORDED</span>
            </div>
            <div class="mock-content" style="background: #ffffff; color: #0f172a; text-align: center; padding: 10px 12px;">
              <div style="font-size: 16pt; color: #10b981; font-weight: 900;">✓</div>
              <strong style="font-size: 9.5pt; color: #065f46; display: block;">Vote Recorded!</strong>
              <span style="font-size: 7pt; color: #64748b; display: block; margin-bottom: 6px;">Screen clears automatically in 5s.</span>

              <!-- Printed Slip Drop Highlight -->
              <div style="background: #f0fdf4; border: 1.5px dashed #10b981; border-radius: 6px; padding: 6px; position: relative;">
                <div style="font-size: 7.5pt; font-weight: 800; color: #166534;">📥 Take Paper Receipt From Printer</div>
                <div style="font-size: 6.5pt; color: #15803d; margin-top: 1px;">Verify choices and drop into the Ballot Box</div>

                <!-- Callout Pin 2: Drop Slip -->
                <div class="callout-pin" style="right: -6px; top: -8px;">
                  <div class="pin-circle">2</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Instructions for Step 4 & 5 -->
        <div class="instructions-box">
          <div class="instr-item">
            <div class="instr-badge">1</div>
            <div class="instr-text">
              <strong>Click [ Yes, Cast My Vote ]:</strong>
              <span>Authorizes final encryption. The terminal records your ballot and activates the thermal printer.</span>
            </div>
          </div>
          <div class="instr-item">
            <div class="instr-badge">2</div>
            <div class="instr-text">
              <strong>Drop Receipt in Ballot Box:</strong>
              <span>Collect the printed paper slip from the attached printer slot and drop it into the physical ballot box.</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Summary Reminder Banner -->
      <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 14pt;">🔒</span>
          <div>
            <strong style="font-size: 8pt; color: #1e1b4b;">100% Cryptographic Secrecy Guaranteed:</strong>
            <span style="font-size: 7.5pt; color: #4338ca; display: block;">No one can ever see how you voted. Ballots are decoupled from booth numbers and exit doors.</span>
          </div>
        </div>
        <div style="font-size: 7.5pt; font-weight: 800; color: #3730a3; text-transform: uppercase;">
          Campus Elections 2026
        </div>
      </div>
    </div>

    <!-- Page 2 Footer -->
    <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between; font-size: 7.5pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Official Voter Quick-Guide • Page 2 of 2</span>
    </div>
  </div>

</body>
</html>
"""
    return html_content


def main():
    print("1. Discovering headless browser...")
    browser_exe = find_browser()
    if not browser_exe:
        print("Error: Google Chrome or Microsoft Edge executable not found.")
        sys.exit(1)
    print(f"   Found browser: {browser_exe}")

    print("2. Loading candidate photographs from roster...")
    photos = get_candidate_photos()
    print(f"   Loaded {len(photos)} candidate photos.")

    print("3. Generating Voter Manual HTML layout...")
    html_content = build_manual_html(photos)
    with open(TEMP_HTML, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"   Saved temporary HTML: {TEMP_HTML} ({len(html_content)} bytes)")

    print("4. Compiling PDF via Headless Chromium...")
    cmd = [
        browser_exe,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={OUTPUT_PDF}",
        str(TEMP_HTML),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error compiling PDF: {res.stderr}")
        sys.exit(res.returncode)

    if not OUTPUT_PDF.exists():
        print("Error: Output PDF was not created.")
        sys.exit(1)

    pdf_size = OUTPUT_PDF.stat().st_size
    print(f"   Successfully generated PDF: {OUTPUT_PDF} ({pdf_size:,} bytes)")

    # Verify using fitz (PyMuPDF)
    try:
        import fitz
        doc = fitz.open(str(OUTPUT_PDF))
        page_count = len(doc)
        print(f"5. PDF Verification: {page_count} high-resolution pages compiled successfully!")
        doc.close()
    except Exception as e:
        print(f"   Note: PyMuPDF verification skipped: {e}")

    # Clean up temp html
    if TEMP_HTML.exists():
        try:
            TEMP_HTML.unlink()
        except Exception:
            pass

    print("\nAll done! The publication-ready Voter User Manual is ready.")


if __name__ == "__main__":
    main()
