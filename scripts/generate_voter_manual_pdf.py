"""
scripts/generate_voter_manual_pdf.py
Generates the comprehensive, official Voter User Manual (A to Z) as a publication-ready PDF
with high-resolution interface mockups, marked click callouts, VVPAT receipt diagrams,
and step-by-step instructions.
"""

import os
import sys
import json
import base64
import subprocess
from pathlib import Path

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
    # Select candidate photos or fallbacks
    obama_photo = photos.get("Barack Obama", "")
    gandhi_photo = photos.get("Rahul Gandhi", "")
    kejriwal_photo = photos.get("Arvind Kejriwal", "")
    shah_photo = photos.get("Amit Shah", "")

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Campus E-Voting System - Official Voter User Manual (A to Z)</title>
  <style>
    @page {{
      size: A4 portrait;
      margin: 12mm 14mm 14mm 14mm;
      @bottom-right {{
        content: "Page " counter(page);
        font-size: 8pt;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        color: #64748b;
      }}
      @bottom-left {{
        content: "Campus E-Voting System • Official Voter Manual (A to Z)";
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
      line-height: 1.45;
      font-size: 9.5pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}

    .page {{
      page-break-after: always;
      break-after: page;
      position: relative;
      min-height: 260mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }}

    .page:last-child {{
      page-break-after: avoid;
      break-after: avoid;
    }}

    .page-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 6px;
      margin-bottom: 12px;
    }}

    .page-header .brand {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .page-header .logo-box {{
      width: 26px;
      height: 26px;
      background: #4f46e5;
      color: white;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 13pt;
    }}

    .page-header .title {{
      font-size: 9.5pt;
      font-weight: 700;
      color: #1e293b;
      letter-spacing: -0.01em;
    }}

    .page-header .doc-tag {{
      font-size: 7.5pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #4f46e5;
      background: #eef2ff;
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid #c7d2fe;
    }}

    h1.sec-title {{
      font-size: 14pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.02em;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }}

    .step-badge {{
      background: #4f46e5;
      color: white;
      font-size: 8.5pt;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
    }}

    p.sec-desc {{
      font-size: 9pt;
      color: #475569;
      margin-bottom: 10px;
      line-height: 1.4;
    }}

    /* Callout Badges */
    .pin {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #e11d48;
      color: white;
      font-weight: 900;
      font-size: 9pt;
      box-shadow: 0 2px 5px rgba(225, 29, 72, 0.4);
      flex-shrink: 0;
      position: relative;
      z-index: 20;
    }}

    .pin-pulse {{
      animation: pulse 1.5s infinite;
    }}

    /* Terminal Window Mockup */
    .terminal-window {{
      background: #0f172a;
      border: 2px solid #334155;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 20px rgba(0,0,0,0.12);
      margin-bottom: 12px;
      position: relative;
    }}

    .terminal-topbar {{
      background: #1e293b;
      padding: 6px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #334155;
    }}

    .topbar-left {{
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .topbar-dot {{
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }}

    .dot-red {{ background: #ef4444; }}
    .dot-yellow {{ background: #f59e0b; }}
    .dot-green {{ background: #10b981; }}

    .topbar-title {{
      color: #94a3b8;
      font-size: 7.5pt;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      margin-left: 6px;
    }}

    .topbar-right {{
      display: flex;
      align-items: center;
      gap: 8px;
      color: #10b981;
      font-size: 7.5pt;
      font-weight: 600;
    }}

    .terminal-body {{
      padding: 16px 18px;
      background: #0b1120;
      position: relative;
      min-height: 190px;
    }}

    /* Light UI Screen Container */
    .kiosk-screen-light {{
      background: #f8fafc;
      border-radius: 8px;
      padding: 16px;
      color: #0f172a;
      position: relative;
    }}

    /* Action Table */
    .action-table {{
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 8.5pt;
    }}

    .action-table th {{
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 5px 8px;
      border: 1px solid #cbd5e1;
      font-size: 8pt;
    }}

    .action-table td {{
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      line-height: 1.35;
    }}

    .action-table tr:nth-child(even) {{
      background: #f8fafc;
    }}

    .click-target {{
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }}

    .tip-box {{
      background: #f0fdf4;
      border-left: 3px solid #22c55e;
      padding: 6px 10px;
      border-radius: 0 6px 6px 0;
      font-size: 8pt;
      color: #166534;
      margin-top: 8px;
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }}

    .warn-box {{
      background: #fff1f2;
      border-left: 3px solid #f43f5e;
      padding: 6px 10px;
      border-radius: 0 6px 6px 0;
      font-size: 8pt;
      color: #9f1239;
      margin-top: 8px;
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }}

    /* Callout Overlay Marker */
    .callout-overlay {{
      position: absolute;
      display: flex;
      align-items: center;
      gap: 4px;
      z-index: 50;
    }}

    .callout-marker {{
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #e11d48;
      border: 2px solid #ffffff;
      color: white;
      font-weight: 900;
      font-size: 9pt;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 0 2px #e11d48, 0 3px 6px rgba(0,0,0,0.3);
    }}

    .callout-pointer {{
      background: #e11d48;
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      box-shadow: 0 2px 4px rgba(0,0,0,0.25);
      white-space: nowrap;
    }}

    .highlight-ring {{
      border: 2px dashed #e11d48 !important;
      background: rgba(225, 29, 72, 0.08) !important;
    }}

    /* Grid layout */
    .grid-2 {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }}

    .grid-3 {{
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }}
  </style>
</head>
<body>

  <!-- ========================================================================= -->
  <!-- PAGE 1: COVER & EXECUTIVE SUMMARY                                         -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%); color: white; padding: 24px; border-radius: 12px; margin-bottom: 16px; position: relative; overflow: hidden; border: 1px solid #4338ca;">
        <div style="position: absolute; right: -20px; top: -20px; opacity: 0.12;">
          <svg width="220" height="220" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
          <div style="background: #ffffff; color: #312e81; font-weight: 900; font-size: 11pt; padding: 3px 10px; border-radius: 6px; letter-spacing: 0.05em;">
            CEVS OFFICIAL
          </div>
          <span style="font-size: 8.5pt; color: #c7d2fe; font-weight: 500;">INSTITUTIONAL ELECTION COMMISSION • STANDARD OPERATING PROCEDURE</span>
        </div>

        <h1 style="font-size: 21pt; font-weight: 900; line-height: 1.15; margin-bottom: 6px; letter-spacing: -0.02em;">
          VOTER USER MANUAL (A TO Z)
        </h1>
        <p style="font-size: 10.5pt; color: #e0e7ff; max-width: 90%; font-weight: 400; line-height: 1.4;">
          Step-by-Step Polling Station Guide: How to Verify Credentials, Enter the Kiosk Booth, Cast Your Confidential Ballot & Inspect Your Printed VVPAT Paper Receipt.
        </p>

        <div style="margin-top: 14px; display: flex; gap: 16px; font-size: 8pt; color: #c7d2fe; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 10px;">
          <div><strong>Standard:</strong> Cryptographic Blind Token</div>
          <div><strong>Verification:</strong> Institutional Physical Electoral Roll</div>
          <div><strong>Audit Trail:</strong> Hardcopy VVPAT Paper Slip</div>
          <div><strong>Security Level:</strong> 100% Unlinkable Ballot Secrecy</div>
        </div>
      </div>

      <h2 style="font-size: 11pt; font-weight: 800; color: #1e293b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">
        The 5 Golden Rules of Secret Ballot Voting
      </h2>

      <div class="grid-2" style="margin-bottom: 14px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span style="background: #4f46e5; color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 800;">1</span>
            <strong style="font-size: 8.5pt; color: #1e293b;">Physical Electoral Roll First</strong>
          </div>
          <p style="font-size: 8pt; color: #64748b; line-height: 1.35;">
            Present your institutional photo ID card to the Desk Polling Officer. Your eligibility is checked against the printed register before receiving your Booth Slip.
          </p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span style="background: #4f46e5; color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 800;">2</span>
            <strong style="font-size: 8.5pt; color: #1e293b;">Private 4-Digit Security PIN</strong>
          </div>
          <p style="font-size: 8pt; color: #64748b; line-height: 1.35;">
            Your slip contains a single-use 4-digit PIN. Never share this PIN with anyone. It expires immediately after your ballot is cast and cannot be reused.
          </p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span style="background: #4f46e5; color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 800;">3</span>
            <strong style="font-size: 8.5pt; color: #1e293b;">Absolute Secrecy & Anonymity</strong>
          </div>
          <p style="font-size: 8pt; color: #64748b; line-height: 1.35;">
            Ballot choices are encrypted using cryptographic blind tokens. Receipts belong to the central "Ballot Box" and are decoupled from booth numbers to prevent exit-door timing tracking.
          </p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 12px; border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span style="background: #4f46e5; color: white; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8pt; font-weight: 800;">4</span>
            <strong style="font-size: 8.5pt; color: #1e293b;">Inspect Printed VVPAT Paper Copy</strong>
          </div>
          <p style="font-size: 8pt; color: #64748b; line-height: 1.35;">
            After submitting, the thermal printer prints your paper receipt. Verify your candidate selections on paper and deposit the slip directly into the sealed physical ballot box.
          </p>
        </div>
      </div>

      <h2 style="font-size: 11pt; font-weight: 800; color: #1e293b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">
        Complete End-to-End Voting Flow (Phase 1 to Phase 7)
      </h2>

      <div style="display: flex; align-items: stretch; justify-content: space-between; gap: 6px; background: #eef2ff; border: 1px solid #c7d2fe; padding: 10px; border-radius: 8px;">
        <div style="flex: 1; text-align: center; background: white; padding: 6px 4px; border-radius: 6px; border: 1px solid #cbd5e1;">
          <div style="font-size: 7pt; font-weight: 800; color: #4f46e5;">PHASE 1</div>
          <div style="font-size: 7.5pt; font-weight: 700; color: #0f172a; margin: 2px 0;">Desk Check-in</div>
          <div style="font-size: 6.5pt; color: #64748b;">Receive Slip</div>
        </div>
        <div style="display: flex; align-items: center; color: #6366f1; font-weight: 900;">➔</div>
        <div style="flex: 1; text-align: center; background: white; padding: 6px 4px; border-radius: 6px; border: 1px solid #cbd5e1;">
          <div style="font-size: 7pt; font-weight: 800; color: #4f46e5;">PHASE 2</div>
          <div style="font-size: 7.5pt; font-weight: 700; color: #0f172a; margin: 2px 0;">Booth PIN Entry</div>
          <div style="font-size: 6.5pt; color: #64748b;">NumPad 4-Digits</div>
        </div>
        <div style="display: flex; align-items: center; color: #6366f1; font-weight: 900;">➔</div>
        <div style="flex: 1; text-align: center; background: white; padding: 6px 4px; border-radius: 6px; border: 1px solid #cbd5e1;">
          <div style="font-size: 7pt; font-weight: 800; color: #4f46e5;">PHASE 3</div>
          <div style="font-size: 7.5pt; font-weight: 700; color: #0f172a; margin: 2px 0;">Identity Check</div>
          <div style="font-size: 6.5pt; color: #64748b;">"This is me"</div>
        </div>
        <div style="display: flex; align-items: center; color: #6366f1; font-weight: 900;">➔</div>
        <div style="flex: 1; text-align: center; background: white; padding: 6px 4px; border-radius: 6px; border: 1px solid #cbd5e1;">
          <div style="font-size: 7pt; font-weight: 800; color: #4f46e5;">PHASE 4</div>
          <div style="font-size: 7.5pt; font-weight: 700; color: #0f172a; margin: 2px 0;">Select Choices</div>
          <div style="font-size: 6.5pt; color: #64748b;">Tap Candidate / NOTA</div>
        </div>
        <div style="display: flex; align-items: center; color: #6366f1; font-weight: 900;">➔</div>
        <div style="flex: 1; text-align: center; background: white; padding: 6px 4px; border-radius: 6px; border: 1px solid #cbd5e1;">
          <div style="font-size: 7pt; font-weight: 800; color: #4f46e5;">PHASE 5</div>
          <div style="font-size: 7.5pt; font-weight: 700; color: #0f172a; margin: 2px 0;">Review Choices</div>
          <div style="font-size: 6.5pt; color: #64748b;">Verify or Change</div>
        </div>
        <div style="display: flex; align-items: center; color: #6366f1; font-weight: 900;">➔</div>
        <div style="flex: 1; text-align: center; background: white; padding: 6px 4px; border-radius: 6px; border: 1px solid #cbd5e1;">
          <div style="font-size: 7pt; font-weight: 800; color: #4f46e5;">PHASE 6</div>
          <div style="font-size: 7.5pt; font-weight: 700; color: #0f172a; margin: 2px 0;">Cast Ballot</div>
          <div style="font-size: 6.5pt; color: #64748b;">Encrypted Box</div>
        </div>
        <div style="display: flex; align-items: center; color: #6366f1; font-weight: 900;">➔</div>
        <div style="flex: 1; text-align: center; background: #ecfdf5; padding: 6px 4px; border-radius: 6px; border: 1px solid #a7f3d0;">
          <div style="font-size: 7pt; font-weight: 800; color: #059669;">PHASE 7</div>
          <div style="font-size: 7.5pt; font-weight: 700; color: #065f46; margin: 2px 0;">VVPAT Drop</div>
          <div style="font-size: 6.5pt; color: #047857;">Drop in Box</div>
        </div>
      </div>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Published for Polling Stations & Voters</span>
    </div>
  </div>


  <!-- ========================================================================= -->
  <!-- PAGE 2: PHASE 1 - DESK REGISTRATION & ANATOMY OF BOOTH SLIP              -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div class="page-header">
        <div class="brand">
          <div class="logo-box">E</div>
          <span class="title">Campus E-Voting System</span>
        </div>
        <span class="doc-tag">Phase 1: Voter Slip Issuance</span>
      </div>

      <h1 class="sec-title"><span class="step-badge">Phase 1</span> Polling Desk & Voter Booth Slip</h1>
      <p class="sec-desc">
        Before entering the voting booth kiosk, every voter is verified in-person by the Presiding Polling Officer against the official printed institutional electoral roll. Once verified, you are issued a single pre-printed, sequential Booth Slip.
      </p>

      <div class="grid-2" style="margin-bottom: 12px; align-items: stretch;">
        <!-- Slip Graphic -->
        <div style="background: #ffffff; border: 2px dashed #94a3b8; border-radius: 8px; padding: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); position: relative;">
          <div style="text-align: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; margin-bottom: 10px;">
            <div style="font-size: 8pt; font-weight: 800; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em;">CAMPUS GENERAL ELECTIONS 2026</div>
            <div style="font-size: 7pt; color: #64748b;">OFFICIAL VOTING SLIP • CONFIDENTIAL</div>
          </div>

          <div style="background: #f1f5f9; padding: 8px; border-radius: 6px; margin-bottom: 10px; font-size: 8pt; display: flex; justify-content: space-between;">
            <div>
              <span style="color: #64748b; font-size: 7pt; display: block;">Assigned Terminal:</span>
              <strong style="color: #1e293b; font-size: 9pt;">BOOTH-01</strong>
            </div>
            <div style="text-align: right;">
              <span style="color: #64748b; font-size: 7pt; display: block;">Sequential Ballot ID:</span>
              <strong style="font-family: monospace; color: #4f46e5; font-size: 9pt;">SUE26-B1-1001</strong>
            </div>
          </div>

          <div style="border: 2px solid #e11d48; background: #fff1f2; border-radius: 8px; padding: 10px; text-align: center; margin-bottom: 10px;">
            <span style="font-size: 7.5pt; font-weight: 700; color: #9f1239; text-transform: uppercase; display: block; margin-bottom: 2px;">Your 4-Digit Security PIN</span>
            <div style="font-size: 20pt; font-weight: 900; letter-spacing: 0.25em; font-family: monospace; color: #e11d48;">
              4 8 2 9
            </div>
            <span style="font-size: 6.5pt; color: #be123c;">Never disclose to anyone. Valid for 1 single vote session.</span>
          </div>

          <div style="font-size: 7pt; color: #64748b; line-height: 1.3; border-top: 1px dashed #cbd5e1; padding-top: 6px;">
            • Proceed directly to Booth #1.<br>
            • The terminal screen must show Ballot ID: <strong>SUE26-B1-1001</strong>.<br>
            • Enter PIN <strong>4829</strong> to begin voting.
          </div>
        </div>

        <!-- Explanation & Verification Rules -->
        <div style="display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <h3 style="font-size: 9.5pt; font-weight: 800; color: #1e293b; margin-bottom: 6px;">
              Anatomy of the Voter Slip
            </h3>
            <ul style="font-size: 8.5pt; color: #475569; padding-left: 16px; line-height: 1.45; margin-bottom: 10px;">
              <li><strong>Assigned Terminal:</strong> Indicates the exact booth kiosk (e.g. BOOTH-01) you must enter. Slips cannot be used at any other booth.</li>
              <li><strong>Sequential Ballot ID:</strong> Matches the physical electoral roll counter. The booth machine displays this exact ID to guarantee correct sequence.</li>
              <li><strong>4-Digit PIN:</strong> Generated with high-entropy cryptographic randomization. This PIN is hashed in the database; even election officers cannot read it.</li>
            </ul>

            <div class="warn-box">
              <span>⚠️</span>
              <div>
                <strong>Slip Security Rule:</strong> Slips are pre-printed sequentially. If you misplace or damage your slip, notify the presiding officer immediately. The officer will invalidate the spoiled slip in the system and issue the next sequential slip.
              </div>
            </div>
          </div>

          <div class="tip-box">
            <span>💡</span>
            <div>
              <strong>Quick Tip:</strong> Keep your slip folded in your hand when walking to the booth terminal to prevent accidental camera or observer shoulder-surfing.
            </div>
          </div>
        </div>
      </div>

      <h3 style="font-size: 9.5pt; font-weight: 800; color: #1e293b; margin-bottom: 4px;">
        Polling Desk Checklist (Before You Step Inside the Booth)
      </h3>
      <table class="action-table">
        <thead>
          <tr>
            <th style="width: 25%;">Item</th>
            <th style="width: 40%;">Officer Verification Action</th>
            <th style="width: 35%;">Voter Confirmation</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Physical Photo ID</strong></td>
            <td>Officer verifies photo & student registration number in the printed master electoral roll.</td>
            <td>Sign your signature or place thumb impression on the paper register.</td>
          </tr>
          <tr>
            <td><strong>Sequential Slip</strong></td>
            <td>Officer hands you the top slip from the assigned booth's slip tray.</td>
            <td>Check that the Assigned Booth number matches the booth kiosk room door.</td>
          </tr>
          <tr>
            <td><strong>Private Entry</strong></td>
            <td>Officer ensures previous voter has exited and screen has cleared.</td>
            <td>Step into the voting compartment alone. No mobile phones or cameras allowed.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Page 2</span>
    </div>
  </div>


  <!-- ========================================================================= -->
  <!-- PAGE 3: PHASE 2 - BOOTH PIN LOGIN SCREEN                                  -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div class="page-header">
        <div class="brand">
          <div class="logo-box">E</div>
          <span class="title">Campus E-Voting System</span>
        </div>
        <span class="doc-tag">Phase 2: Kiosk PIN Entry</span>
      </div>

      <h1 class="sec-title"><span class="step-badge">Phase 2</span> Entering the Booth & PIN Login Screen</h1>
      <p class="sec-desc">
        Walk into your designated voting booth. The kiosk touchscreen displays the Welcome screen with the current sequential Ballot ID ready.
      </p>

      <!-- Terminal Mockup 1: PIN Screen -->
      <div class="terminal-window">
        <div class="terminal-topbar">
          <div class="topbar-left">
            <div class="topbar-dot dot-red"></div>
            <div class="topbar-dot dot-yellow"></div>
            <div class="topbar-dot dot-green"></div>
            <span class="topbar-title">Campus E-Voting Booth Terminal #01 • /kiosk/vote</span>
          </div>
          <div class="topbar-right">
            <span>● SECURE LINK ACTIVE</span>
            <span style="color: #94a3b8; font-family: monospace;">10:14:02 AM</span>
          </div>
        </div>

        <div class="terminal-body" style="display: flex; justify-content: center; align-items: center; padding: 18px;">
          <!-- Inside Kiosk UI -->
          <div style="background: #ffffff; border-radius: 10px; width: 100%; max-width: 480px; padding: 16px 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); text-align: center; position: relative;">

            <!-- Header Badge -->
            <div style="display: inline-flex; align-items: center; gap: 6px; background: #e0e7ff; color: #3730a3; padding: 3px 10px; border-radius: 9999px; font-size: 7.5pt; font-weight: 700; margin-bottom: 6px;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: #4f46e5;"></span>
              CAMPUS GENERAL ELECTIONS 2026
            </div>

            <h2 style="font-size: 13pt; font-weight: 800; color: #0f172a; margin-bottom: 2px;">Welcome to Voting Booth 1</h2>
            <p style="font-size: 7.5pt; color: #64748b; margin-bottom: 10px;">Please enter the 4-digit PIN from your voting slip to unlock your ballot.</p>

            <!-- Callout 1: Slip ID Banner -->
            <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; display: inline-flex; align-items: center; gap: 10px; margin-bottom: 12px; position: relative;" class="highlight-ring">
              <span style="font-size: 7.5pt; color: #64748b;">Current Voting ID:</span>
              <strong style="font-family: monospace; font-size: 10.5pt; color: #4f46e5; letter-spacing: 0.05em;">SUE26-B1-1001</strong>

              <div class="callout-overlay" style="right: -14px; top: -12px;">
                <div class="callout-marker">1</div>
              </div>
            </div>

            <!-- PIN Input Display -->
            <div style="position: relative; margin-bottom: 12px;">
              <div style="display: flex; justify-content: center; gap: 8px;">
                <div style="width: 32px; height: 38px; border: 2px solid #4f46e5; border-radius: 6px; background: #eef2ff; display: flex; align-items: center; justify-content: center; font-size: 18pt; font-weight: 900; color: #1e1b4b;">●</div>
                <div style="width: 32px; height: 38px; border: 2px solid #4f46e5; border-radius: 6px; background: #eef2ff; display: flex; align-items: center; justify-content: center; font-size: 18pt; font-weight: 900; color: #1e1b4b;">●</div>
                <div style="width: 32px; height: 38px; border: 2px solid #cbd5e1; border-radius: 6px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 14pt; color: #94a3b8;">·</div>
                <div style="width: 32px; height: 38px; border: 2px solid #cbd5e1; border-radius: 6px; background: #f8fafc; display: flex; align-items: center; justify-content: center; font-size: 14pt; color: #94a3b8;">·</div>
              </div>

              <div class="callout-overlay" style="right: 70px; top: -8px;">
                <div class="callout-marker">2</div>
                <div class="callout-pointer">Enter 4-Digit PIN</div>
              </div>
            </div>

            <!-- Touch Screen NumPad Mockup -->
            <div style="width: 170px; margin: 0 auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; position: relative;">
              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">1</button>
              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">2</button>
              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">3</button>
              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">4</button>
              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">5</button>
              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">6</button>
              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">7</button>
              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">8</button>
              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">9</button>
              
              <!-- Clear Button -->
              <button style="padding: 7px; border: 1px solid #fecdd3; background: #fff1f2; color: #e11d48; border-radius: 6px; font-weight: 800; font-size: 8.5pt; position: relative;">
                C
                <div class="callout-overlay" style="left: -12px; bottom: -8px;">
                  <div class="callout-marker">3</div>
                </div>
              </button>

              <button style="padding: 7px; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; font-weight: 800; font-size: 10.5pt; color: #1e293b;">0</button>

              <!-- Submit Button -->
              <button style="padding: 7px; border: none; background: #10b981; color: white; border-radius: 6px; font-weight: 800; font-size: 11pt; position: relative;">
                ➔
                <div class="callout-overlay" style="right: -12px; bottom: -8px;">
                  <div class="callout-marker">4</div>
                </div>
              </button>
            </div>

            <div style="font-size: 7pt; color: #94a3b8;">
              Touch screen or use keyboard numbers • Protected by 3-attempt lockout
            </div>
          </div>
        </div>
      </div>

      <!-- Action Table for Step 2 -->
      <table class="action-table">
        <thead>
          <tr>
            <th style="width: 8%;">Callout</th>
            <th style="width: 25%;">Interface Element</th>
            <th style="width: 35%;">Action (What to Click)</th>
            <th style="width: 32%;">Expected Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center;"><span class="pin">1</span></td>
            <td><strong>Sequential Voting ID</strong></td>
            <td>Compare with the ID on your printed slip.</td>
            <td>Must match exactly (e.g. <code>SUE26-B1-1001</code>). If mismatched, do not enter PIN; notify the officer.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">2</span></td>
            <td><strong>PIN Input Box & NumPad</strong></td>
            <td>Tap the 4 numeric keys on the on-screen NumPad (or use physical keyboard).</td>
            <td>Input dots fill in securely (●●●●). The PIN is never displayed in plaintext.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">3</span></td>
            <td><strong>Clear Button [ C ]</strong></td>
            <td>Tap <strong>[ C ]</strong> if you typed an incorrect digit.</td>
            <td>Clears the typed digits so you can re-enter your 4-digit PIN cleanly.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">4</span></td>
            <td><strong>Start Voting Arrow [ ➔ ]</strong></td>
            <td>Tap the green <strong>[ ➔ ]</strong> button (or press Enter).</td>
            <td>Verifies cryptographic token and transitions directly to Identity Confirmation.</td>
          </tr>
        </tbody>
      </table>

      <div class="tip-box">
        <span>💡</span>
        <div>
          <strong>Brute Force Defense:</strong> The terminal allows up to 3 PIN attempts. If someone enters 3 incorrect PINs, the slip is locked automatically, and the desk officer must re-verify the voter.
        </div>
      </div>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Page 3</span>
    </div>
  </div>


  <!-- ========================================================================= -->
  <!-- PAGE 4: PHASE 3 - IDENTITY CONFIRMATION SCREEN                            -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div class="page-header">
        <div class="brand">
          <div class="logo-box">E</div>
          <span class="title">Campus E-Voting System</span>
        </div>
        <span class="doc-tag">Phase 3: Identity Confirmation</span>
      </div>

      <h1 class="sec-title"><span class="step-badge">Phase 3</span> Voter Identity Confirmation ("This is me")</h1>
      <p class="sec-desc">
        After entering your correct PIN, the system displays your verified institutional registration. Confirm that your details match your physical enrollment before ballot access is granted.
      </p>

      <!-- Terminal Mockup 2: Identity Screen -->
      <div class="terminal-window">
        <div class="terminal-topbar">
          <div class="topbar-left">
            <div class="topbar-dot dot-red"></div>
            <div class="topbar-dot dot-yellow"></div>
            <div class="topbar-dot dot-green"></div>
            <span class="topbar-title">Campus E-Voting Booth Terminal #01 • Identity Verification</span>
          </div>
          <div class="topbar-right">
            <span>● AUTHENTICATED</span>
            <span style="color: #94a3b8; font-family: monospace;">10:14:18 AM</span>
          </div>
        </div>

        <div class="terminal-body" style="display: flex; justify-content: center; align-items: center; padding: 22px;">
          <!-- Inside Identity Card -->
          <div style="background: #ffffff; border-radius: 12px; width: 100%; max-width: 460px; padding: 20px 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); text-align: center; position: relative;">

            <div style="width: 44px; height: 44px; border-radius: 50%; background: #e0e7ff; color: #4338ca; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px auto; font-size: 18pt;">
              👤
            </div>

            <h2 style="font-size: 14pt; font-weight: 800; color: #0f172a; margin-bottom: 2px;">Campus General Elections 2026</h2>
            <p style="font-size: 8pt; color: #64748b; margin-bottom: 14px;">Please confirm your registered voter profile below:</p>

            <!-- Voter Profile Card (Callout 1) -->
            <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; text-align: left; margin-bottom: 16px; position: relative;" class="highlight-ring">
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
                <span style="font-size: 7.5pt; color: #64748b;">Full Name:</span>
                <strong style="font-size: 8.5pt; color: #0f172a;">Arjun Sharma</strong>
              </div>
              <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
                <span style="font-size: 7.5pt; color: #64748b;">Roll / Registration No:</span>
                <strong style="font-family: monospace; font-size: 8.5pt; color: #4f46e5;">2024-CS-042</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="font-size: 7.5pt; color: #64748b;">Department & Semester:</span>
                <strong style="font-size: 8pt; color: #334155;">Computer Science & Engg | Sem 6</strong>
              </div>

              <div class="callout-overlay" style="right: -12px; top: -10px;">
                <div class="callout-marker">1</div>
                <div class="callout-pointer">Verify Name & Roll No</div>
              </div>
            </div>

            <!-- Buttons: Confirm / Reject -->
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <!-- Primary Confirm Button (Callout 2) -->
              <button style="width: 100%; padding: 10px; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 800; font-size: 9.5pt; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 3px 8px rgba(16, 185, 129, 0.4); position: relative;">
                <span>This is me, start voting</span>
                <span style="font-size: 11pt;">➔</span>

                <div class="callout-overlay" style="right: 12px; top: -8px;">
                  <div class="callout-marker">2</div>
                </div>
              </button>

              <!-- Secondary Reject Button (Callout 3) -->
              <button style="width: 100%; padding: 6px; background: transparent; color: #64748b; border: none; font-size: 8pt; font-weight: 600; cursor: pointer; position: relative;">
                This is not me (Cancel session)

                <div class="callout-overlay" style="right: 40px; bottom: -4px;">
                  <div class="callout-marker">3</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Table for Step 3 -->
      <table class="action-table">
        <thead>
          <tr>
            <th style="width: 8%;">Callout</th>
            <th style="width: 25%;">Interface Element</th>
            <th style="width: 35%;">Action (What to Click)</th>
            <th style="width: 32%;">Expected Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center;"><span class="pin">1</span></td>
            <td><strong>Voter Credentials Card</strong></td>
            <td>Verify your Name, Roll Number, and Academic Department.</td>
            <td>Confirms that the polling desk officer matched your identity accurately.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">2</span></td>
            <td><strong>"This is me, start voting"</strong></td>
            <td>Click the green primary confirmation button.</td>
            <td>Unlocks the confidential electronic ballot and presents the first candidate position.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">3</span></td>
            <td><strong>"This is not me"</strong></td>
            <td>Click only if another student's name appears.</td>
            <td>Immediately revokes the session, resets the terminal, and flags desk officer.</td>
          </tr>
        </tbody>
      </table>

      <div class="warn-box">
        <span>⚠️</span>
        <div>
          <strong>Privacy Assurance:</strong> Once you click "This is me", your identity is detached from all ballot selections. The system creates an anonymous cryptographic ballot token. No database record or log ever links your name to your chosen candidates.
        </div>
      </div>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Page 4</span>
    </div>
  </div>


  <!-- ========================================================================= -->
  <!-- PAGE 5: PHASE 4 - CANDIDATE BALLOT & SELECTION SCREEN                     -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div class="page-header">
        <div class="brand">
          <div class="logo-box">E</div>
          <span class="title">Campus E-Voting System</span>
        </div>
        <span class="doc-tag">Phase 4: Candidate Selection</span>
      </div>

      <h1 class="sec-title"><span class="step-badge">Phase 4</span> Candidate Ballot & Voting Screen</h1>
      <p class="sec-desc">
        Positions appear sequentially (e.g., Vice President ➔ General Secretary). Each candidate card displays high-resolution photo, full name, department, semester, and manifesto summary.
      </p>

      <!-- Terminal Mockup 3: Ballot Selection Screen -->
      <div class="terminal-window">
        <div class="terminal-topbar">
          <div class="topbar-left">
            <div class="topbar-dot dot-red"></div>
            <div class="topbar-dot dot-yellow"></div>
            <div class="topbar-dot dot-green"></div>
            <span class="topbar-title">Position 1 of 2 • Vice President (Choose 1)</span>
          </div>
          <div class="topbar-right">
            <span>● 1 CHOICE REQUIRED</span>
            <span style="color: #94a3b8; font-family: monospace;">10:14:35 AM</span>
          </div>
        </div>

        <!-- Progress bar -->
        <div style="height: 4px; background: #334155; width: 100%;">
          <div style="height: 100%; background: #4f46e5; width: 50%;"></div>
        </div>

        <div class="terminal-body" style="padding: 14px 16px;">
          <!-- Header Inside Ballot -->
          <div style="text-align: center; margin-bottom: 12px;">
            <span style="font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: #818cf8; letter-spacing: 0.05em;">EXECUTIVE COUNCIL ELECTION</span>
            <h2 style="font-size: 14pt; font-weight: 900; color: #ffffff; letter-spacing: -0.01em;">Vice President</h2>
            <p style="font-size: 7.5pt; color: #94a3b8;">Select 1 candidate below, or choose None of the above (NOTA):</p>
          </div>

          <!-- Candidates Grid -->
          <div class="grid-2" style="margin-bottom: 10px;">
            <!-- Candidate 1: Selected (Callout 2) -->
            <div style="background: #1e293b; border: 2px solid #10b981; border-radius: 8px; overflow: hidden; display: flex; position: relative; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);">
              <div style="width: 75px; height: 75px; background: #334155; flex-shrink: 0; position: relative;">
                {"<img src='" + obama_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Candidate'>" if obama_photo else "<div style='width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 20pt; color: white;'>BO</div>"}
                <div style="position: absolute; bottom: 3px; left: 3px; background: #10b981; color: white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 9pt; font-weight: 900;">✓</div>
              </div>
              <div style="padding: 8px 10px; display: flex; flex-direction: column; justify-content: center; flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <strong style="color: #ffffff; font-size: 9pt;">Barack Obama</strong>
                  <span style="background: #064e3b; color: #34d399; font-size: 6.5pt; font-weight: 800; padding: 1px 5px; border-radius: 4px; text-transform: uppercase;">SELECTED</span>
                </div>
                <div style="font-size: 7pt; color: #94a3b8; margin: 1px 0;">Constitutional Law | Sem 5</div>
                <div style="font-size: 6.5pt; color: #64748b;">Manifesto: Student Governance & Digital Transparency</div>
              </div>

              <div class="callout-overlay" style="right: 8px; top: -10px;">
                <div class="callout-marker">1</div>
                <div class="callout-pointer">Tap Candidate Card</div>
              </div>
            </div>

            <!-- Candidate 2: Unselected -->
            <div style="background: #1e293b; border: 1.5px solid #334155; border-radius: 8px; overflow: hidden; display: flex; position: relative; opacity: 0.85;">
              <div style="width: 75px; height: 75px; background: #334155; flex-shrink: 0;">
                {"<img src='" + gandhi_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Candidate'>" if gandhi_photo else "<div style='width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 20pt; color: white;'>RG</div>"}
              </div>
              <div style="padding: 8px 10px; display: flex; flex-direction: column; justify-content: center; flex: 1;">
                <strong style="color: #ffffff; font-size: 9pt;">Rahul Gandhi</strong>
                <div style="font-size: 7pt; color: #94a3b8; margin: 1px 0;">Economics & Sociology | Sem 3</div>
                <div style="font-size: 6.5pt; color: #64748b;">Manifesto: Youth Empowerment & Campus Amenities</div>
              </div>
            </div>
          </div>

          <!-- NOTA Option (Callout 3) -->
          <div style="background: #1e293b; border: 1.5px dashed #475569; border-radius: 6px; padding: 6px 12px; display: flex; align-items: center; justify-content: space-between; position: relative;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #94a3b8; font-size: 11pt;">⊘</span>
              <div>
                <strong style="font-size: 8pt; color: #cbd5e1;">None of the above (NOTA)</strong>
                <span style="font-size: 6.5pt; color: #64748b; margin-left: 6px;">Exercise democratic dissent for this post</span>
              </div>
            </div>
            <button style="background: transparent; border: 1px solid #64748b; color: #cbd5e1; font-size: 7pt; padding: 2px 8px; border-radius: 4px;">Choose NOTA</button>

            <div class="callout-overlay" style="right: 70px; top: -8px;">
              <div class="callout-marker">2</div>
              <div class="callout-pointer">NOTA Alternative</div>
            </div>
          </div>

          <!-- Bottom Navigation Bar (Callout 4) -->
          <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; padding-top: 8px;">
            <button style="background: transparent; border: 1px solid #475569; color: #94a3b8; font-size: 7.5pt; padding: 4px 10px; border-radius: 6px;">← Previous Position</button>
            <div style="color: #10b981; font-size: 7pt; font-weight: 600;">Selection Recorded ✓</div>
            <button style="background: #4f46e5; border: none; color: white; font-size: 8pt; font-weight: 700; padding: 5px 12px; border-radius: 6px; display: flex; align-items: center; gap: 4px; position: relative;">
              <span>Next Position</span>
              <span>➔</span>

              <div class="callout-overlay" style="right: -8px; top: -10px;">
                <div class="callout-marker">3</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- Action Table for Step 4 -->
      <table class="action-table">
        <thead>
          <tr>
            <th style="width: 8%;">Callout</th>
            <th style="width: 25%;">Interface Element</th>
            <th style="width: 35%;">Action (What to Click)</th>
            <th style="width: 32%;">Expected Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center;"><span class="pin">1</span></td>
            <td><strong>Candidate Card</strong></td>
            <td>Click or tap anywhere on your chosen candidate's card.</td>
            <td>The card highlights in bright green with a checkmark badge. Your vote choice is staged in memory.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">2</span></td>
            <td><strong>NOTA Option</strong></td>
            <td>Click if you decline to vote for any standing candidates.</td>
            <td>Registers a valid NOTA ballot entry for this specific position.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">3</span></td>
            <td><strong>Next Position Button</strong></td>
            <td>Tap <strong>[ Next Position ➔ ]</strong> (or wait 800ms auto-advance).</td>
            <td>Advances automatically to the next election position until all positions are filled.</td>
          </tr>
        </tbody>
      </table>

      <div class="tip-box">
        <span>💡</span>
        <div>
          <strong>Change Mind Anytime:</strong> If you tap Candidate A, and then decide on Candidate B, simply tap Candidate B. The selection will switch immediately. You are never locked in until the final review step.
        </div>
      </div>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Page 5</span>
    </div>
  </div>


  <!-- ========================================================================= -->
  <!-- PAGE 6: PHASE 5 - REVIEW CHOICES SCREEN                                   -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div class="page-header">
        <div class="brand">
          <div class="logo-box">E</div>
          <span class="title">Campus E-Voting System</span>
        </div>
        <span class="doc-tag">Phase 5: Ballot Review</span>
      </div>

      <h1 class="sec-title"><span class="step-badge">Phase 5</span> Review Choices Screen (Final Step)</h1>
      <p class="sec-desc">
        Before your ballot is cast, the terminal shows a complete summary of your selections. You can inspect each choice and change any position before final submission.
      </p>

      <!-- Terminal Mockup 4: Review Choices Screen -->
      <div class="terminal-window">
        <div class="terminal-topbar">
          <div class="topbar-left">
            <div class="topbar-dot dot-red"></div>
            <div class="topbar-dot dot-yellow"></div>
            <div class="topbar-dot dot-green"></div>
            <span class="topbar-title">Final Step • Review Your Choices</span>
          </div>
          <div class="topbar-right">
            <span>● 2 OF 2 POSITIONS ANSWERED</span>
            <span style="color: #94a3b8; font-family: monospace;">10:14:52 AM</span>
          </div>
        </div>

        <div class="terminal-body" style="padding: 14px 18px;">
          <!-- Review Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid #334155; padding-bottom: 6px; margin-bottom: 10px;">
            <div>
              <span style="font-size: 7pt; font-weight: 800; color: #818cf8; text-transform: uppercase;">VERIFICATION STEP</span>
              <h2 style="font-size: 13pt; font-weight: 900; color: #ffffff;">Review Your Choices</h2>
            </div>
            <span style="font-size: 7.5pt; color: #94a3b8;">Check each choice carefully before submitting.</span>
          </div>

          <!-- Review Position Rows -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;">
            <!-- Position 1 Review Row -->
            <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; position: relative;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; border-radius: 6px; background: #334155; overflow: hidden; flex-shrink: 0;">
                  {"<img src='" + obama_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Candidate'>" if obama_photo else "<div style='color: white; font-size: 9pt; display: flex; align-items: center; justify-content: center; height: 100%;'>BO</div>"}
                </div>
                <div>
                  <div style="font-size: 7pt; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Vice President</div>
                  <strong style="font-size: 9pt; color: #ffffff;">Barack Obama</strong>
                  <span style="font-size: 7pt; color: #64748b; margin-left: 6px;">Constitutional Law</span>
                </div>
              </div>

              <!-- Change Button (Callout 2) -->
              <button style="background: #334155; color: #e2e8f0; border: none; font-size: 7.5pt; font-weight: 700; padding: 4px 10px; border-radius: 5px; cursor: pointer; position: relative;">
                Change
                <div class="callout-overlay" style="right: -8px; top: -8px;">
                  <div class="callout-marker">2</div>
                </div>
              </button>

              <div class="callout-overlay" style="left: 120px; top: -10px;">
                <div class="callout-marker">1</div>
              </div>
            </div>

            <!-- Position 2 Review Row -->
            <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 32px; height: 32px; border-radius: 6px; background: #334155; overflow: hidden; flex-shrink: 0;">
                  {"<img src='" + kejriwal_photo + "' style='width: 100%; height: 100%; object-fit: cover;' alt='Candidate'>" if kejriwal_photo else "<div style='color: white; font-size: 9pt; display: flex; align-items: center; justify-content: center; height: 100%;'>AK</div>"}
                </div>
                <div>
                  <div style="font-size: 7pt; color: #94a3b8; text-transform: uppercase; font-weight: 700;">General Secretary</div>
                  <strong style="font-size: 9pt; color: #ffffff;">Arvind Kejriwal</strong>
                  <span style="font-size: 7pt; color: #64748b; margin-left: 6px;">Mechanical Engg</span>
                </div>
              </div>

              <button style="background: #334155; color: #e2e8f0; border: none; font-size: 7.5pt; font-weight: 700; padding: 4px 10px; border-radius: 5px; cursor: pointer;">
                Change
              </button>
            </div>
          </div>

          <!-- Bottom Action Buttons (Callout 3) -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; padding-top: 10px;">
            <button style="background: transparent; color: #94a3b8; border: 1px solid #475569; font-size: 8pt; padding: 6px 12px; border-radius: 6px;">
              ← Back to Ballot
            </button>

            <!-- Submit Button -->
            <button style="background: #10b981; color: white; border: none; font-size: 9.5pt; font-weight: 900; padding: 8px 20px; border-radius: 8px; display: flex; align-items: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4); position: relative;">
              <span>Confirm & Submit Vote</span>
              <span style="font-size: 11pt;">➔</span>

              <div class="callout-overlay" style="right: -10px; top: -10px;">
                <div class="callout-marker">3</div>
                <div class="callout-pointer">Final Submit</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- Action Table for Step 5 -->
      <table class="action-table">
        <thead>
          <tr>
            <th style="width: 8%;">Callout</th>
            <th style="width: 25%;">Interface Element</th>
            <th style="width: 35%;">Action (What to Click)</th>
            <th style="width: 32%;">Expected Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center;"><span class="pin">1</span></td>
            <td><strong>Choices Summary List</strong></td>
            <td>Review your chosen candidates across every contested post.</td>
            <td>Assures you that all candidate choices match your exact voting intent.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">2</span></td>
            <td><strong>[ Change ] Button</strong></td>
            <td>Click <strong>[ Change ]</strong> beside any position you wish to revise.</td>
            <td>Jumps immediately back to that ballot position, allowing you to select a different candidate.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">3</span></td>
            <td><strong>[ Confirm & Submit Vote ]</strong></td>
            <td>Click the green primary button when you are 100% satisfied.</td>
            <td>Opens the final confirmation authorization prompt.</td>
          </tr>
        </tbody>
      </table>

      <div class="tip-box">
        <span>💡</span>
        <div>
          <strong>Take Your Time:</strong> The kiosk has a generous 5-minute inactivity safeguard. Feel free to review your choices carefully before confirming.
        </div>
      </div>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Page 6</span>
    </div>
  </div>


  <!-- ========================================================================= -->
  <!-- PAGE 7: PHASE 6 & 7 - CONFIRMATION MODAL & VVPAT PAPER RECEIPT            -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div class="page-header">
        <div class="brand">
          <div class="logo-box">E</div>
          <span class="title">Campus E-Voting System</span>
        </div>
        <span class="doc-tag">Phase 6 & 7: Cast & VVPAT Slip</span>
      </div>

      <h1 class="sec-title"><span class="step-badge">Phase 6 & 7</span> Ballot Cast & VVPAT Paper Receipt</h1>
      <p class="sec-desc">
        Your ballot is encrypted into the digital ballot box, and the attached silent printer produces your paper VVPAT audit receipt.
      </p>

      <div class="grid-2" style="margin-bottom: 12px; align-items: stretch;">
        <!-- Left: Confirmation Modal Mockup -->
        <div style="background: #0f172a; border: 2px solid #334155; border-radius: 10px; padding: 14px; position: relative;">
          <div style="font-size: 7.5pt; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #1e293b; padding-bottom: 4px;">
            Security Confirmation Modal
          </div>

          <div style="background: #ffffff; border-radius: 8px; padding: 14px; text-align: center; color: #0f172a;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: #fef2f2; color: #e11d48; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px auto; font-size: 16pt;">
              🔒
            </div>

            <h3 style="font-size: 11pt; font-weight: 900; color: #0f172a; margin-bottom: 4px;">Cast Ballot?</h3>
            <p style="font-size: 7.5pt; color: #64748b; line-height: 1.35; margin-bottom: 12px;">
              This action cannot be undone. Your ballot will be sealed and encrypted into the ballot box.
            </p>

            <div style="display: flex; gap: 8px;">
              <button style="flex: 1; padding: 7px; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 7.5pt; font-weight: 700;">
                Cancel, review
              </button>

              <!-- Final Cast Button (Callout 1) -->
              <button style="flex: 1.3; padding: 7px; background: #10b981; color: white; border: none; border-radius: 6px; font-size: 8pt; font-weight: 900; box-shadow: 0 3px 6px rgba(16, 185, 129, 0.4); position: relative;">
                Yes, Cast Vote
                <div class="callout-overlay" style="right: -8px; top: -10px;">
                  <div class="callout-marker">1</div>
                </div>
              </button>
            </div>
          </div>

          <!-- Success Badge Below -->
          <div style="margin-top: 10px; background: #064e3b; border: 1px solid #059669; border-radius: 6px; padding: 8px; text-align: center; color: #a7f3d0; font-size: 7.5pt;">
            <div style="font-size: 9pt; font-weight: 800; color: #ffffff;">✓ Your Vote Has Been Recorded!</div>
            Screen automatically purges for the next voter in <strong>5 seconds</strong>.
          </div>
        </div>

        <!-- Right: VVPAT Paper Receipt Mockup -->
        <div style="background: #ffffff; border: 2px dashed #94a3b8; border-radius: 8px; padding: 12px; position: relative;">
          <div style="text-align: center; border-bottom: 1px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px;">
            <div style="font-size: 7.5pt; font-weight: 900; text-transform: uppercase;">CAMPUS E-VOTING SYSTEM</div>
            <div style="font-size: 6.5pt; color: #475569;">OFFICIAL VVPAT AUDIT RECORD</div>
          </div>

          <div style="font-size: 7pt; color: #334155; line-height: 1.4; border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; margin-bottom: 8px;">
            <div><strong>Ballot Ref:</strong> <code style="font-weight: 900; color: #4f46e5;">VOTE-A8F4C201</code></div>
            <div><strong>Archive Box:</strong> Ballot Box (Anonymous)</div>
            <div><strong>Date & Time:</strong> 10 Nov 2026, 10:15 AM</div>
          </div>

          <!-- Chosen Candidates on Paper Slip -->
          <div style="font-size: 7.5pt; margin-bottom: 8px;">
            <div style="font-weight: 800; color: #0f172a; margin-bottom: 3px; font-size: 7pt; text-transform: uppercase;">Your Verified Choices:</div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding: 2px 0;">
              <span>Vice President:</span>
              <strong>Barack Obama</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding: 2px 0;">
              <span>General Secretary:</span>
              <strong>Arvind Kejriwal</strong>
            </div>
          </div>

          <div style="background: #f1f5f9; border-radius: 4px; padding: 6px; text-align: center; font-size: 6.5pt; color: #475569; margin-bottom: 8px;">
            ✓ Cryptographic HMAC Verification Signature Included
          </div>

          <!-- Callout 2: Drop into Box -->
          <div style="background: #eff6ff; border: 1.5px solid #3b82f6; border-radius: 6px; padding: 6px; text-align: center; position: relative;" class="highlight-ring">
            <span style="font-size: 7.5pt; font-weight: 800; color: #1e40af;">📥 ACTION: DROP SLIP IN BALLOT BOX</span>
            <div class="callout-overlay" style="right: -8px; top: -10px;">
              <div class="callout-marker">2</div>
              <div class="callout-pointer">Drop in Box</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Table for Step 6 & 7 -->
      <table class="action-table">
        <thead>
          <tr>
            <th style="width: 8%;">Callout</th>
            <th style="width: 25%;">Interface Element</th>
            <th style="width: 35%;">Action (What to Click / Do)</th>
            <th style="width: 32%;">Expected Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center;"><span class="pin">1</span></td>
            <td><strong>[ Yes, Cast Vote ] Button</strong></td>
            <td>Click the green confirmation button on the modal.</td>
            <td>Electrically seals your ballot with blind token encryption and triggers the thermal printer.</td>
          </tr>
          <tr>
            <td style="text-align: center;"><span class="pin">2</span></td>
            <td><strong>Printed VVPAT Slip Drop</strong></td>
            <td>Collect paper slip from printer; drop it into the sealed box.</td>
            <td>Provides a permanent physical paper trail for recount audits. You may now exit the booth.</td>
          </tr>
        </tbody>
      </table>

      <div class="warn-box">
        <span>⚠️</span>
        <div>
          <strong>Do Not Take Receipt Home:</strong> The printed VVPAT slip is an official ballot instrument. Taking it outside the polling station is strictly prohibited under institutional election bylaws. Always deposit it into the physical ballot box.
        </div>
      </div>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Page 7</span>
    </div>
  </div>


  <!-- ========================================================================= -->
  <!-- PAGE 8: CONTINGENCY SCENARIOS, OFFLINE SAFETY & FAQ                       -->
  <!-- ========================================================================= -->
  <div class="page">
    <div>
      <div class="page-header">
        <div class="brand">
          <div class="logo-box">E</div>
          <span class="title">Campus E-Voting System</span>
        </div>
        <span class="doc-tag">Contingencies & Voter FAQ</span>
      </div>

      <h1 class="sec-title"><span class="step-badge">Contingency</span> Real-Time Offline Safety & FAQs</h1>
      <p class="sec-desc">
        The Campus E-Voting terminal features enterprise fault tolerance. If network or hardware connections drop, safety overlays protect your vote.
      </p>

      <!-- Offline Screen Mockup -->
      <div class="terminal-window" style="margin-bottom: 10px;">
        <div class="terminal-topbar">
          <div class="topbar-left">
            <div class="topbar-dot dot-red"></div>
            <div class="topbar-dot dot-red"></div>
            <div class="topbar-dot dot-red"></div>
            <span class="topbar-title">Offline Protection Circuit Active</span>
          </div>
          <div class="topbar-right" style="color: #f43f5e;">
            <span>⚠️ SERVER DISCONNECTED</span>
          </div>
        </div>

        <div class="terminal-body" style="padding: 14px 20px; display: flex; justify-content: center;">
          <div style="background: #0f172a; border: 2px solid #e11d48; border-radius: 10px; padding: 14px 20px; max-width: 440px; text-align: center; color: white;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(225,29,72,0.2); color: #f43f5e; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px auto; font-size: 14pt;">
              ⚡
            </div>
            <h3 style="font-size: 11pt; font-weight: 800; color: #ffffff; margin-bottom: 2px;">Terminal Temporarily Offline</h3>
            <p style="font-size: 7.5pt; color: #cbd5e1; line-height: 1.35; margin-bottom: 8px;">
              The voting booth lost secure connection to the election server. Ballots cannot be submitted without encrypted transmission.
            </p>
            <div style="background: #020617; border: 1px solid #1e293b; border-radius: 6px; padding: 6px 10px; text-align: left; font-size: 7pt; color: #94a3b8; margin-bottom: 8px;">
              <strong style="color: #f8fafc;">Ballot integrity protected:</strong> No voter data has been compromised. The terminal automatically resumes once connectivity is restored.
            </div>
            <div style="font-size: 7pt; color: #818cf8; font-family: monospace;">
              ↻ Automatic reconnect attempt every 3s • Please notify the presiding officer
            </div>
          </div>
        </div>
      </div>

      <h3 style="font-size: 9.5pt; font-weight: 800; color: #1e293b; margin-bottom: 6px;">
        Frequently Asked Questions (Voter FAQ)
      </h3>

      <div class="grid-2" style="margin-bottom: 10px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 6px;">
          <strong style="font-size: 8pt; color: #1e293b; display: block; margin-bottom: 2px;">Can anyone trace my vote back to me?</strong>
          <p style="font-size: 7.5pt; color: #64748b; line-height: 1.35;">
            <strong>No.</strong> Your ballot uses cryptographic blind tokens. Vote receipts are stored in random cryptographic hash order under a common "Ballot Box" and are decoupled from booth numbers and entry/exit timestamps.
          </p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 6px;">
          <strong style="font-size: 8pt; color: #1e293b; display: block; margin-bottom: 2px;">What if the screen freezes or power cuts out?</strong>
          <p style="font-size: 7.5pt; color: #64748b; line-height: 1.35;">
            <strong>Safe.</strong> Unsubmitted votes remain strictly in volatile memory. If a terminal loses power before you click "Yes, Cast Vote", your PIN is not marked as used. The officer can re-seat you at an active booth.
          </p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 6px;">
          <strong style="font-size: 8pt; color: #1e293b; display: block; margin-bottom: 2px;">Can I change my choices before submitting?</strong>
          <p style="font-size: 7.5pt; color: #64748b; line-height: 1.35;">
            <strong>Yes.</strong> On the review screen, click the [ Change ] button next to any position. You can modify your choices as many times as you wish prior to confirming.
          </p>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 6px;">
          <strong style="font-size: 8pt; color: #1e293b; display: block; margin-bottom: 2px;">What if the thermal printer runs out of paper?</strong>
          <p style="font-size: 7.5pt; color: #64748b; line-height: 1.35;">
            The terminal flags the desk officer immediately. Your electronic ballot is securely stored and timestamped. The officer replaces the paper roll to produce the physical audit voucher.
          </p>
        </div>
      </div>

      <!-- Quick Summary Table -->
      <table class="action-table" style="margin-top: 4px;">
        <thead>
          <tr>
            <th style="width: 25%;">Phase</th>
            <th style="width: 45%;">Summary of What to Click</th>
            <th style="width: 30%;">Key Takeaway</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1. Desk Slip</strong></td>
            <td>Verify photo ID, receive printed slip with Ballot ID & PIN.</td>
            <td>Check assigned booth number.</td>
          </tr>
          <tr>
            <td><strong>2. Kiosk Login</strong></td>
            <td>Tap 4-digit PIN on touchscreen NumPad ➔ Tap green [ ➔ ].</td>
            <td>3 attempts before lockout.</td>
          </tr>
          <tr>
            <td><strong>3. Identity Check</strong></td>
            <td>Confirm your name and roll number ➔ Tap [ This is me ].</td>
            <td>Report mismatches immediately.</td>
          </tr>
          <tr>
            <td><strong>4. Candidate Ballot</strong></td>
            <td>Tap chosen candidate card (or NOTA) ➔ Tap [ Next Position ➔ ].</td>
            <td>Card highlights in green.</td>
          </tr>
          <tr>
            <td><strong>5. Review Choices</strong></td>
            <td>Inspect all posts ➔ [ Change ] to edit or [ Confirm & Submit ].</td>
            <td>Final chance to review.</td>
          </tr>
          <tr>
            <td><strong>6. Final Cast</strong></td>
            <td>Read confirmation prompt ➔ Tap [ Yes, Cast Vote ].</td>
            <td>Permanently seals ballot.</td>
          </tr>
          <tr>
            <td><strong>7. VVPAT Drop</strong></td>
            <td>Take printed paper slip from printer ➔ Drop in ballot box.</td>
            <td>Screen clears in 5s.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b;">
      <span>Campus Election Commission • Standard Operating Procedure</span>
      <span>Page 8 (End of Manual)</span>
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
