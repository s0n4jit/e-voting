"""
scripts/generate_voter_manual_pdf.py
Generates the publication-ready, professional 2-page Voter Guide PDF.
Strictly 4 core voting steps + receipt drop:
1. Enter the PIN
2. Select Candidates
3. Submit My Vote
4. Yes, Submit
5. Done & Drop Paper Receipt

Zero sensitive data. Pixel-perfect alignment with current application UI.
"""

import os
import sys
import json
import base64
from pathlib import Path
import subprocess
import pymupdf as fitz
import shutil

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_PDF = ROOT_DIR / "Voter_User_Manual_A_to_Z.pdf"
TEMP_HTML = ROOT_DIR / "scripts" / "voter_manual_temp.html"
ROSTER_PATH = ROOT_DIR / "backend" / "app" / "mock_assets" / "dummy_roster.json"
LOGO_PATH = ROOT_DIR / "frontend" / "public" / "logo.svg"

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


def get_logo_svg():
    if LOGO_PATH.exists():
        try:
            return LOGO_PATH.read_text(encoding="utf-8")
        except Exception:
            pass
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#38459F"/><path d="M26.5 22.5l4.2 4.2 7.3-8.4" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/><path d="M12 36.5h40v12a5.5 5.5 0 0 1-5.5 5.5h-29A5.5 5.5 0 0 1 12 48.5z" fill="#ffffff"/></svg>"""


def build_manual_html(photos, logo_svg):
    obama_photo = photos.get("Barack Obama", "")
    gandhi_photo = photos.get("Rahul Gandhi", "")

    # Clean inline SVG for compact headers
    brand_logo_small = logo_svg.replace('<svg ', '<svg style="width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;" ')
    kiosk_logo_small = logo_svg.replace('<svg ', '<svg style="width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0;" ')

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Campus E-Voting — Voter Quick Guide</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: 8mm 12mm 8mm 12mm;
      @bottom-right {{
        content: "Page " counter(page) " of 2";
        font-size: 7.5pt;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        color: #94a3b8;
      }}
      @bottom-left {{
        content: "Campus E-Voting System • Official Voter Quick Guide";
        font-size: 7.5pt;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        color: #94a3b8;
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
      line-height: 1.32;
      font-size: 8.5pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}

    .page {{
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 281mm;
      max-height: 281mm;
      overflow: hidden;
    }}

    .page:last-child {{
      page-break-after: avoid;
      break-after: avoid;
    }}

    /* Global Header */
    .doc-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 7px;
      border-bottom: 2px solid #e2e6ee;
      margin-bottom: 9px;
    }}

    .doc-brand {{
      display: flex;
      align-items: center;
      gap: 9px;
    }}

    .doc-title {{
      font-size: 13pt;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }}

    .doc-subtitle {{
      font-size: 7.5pt;
      color: #64748b;
      font-weight: 500;
    }}

    .doc-badge {{
      background: #eef1fb;
      color: #38459f;
      font-size: 7.5pt;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 6px;
      border: 1px solid #d0d7f3;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}

    /* Step Box Container */
    .step-box {{
      background: #f7f8fb;
      border: 1.5px solid #e2e6ee;
      border-radius: 10px;
      padding: 9px 12px;
      margin-bottom: 9px;
    }}

    .step-title-row {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 7px;
    }}

    .step-badge {{
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }}

    .step-num {{
      width: 22px;
      height: 22px;
      background: #38459f;
      color: white;
      font-weight: 900;
      font-size: 9.5pt;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(56, 69, 159, 0.35);
    }}

    .step-heading {{
      font-size: 11pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.01em;
    }}

    .step-tag {{
      font-size: 7.5pt;
      font-weight: 600;
      color: #64748b;
    }}

    /* Kiosk Window Frame Mockup */
    .kiosk-shell {{
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 3px 8px rgba(15, 23, 42, 0.06);
      position: relative;
    }}

    .kiosk-header {{
      background: #ffffff;
      padding: 5px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #e2e6ee;
    }}

    .kiosk-booth-pill {{
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 2px 7px;
      background: #ffffff;
      border: 1px solid #e2e6ee;
      border-radius: 6px;
      font-size: 7pt;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 800;
      color: #38459f;
    }}

    .pulse-dot {{
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #16824a;
    }}

    .kiosk-body {{
      padding: 10px 12px;
      position: relative;
      background: #ffffff;
    }}

    /* Numbered Callout Pointer Badges */
    .callout {{
      position: absolute;
      display: flex;
      align-items: center;
      gap: 4px;
      z-index: 50;
      pointer-events: none;
    }}

    .callout-num {{
      width: 22px;
      height: 22px;
      background: #dc2626;
      color: white;
      font-weight: 900;
      font-size: 9.5pt;
      border-radius: 50%;
      border: 2px solid #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(220, 38, 38, 0.5);
    }}

    .callout-text {{
      background: #dc2626;
      color: white;
      font-size: 7pt;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
      white-space: nowrap;
    }}

    /* Action Instruction Rows below mockups */
    .action-row {{
      display: flex;
      align-items: center;
      gap: 7px;
      margin-top: 6px;
      font-size: 8pt;
      color: #334155;
    }}

    .action-pill {{
      background: #dc2626;
      color: white;
      width: 17px;
      height: 17px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8pt;
      font-weight: 900;
      flex-shrink: 0;
    }}

    .doc-footer {{
      border-top: 1px solid #e2e6ee;
      padding-top: 5px;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #94a3b8;
    }}
  </style>
</head>
<body>

  <!-- ========================================================================= -->
  <!-- PAGE 1: STEP 1 (ENTER THE PIN) & STEP 2 (SELECT CANDIDATES)               -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div class="doc-header">
        <div class="doc-brand">
          {brand_logo_small}
          <div>
            <div class="doc-title">CAMPUS E-VOTING — HOW TO VOTE</div>
            <div class="doc-subtitle">Official Step-by-Step Voter Quick Guide</div>
          </div>
        </div>
        <div class="doc-badge">Step 1 & Step 2</div>
      </div>

      <!-- ==================== STEP 1: ENTER THE PIN ==================== -->
      <div class="step-box">
        <div class="step-title-row">
          <div class="step-badge">
            <span class="step-num">1</span>
            <span class="step-heading">Enter the PIN</span>
          </div>
          <span class="step-tag">Step 1 of 4 • On Kiosk Touchscreen</span>
        </div>

        <!-- Real KioskLogin UI Mockup -->
        <div class="kiosk-shell">
          <!-- Kiosk Header Bar -->
          <div class="kiosk-header">
            <div style="display: flex; align-items: center; gap: 6px;">
              {kiosk_logo_small}
              <div>
                <span style="font-weight: 800; font-size: 8pt; color: #0f172a; display: block; line-height: 1;">Campus E-Voting</span>
                <span style="font-size: 6.5pt; color: #64748b;">Election Commission</span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 7px;">
              <div class="kiosk-booth-pill">
                <span class="pulse-dot"></span>
                <span>BOOTH-01</span>
              </div>
              <div style="font-size: 7pt; font-family: ui-monospace, monospace; text-align: right; line-height: 1.1;">
                <span style="font-weight: 700; color: #0f172a;">10:14:20 AM</span>
              </div>
            </div>
          </div>

          <!-- Kiosk Body Content -->
          <div class="kiosk-body">
            <div style="text-align: center; margin-bottom: 8px;">
              <h2 style="font-size: 13pt; font-weight: 900; color: #0f172a; margin-bottom: 2px;">Enter Voting PIN</h2>
              <p style="font-size: 7.5pt; color: #64748b;">College Student Council Election 2026</p>
            </div>

            <!-- 2-Column Real Layout: Left Form + Right NumPad -->
            <div style="display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 14px; max-width: 440px; margin: 0 auto; align-items: center;">
              
              <!-- Left Form Side -->
              <div style="background: #ffffff; border: 1px solid #e2e6ee; border-radius: 10px; padding: 10px;">
                <!-- Your Voting ID Box -->
                <div style="background: #f1f3f8; border: 1px solid #e2e6ee; border-radius: 8px; padding: 6px; text-align: center; margin-bottom: 8px;">
                  <span style="font-size: 6.5pt; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; display: block;">YOUR VOTING ID</span>
                  <div style="font-family: ui-monospace, monospace; font-size: 13pt; font-weight: 900; color: #38459f; letter-spacing: 0.05em;">SUE26-B1-1001</div>
                  <span style="font-size: 6pt; color: #64748b;">Verify this matches your paper slip</span>
                </div>

                <!-- 4-Digit PIN Input Box -->
                <div style="margin-bottom: 9px; text-align: center;">
                  <span style="font-size: 7pt; font-weight: 800; text-transform: uppercase; color: #0f172a; display: block; margin-bottom: 3px; letter-spacing: 0.04em;">4-Digit Voting PIN</span>
                  <div style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 6px; font-size: 15pt; font-weight: 900; letter-spacing: 0.5em; text-align: center; color: #0f172a;">
                    ••••
                  </div>
                </div>

                <!-- Open Ballot Button -->
                <button style="width: 100%; background: #38459f; color: white; border: none; padding: 7px; border-radius: 8px; font-weight: 800; font-size: 8.5pt; display: flex; align-items: center; justify-content: center; gap: 6px; position: relative;">
                  <span>Open Ballot</span>
                  <span>➔</span>
                  <!-- Callout 2 -->
                  <div class="callout" style="right: -6px; top: -10px;">
                    <div class="callout-num">2</div>
                    <div class="callout-text">Open Ballot</div>
                  </div>
                </button>
              </div>

              <!-- Right: Real NumPad Grid (Matching NumPad.jsx) -->
              <div style="background: #ffffff; border: 1px solid #e2e6ee; border-radius: 10px; padding: 9px; position: relative;">
                <!-- Callout 1 -->
                <div class="callout" style="left: -8px; top: -10px;">
                  <div class="callout-num">1</div>
                  <div class="callout-text">Type 4-Digit PIN</div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">1</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">2</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">3</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">4</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">5</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">6</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">7</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">8</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">9</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 7.5pt; font-weight: 700; color: #64748b;">Clear</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #0f172a;">0</div>
                  <div style="padding: 7px 0; text-align: center; background: #f1f3f8; border-radius: 6px; font-size: 10.5pt; font-weight: 700; color: #64748b;">⌫</div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- Instructions -->
        <div style="display: flex; gap: 16px; margin-top: 7px;">
          <div class="action-row">
            <span class="action-pill">1</span>
            <span>Type the <strong>4-digit PIN</strong> printed on your paper slip using the touchscreen keypad.</span>
          </div>
          <div class="action-row">
            <span class="action-pill">2</span>
            <span>Click <strong>Open Ballot ➔</strong> (the terminal also auto-submits once all 4 digits are entered).</span>
          </div>
        </div>
      </div>

      <!-- ==================== STEP 2: SELECT CANDIDATES ==================== -->
      <div class="step-box">
        <div class="step-title-row">
          <div class="step-badge">
            <span class="step-num">2</span>
            <span class="step-heading">Select Candidates</span>
          </div>
          <span class="step-tag">Step 2 of 4 • Candidate Selection</span>
        </div>

        <!-- Real KioskVoting UI Mockup -->
        <div class="kiosk-shell">
          <!-- Kiosk Header Bar -->
          <div class="kiosk-header">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 7pt; font-weight: 800; color: #38459f; text-transform: uppercase; letter-spacing: 0.05em;">POST 1 OF 3</span>
              <span style="color: #cbd5e1;">•</span>
              <span style="font-size: 7.5pt; font-weight: 700; color: #0f172a;">President</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 18px; height: 4px; border-radius: 2px; background: #38459f;"></span>
              <span style="display: inline-block; width: 6px; height: 4px; border-radius: 2px; background: #e2e6ee;"></span>
              <span style="display: inline-block; width: 6px; height: 4px; border-radius: 2px; background: #e2e6ee;"></span>
            </div>
          </div>

          <!-- Kiosk Body Content -->
          <div class="kiosk-body" style="padding: 9px 12px;">
            <div style="text-align: center; margin-bottom: 7px;">
              <h2 style="font-size: 13pt; font-weight: 900; color: #0f172a; margin-bottom: 1px;">President</h2>
              <p style="font-size: 7.5pt; color: #64748b;">Click your chosen candidate below to give your vote.</p>
            </div>

            <!-- Candidate Cards (3-Column Grid Matching Real UI) -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 480px; margin: 0 auto 7px auto;">
              
              <!-- Card 1: Selected Candidate (Barack Obama) -->
              <div style="border: 2px solid #38459f; border-radius: 10px; background: #ffffff; box-shadow: 0 0 0 3px rgba(56, 69, 159, 0.2); overflow: hidden; position: relative;">
                <div style="background: #f1f3f8; padding: 6px; text-align: center;">
                  <div style="width: 50px; height: 50px; border-radius: 8px; margin: 0 auto; overflow: hidden; background: #e2e8f0;">
                    {"<img src='" + obama_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Barack Obama'>" if obama_photo else "<div style='color: #38459f; font-size: 14pt; font-weight: 900; line-height: 50px;'>BO</div>"}
                  </div>
                </div>

                <!-- Brand Purple Checkmark Badge -->
                <div style="position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; border-radius: 50%; background: #38459f; color: white; display: flex; align-items: center; justify-content: center; font-size: 10pt; font-weight: 900; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
                  ✓
                </div>

                <div style="padding: 5px; text-align: center; background: #eef1fb;">
                  <strong style="font-size: 8.5pt; color: #0f172a; display: block; font-weight: 900;">Barack Obama</strong>
                  <span style="font-size: 6.5pt; color: #64748b;">Constitutional Law | Sem 5</span>
                </div>

                <!-- Callout 1 -->
                <div class="callout" style="left: 10px; top: -10px;">
                  <div class="callout-num">1</div>
                  <div class="callout-text">Tap Candidate Card</div>
                </div>
              </div>

              <!-- Card 2: Unselected Candidate (Rahul Gandhi) -->
              <div style="border: 1.5px solid #e2e6ee; border-radius: 10px; background: #ffffff; overflow: hidden; position: relative;">
                <div style="background: #f8fafc; padding: 6px; text-align: center;">
                  <div style="width: 50px; height: 50px; border-radius: 8px; margin: 0 auto; overflow: hidden; background: #e2e8f0;">
                    {"<img src='" + gandhi_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Rahul Gandhi'>" if gandhi_photo else "<div style='color: #64748b; font-size: 14pt; font-weight: 900; line-height: 50px;'>RG</div>"}
                  </div>
                </div>

                <div style="position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #cbd5e1; background: #ffffff;"></div>

                <div style="padding: 5px; text-align: center;">
                  <strong style="font-size: 8.5pt; color: #0f172a; display: block;">Rahul Gandhi</strong>
                  <span style="font-size: 6.5pt; color: #64748b;">Economics | Sem 3</span>
                </div>
              </div>

              <!-- Card 3: NOTA Option -->
              <div style="border: 1.5px solid #cbd5e1; border-radius: 10px; background: #f8fafc; overflow: hidden; position: relative;">
                <div style="padding: 6px; text-align: center;">
                  <div style="width: 50px; height: 50px; border-radius: 8px; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 18pt; color: #64748b; background: #e2e8f0;">
                    ⊘
                  </div>
                </div>

                <div style="padding: 5px; text-align: center; border-top: 1px solid #e2e6ee;">
                  <strong style="font-size: 8pt; color: #334155; display: block;">None of the above</strong>
                  <span style="font-size: 6.5pt; color: #94a3b8;">(NOTA)</span>
                </div>
              </div>

            </div>

            <!-- Bottom Navigation Bar -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e2e6ee; padding-top: 5px;">
              <span style="font-size: 7pt; color: #16824a; font-weight: 700;">Choice Recorded ✓</span>
              <!-- Next Button -->
              <button style="background: #38459f; color: white; border: none; padding: 5px 14px; border-radius: 6px; font-weight: 700; font-size: 8pt; display: flex; align-items: center; gap: 4px; position: relative;">
                <span>Next</span>
                <span>➔</span>
                <!-- Callout 2 -->
                <div class="callout" style="right: -6px; top: -10px;">
                  <div class="callout-num">2</div>
                  <div class="callout-text">Next Post</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Instructions -->
        <div style="display: flex; gap: 16px; margin-top: 7px;">
          <div class="action-row">
            <span class="action-pill">1</span>
            <span>Tap your chosen candidate card. It highlights with a <strong>brand border and checkmark (✓)</strong>.</span>
          </div>
          <div class="action-row">
            <span class="action-pill">2</span>
            <span>Click <strong>Next ➔</strong> to proceed to the next position.</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Page 1 Bottom Footer -->
    <div class="doc-footer">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Turn over for Step 3, Step 4 & Paper Receipt</span>
    </div>
  </div>


  <!-- ========================================================================= -->
  <!-- PAGE 2: STEP 3 (SUBMIT), STEP 4 (YES CONFIRM) & STEP 5 (RECEIPT DROP)     -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div class="doc-header">
        <div class="doc-brand">
          {brand_logo_small}
          <div>
            <div class="doc-title">CAMPUS E-VOTING — HOW TO VOTE</div>
            <div class="doc-subtitle">Official Step-by-Step Voter Quick Guide</div>
          </div>
        </div>
        <div class="doc-badge">Step 3, Step 4 & Step 5</div>
      </div>

      <!-- ==================== STEP 3: SUBMIT MY VOTE ==================== -->
      <div class="step-box">
        <div class="step-title-row">
          <div class="step-badge">
            <span class="step-num">3</span>
            <span class="step-heading">Submit My Vote</span>
          </div>
          <span class="step-tag">Step 3 of 4 • Review Screen</span>
        </div>

        <!-- Real KioskVoting Review UI Mockup -->
        <div class="kiosk-shell">
          <div class="kiosk-header">
            <div>
              <span style="font-size: 6.5pt; font-weight: 700; color: #38459f; text-transform: uppercase;">FINAL STEP</span>
              <span style="font-size: 8pt; font-weight: 800; color: #0f172a; margin-left: 4px;">Review your choices</span>
            </div>
            <span style="font-size: 7pt; color: #64748b;">Check each choice before submitting</span>
          </div>

          <div class="kiosk-body" style="padding: 9px 12px;">
            <div style="display: flex; flex-direction: column; gap: 5px; max-width: 460px; margin: 0 auto 7px auto;">
              
              <!-- Review Row 1 -->
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; background: #ffffff; border: 1px solid #e2e6ee; border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 28px; height: 28px; border-radius: 6px; overflow: hidden; background: #eef1fb; flex-shrink: 0;">
                    {"<img src='" + obama_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Obama'>" if obama_photo else "<div style='color: #38459f; font-weight: 900; font-size: 8pt; text-align: center; line-height: 28px;'>BO</div>"}
                  </div>
                  <div>
                    <div style="font-size: 6.5pt; font-weight: 700; text-transform: uppercase; color: #64748b;">President</div>
                    <strong style="font-size: 8.5pt; color: #0f172a;">Barack Obama</strong>
                  </div>
                </div>
                <button style="background: transparent; color: #38459f; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 5px; font-size: 7pt; font-weight: 700;">Change</button>
              </div>

              <!-- Review Row 2 -->
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; background: #ffffff; border: 1px solid #e2e6ee; border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 28px; height: 28px; border-radius: 6px; overflow: hidden; background: #eef1fb; flex-shrink: 0;">
                    {"<img src='" + gandhi_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Gandhi'>" if gandhi_photo else "<div style='color: #38459f; font-weight: 900; font-size: 8pt; text-align: center; line-height: 28px;'>RG</div>"}
                  </div>
                  <div>
                    <div style="font-size: 6.5pt; font-weight: 700; text-transform: uppercase; color: #64748b;">Vice President</div>
                    <strong style="font-size: 8.5pt; color: #0f172a;">Rahul Gandhi</strong>
                  </div>
                </div>
                <button style="background: transparent; color: #38459f; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 5px; font-size: 7pt; font-weight: 700;">Change</button>
              </div>

              <!-- Review Row 3 (NOTA) -->
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; background: #ffffff; border: 1px solid #e2e6ee; border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 28px; height: 28px; border-radius: 6px; background: #f1f3f8; color: #64748b; font-weight: 900; font-size: 9pt; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    ⊘
                  </div>
                  <div>
                    <div style="font-size: 6.5pt; font-weight: 700; text-transform: uppercase; color: #64748b;">General Secretary</div>
                    <strong style="font-size: 8.5pt; color: #0f172a;">None of the above (NOTA)</strong>
                  </div>
                </div>
                <button style="background: transparent; color: #38459f; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 5px; font-size: 7pt; font-weight: 700;">Change</button>
              </div>

            </div>

            <!-- Submit my vote button -->
            <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid #e2e6ee; padding-top: 5px;">
              <!-- Callout 1 -->
              <button style="background: #38459f; color: white; border: none; padding: 6px 18px; border-radius: 8px; font-weight: 900; font-size: 8.5pt; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(56, 69, 159, 0.4); position: relative;">
                <span>Submit my vote</span>
                <span>✓</span>
                <div class="callout" style="right: -8px; top: -10px;">
                  <div class="callout-num">1</div>
                  <div class="callout-text">Click Submit</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div class="action-row">
          <span class="action-pill">1</span>
          <span>Review your selections (tap <strong>Change</strong> to adjust any candidate), then click <strong>Submit my vote ✓</strong>.</span>
        </div>
      </div>

      <!-- ==================== STEPS 4 & 5: YES SUBMIT & RECEIPT DROP ==================== -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        
        <!-- STEP 4: YES SUBMIT MODAL -->
        <div class="step-box" style="margin-bottom: 0;">
          <div class="step-title-row">
            <div class="step-badge">
              <span class="step-num">4</span>
              <span class="step-heading">Yes, Submit</span>
            </div>
            <span class="step-tag">Step 4 of 4</span>
          </div>

          <!-- Real Modal UI Mockup -->
          <div class="kiosk-shell" style="border: 1.5px solid #cbd5e1;">
            <div style="background: rgba(15, 23, 42, 0.45); padding: 14px 10px; text-align: center;">
              <!-- Modal Dialog Card -->
              <div style="background: #ffffff; border-radius: 10px; padding: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); text-align: left; max-width: 220px; margin: 0 auto;">
                <h3 style="font-size: 10.5pt; font-weight: 800; color: #0f172a; margin-bottom: 3px;">Submit your vote?</h3>
                <p style="font-size: 6.8pt; color: #64748b; margin-bottom: 11px; line-height: 1.3;">
                  You are voting for 3 positions. After you submit, your vote cannot be changed.
                </p>

                <div style="display: flex; justify-content: flex-end; gap: 5px;">
                  <button style="background: transparent; color: #64748b; border: none; font-size: 7pt; font-weight: 700; padding: 4px 6px;">
                    Go back
                  </button>
                  
                  <!-- Callout 1 -->
                  <button style="background: #38459f; color: white; border: none; padding: 5px 9px; border-radius: 6px; font-size: 7.2pt; font-weight: 800; position: relative;">
                    Yes, submit my vote
                    <div class="callout" style="right: -6px; top: -10px;">
                      <div class="callout-num">1</div>
                      <div class="callout-text">Click Yes</div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="action-row" style="margin-top: 6px;">
            <span class="action-pill">1</span>
            <span>Click <strong>Yes, submit my vote</strong> to permanently lock and encrypt your ballot.</span>
          </div>
        </div>

        <!-- STEP 5: DONE & DROP RECEIPT -->
        <div class="step-box" style="margin-bottom: 0;">
          <div class="step-title-row">
            <div class="step-badge">
              <span class="step-num">5</span>
              <span class="step-heading">Done & Drop Receipt</span>
            </div>
            <span class="step-tag">Ballot Box</span>
          </div>

          <!-- Real Success Screen UI Mockup -->
          <div class="kiosk-shell" style="border: 1.5px solid #a7f3d0;">
            <div style="background: #ffffff; padding: 12px 10px; text-align: center;">
              <div style="width: 30px; height: 30px; border-radius: 50%; background: #e8f6ee; color: #16824a; font-weight: 900; font-size: 15pt; display: flex; align-items: center; justify-content: center; margin: 0 auto 3px auto;">
                ✓
              </div>
              <h3 style="font-size: 9.5pt; font-weight: 900; color: #065f46;">Your vote is recorded</h3>
              <p style="font-size: 6.5pt; color: #64748b; margin-bottom: 7px;">Your vote copy has been printed.</p>

              <!-- Drop Action Box -->
              <div style="background: #f0fdf4; border: 1.5px dashed #16824a; border-radius: 6px; padding: 5px 6px; text-align: center; position: relative;">
                <div style="font-size: 7.5pt; font-weight: 900; color: #166534;">📥 Take Printed Paper Slip</div>
                <div style="font-size: 6.5pt; color: #15803d; margin-top: 1px;">Drop it into the Physical Ballot Box</div>

                <!-- Callout 1 -->
                <div class="callout" style="right: -6px; top: -10px;">
                  <div class="callout-num">1</div>
                  <div class="callout-text">Drop into Box</div>
                </div>
              </div>
            </div>
          </div>

          <div class="action-row" style="margin-top: 6px;">
            <span class="action-pill">1</span>
            <span>Collect your printed paper slip and <strong>drop it into the physical ballot box</strong>.</span>
          </div>
        </div>

      </div>

      <!-- Footer Privacy Note -->
      <div style="margin-top: 9px; background: #f8fafc; border: 1px solid #e2e6ee; border-radius: 8px; padding: 7px 11px; display: flex; align-items: center; justify-content: space-between;">
        <span style="font-size: 7.5pt; color: #64748b;">
          🔒 <strong>100% Secret Ballot:</strong> Your vote is fully encrypted. The booth screen clears itself in 5 seconds for the next voter.
        </span>
        <span style="font-size: 7pt; font-weight: 800; color: #38459f; text-transform: uppercase;">Campus Elections 2026</span>
      </div>
    </div>

    <!-- Page 2 Bottom Footer -->
    <div class="doc-footer">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Official Voter Quick Guide • Page 2 of 2</span>
    </div>
  </div>

</body>
</html>
"""
    return html_content


def main():
    print("1. Discovering headless browser...")
    browser = find_browser()
    if not browser:
        print("ERROR: No Google Chrome or Microsoft Edge executable found!")
        sys.exit(1)
    print(f"   Found browser: {browser}")

    print("2. Loading candidate photographs from roster and logo...")
    photos = get_candidate_photos()
    print(f"   Loaded {len(photos)} candidate photos.")
    logo_svg = get_logo_svg()

    print("3. Generating Voter Manual HTML layout...")
    html_content = build_manual_html(photos, logo_svg)
    TEMP_HTML.write_text(html_content, encoding="utf-8")
    print(f"   Saved temporary HTML: {TEMP_HTML} ({len(html_content)} bytes)")

    print("4. Compiling PDF via Headless Chromium...")
    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        "--run-all-compositor-stages-before-draw",
        f"--print-to-pdf={str(OUTPUT_PDF)}",
        str(TEMP_HTML),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"ERROR: Browser print-to-pdf failed:\n{res.stderr}")
        sys.exit(1)

    if not OUTPUT_PDF.exists():
        print("ERROR: Output PDF was not generated!")
        sys.exit(1)

    pdf_size = OUTPUT_PDF.stat().st_size
    print(f"   Successfully generated PDF: {OUTPUT_PDF} ({pdf_size:,} bytes)")

    print("5. PDF Verification & Preview Generation...")
    doc = fitz.open(OUTPUT_PDF)
    print(f"   Page count: {len(doc)}")
    if len(doc) != 2:
        print(f"WARNING: Expected 2 pages, got {len(doc)} pages! Layout may need height adjustment.")
    else:
        print("   Verification passed: Exact 2-page guide.")

    # Artifact directory output
    artifact_dir = Path(r"C:\Users\sOn4jit\.gemini\antigravity-cli\brain\a691325c-e890-466d-a7be-037e51cd63f5")
    if artifact_dir.exists():
        artifact_pdf = artifact_dir / "Voter_User_Manual_A_to_Z.pdf"
        shutil.copy2(OUTPUT_PDF, artifact_pdf)
        print(f"   Copied PDF to artifact dir: {artifact_pdf}")

        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=150)
            img_path = artifact_dir / f"voter_exact_ui_page_{i + 1}.png"
            pix.save(img_path)
            print(f"   Rendered Page {i + 1} -> {img_path.name} ({img_path.stat().st_size:,} bytes)")

    doc.close()
    print("\nAll done! The publication-ready Voter User Manual is ready.")


if __name__ == "__main__":
    main()
