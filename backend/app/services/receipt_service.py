"""
app/services/receipt_service.py — Centralized Server-Side Receipt Storage and Audit Service.

Generates and persists voter receipts (1-column half-A4 PDF and HTML) directly on the server,
organizes them into live and mock directories, and provides officer audit, view, and bulk ZIP export.
"""

import csv
import io
import json
import logging
import os
import shutil
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from flask import current_app
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

from app.extensions import db
from app.models.election import Election
from app.models.vote_receipt import VoteReceipt

logger = logging.getLogger(__name__)

RECEIPTS_BASE_DIR = os.environ.get("RECEIPTS_DIR", "/app/data/receipts")


def get_receipt_dir(is_mock: bool = False) -> str:
    sub = "mock" if is_mock else "live"
    d = os.path.join(RECEIPTS_BASE_DIR, sub)
    os.makedirs(d, exist_ok=True)
    return d


def generate_receipt_html(data: Dict[str, Any]) -> str:
    """Generate self-contained HTML for in-browser preview matching the 1-column layout."""
    slip = data.get("slip", "")
    election_title = data.get("election", "")
    institution = data.get("institution", "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga")
    booth = data.get("booth", "BOOTH-01")
    time_str = data.get("time", "")
    is_mock = bool(data.get("is_mock"))
    lines = data.get("lines", [])

    rows_html = "".join([
        f"""<tr>
            <td style="padding: 1.1mm 2mm; font-weight: 700; border-bottom: 0.5pt solid #e5e7eb; color: #111827;">{row.get('position', '')}</td>
            <td style="padding: 1.1mm 2mm; text-align: right; border-bottom: 0.5pt solid #e5e7eb; color: #111827; {'font-weight: 700;' if row.get('choice') == 'NOTA' else ''}">{row.get('choice', '')}</td>
        </tr>"""
        for row in lines
    ])

    mock_badge = """
        <div style="background: #fef3c7; border: 1px solid #f59e0b; color: #b45309; padding: 2px 8px; border-radius: 4px; font-size: 7pt; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; margin: 3px 0;">
            MOCK ELECTION — PRACTICE SLIP
        </div>
    """ if is_mock else """
        <div style="font-size: 6.5pt; font-weight: 700; letter-spacing: 0.5px; color: #4b5563; text-transform: uppercase; margin: 2px 0;">
            OFFICIAL VOTE RECEIPT — VVPAT
        </div>
    """

    mock_warning = '<div style="color: #b45309; font-weight: 700; font-size: 6.5pt; margin-top: 2px;">*** PRACTICE BALLOT — NOT AN OFFICIAL VOTE ***</div>' if is_mock else ''

    logo_url = data.get("logo", "")
    logo_html = f'<img class="logo" src="{logo_url}" alt="Logo" style="height: 12mm; max-width: 15mm; max-height: 12mm; object-fit: contain; margin: 0 auto 1.5mm; display: block;" />' if logo_url else ""

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Vote Receipt - {slip}</title>
<style>
  @page {{ size: A4 portrait; margin: 0; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #111827;
    background: #fff;
    width: 210mm;
    margin: 0 auto;
    padding-top: 6mm;
    display: flex;
    flex-direction: column;
    align-items: center;
  }}
  .receipt-card {{
    width: 125mm;
    border: 1.2pt solid #4b5563;
    border-radius: 3mm;
    padding: 3mm 4mm;
    background: #fff;
    text-align: center;
  }}
  .institution {{ font-size: 9pt; font-weight: 800; text-transform: uppercase; line-height: 1.15; }}
  .election {{ font-size: 7.5pt; color: #4b5563; font-weight: 600; margin-top: 1mm; }}
  .slip-box {{
    margin: 2mm 0;
    padding: 1.5mm;
    background: #f9fafb;
    border: 0.8pt solid #d1d5db;
    border-radius: 1.5mm;
  }}
  .slip-label {{ font-size: 6pt; font-weight: 700; color: #6b7280; text-transform: uppercase; }}
  .slip-id {{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11pt; font-weight: 800; color: #111827; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 7.8pt; margin: 1.5mm 0; text-align: left; }}
  th {{ font-size: 6.8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 1mm 2mm; background: #f3f4f6; border-bottom: 1pt solid #9ca3af; }}
  .meta-row {{ display: flex; justify-content: space-between; font-size: 6.8pt; color: #4b5563; margin-top: 1mm; }}
  .instruction {{ font-size: 6.5pt; color: #6b7280; margin-top: 1mm; }}
</style>
</head>
<body>
  <div class="receipt-card">
    {logo_html}
    <div class="institution">{institution}</div>
    <div class="election">{election_title}</div>
    {mock_badge}
    <div class="slip-box">
      <div class="slip-label">Voter Slip ID</div>
      <div class="slip-id">{slip}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Contested Position</th>
          <th style="text-align: right;">Selected Choice</th>
        </tr>
      </thead>
      <tbody>
        {rows_html}
      </tbody>
    </table>
    <div class="meta-row">
      <span>Booth: {booth}</span>
      <span>Time: {time_str}</span>
    </div>
    {mock_warning}
    <div class="instruction">Check your choices above, then drop this slip into the box at the booth.</div>
  </div>
</body>
</html>"""


def generate_receipt_pdf(data: Dict[str, Any], output_target) -> None:
    """Generate pixel-perfect half-A4 vector PDF using ReportLab strictly in the top half."""
    c = canvas.Canvas(output_target, pagesize=A4)
    width, height = A4
    half_y = height / 2.0  # 420.94 pt from bottom

    card_w = 355.0  # ~125mm
    card_x = (width - card_w) / 2.0
    top_margin = 17.0
    card_top = height - top_margin

    y = card_top - 8.0

    # Draw logo if provided
    logo_data = data.get("logo", "")
    if logo_data and "base64," in logo_data:
        try:
            import base64
            from reportlab.lib.utils import ImageReader
            b64_bytes = base64.b64decode(logo_data.split("base64,")[1])
            img_r = ImageReader(io.BytesIO(b64_bytes))
            logo_w = 36.0
            logo_h = 32.0
            c.drawImage(img_r, (width - logo_w) / 2.0, y - logo_h, width=logo_w, height=logo_h, preserveAspectRatio=True, mask='auto')
            y -= (logo_h + 3.0)
        except Exception:
            pass

    # Institution name
    inst = data.get("institution", "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga")
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(colors.HexColor("#111827"))
    c.drawCentredString(width / 2.0, y, inst[:65])
    y -= 10.5

    # Election subtitle
    elec = data.get("election", "Students' Union Election 2026-27")
    c.setFont("Helvetica", 7.0)
    c.setFillColor(colors.HexColor("#4b5563"))
    c.drawCentredString(width / 2.0, y, elec[:70])
    y -= 11.5

    # Mock vs Official badge
    is_mock = bool(data.get("is_mock"))
    if is_mock:
        c.setFillColor(colors.HexColor("#d97706"))
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(width / 2.0, y, "MOCK ELECTION — PRACTICE SLIP")
    else:
        c.setFillColor(colors.HexColor("#374151"))
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(width / 2.0, y, "OFFICIAL VOTE RECEIPT — VVPAT")
    y -= 10.5

    # Monospace Slip Box
    slip_box_h = 23.0
    slip_box_y = y - slip_box_h
    c.setFillColor(colors.HexColor("#f9fafb"))
    c.setStrokeColor(colors.HexColor("#d1d5db"))
    c.setLineWidth(0.8)
    c.roundRect(card_x + 8.0, slip_box_y, card_w - 16.0, slip_box_h, 2.0, fill=1, stroke=1)

    c.setFont("Helvetica-Bold", 5.5)
    c.setFillColor(colors.HexColor("#6b7280"))
    c.drawCentredString(width / 2.0, slip_box_y + 14.5, "VOTER SLIP ID")

    c.setFont("Courier-Bold", 10.0)
    c.setFillColor(colors.HexColor("#111827"))
    c.drawCentredString(width / 2.0, slip_box_y + 4.0, str(data.get("slip", "VOTER-SLIP")))
    y = slip_box_y - 8.0

    # Table of Choices
    th_pos = ParagraphStyle("ThP", fontName="Helvetica-Bold", fontSize=6.5, leading=7.5, textColor=colors.HexColor("#374151"))
    th_ch = ParagraphStyle("ThC", fontName="Helvetica-Bold", fontSize=6.5, leading=7.5, textColor=colors.HexColor("#374151"), alignment=2)
    td_pos = ParagraphStyle("TdP", fontName="Helvetica-Bold", fontSize=7.0, leading=8.5, textColor=colors.HexColor("#111827"))
    td_ch = ParagraphStyle("TdC", fontName="Helvetica", fontSize=7.0, leading=8.5, textColor=colors.HexColor("#111827"), alignment=2)

    table_data = [[Paragraph("CONTESTED POSITION", th_pos), Paragraph("SELECTED CHOICE", th_ch)]]
    for row in data.get("lines", []):
        p_txt = Paragraph(str(row.get("position", "")), td_pos)
        choice_val = str(row.get("choice", ""))
        choice_str = f"<b>{choice_val}</b>" if choice_val == "NOTA" else choice_val
        c_txt = Paragraph(choice_str, td_ch)
        table_data.append([p_txt, c_txt])

    col_widths = [(card_w - 16.0) * 0.52, (card_w - 16.0) * 0.48]
    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#9ca3af")),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ("TOPPADDING", (0, 0), (-1, -1), 1.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.6),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.0),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    tw, th = t.wrap(card_w - 16.0, height)
    t.drawOn(c, card_x + 8.0, y - th)
    y -= (th + 6.0)

    # Footer Metadata
    c.setFont("Helvetica", 6.0)
    c.setFillColor(colors.HexColor("#4b5563"))
    c.drawString(card_x + 8.0, y, f"Booth: {data.get('booth', 'BOOTH-01')}")
    c.drawRightString(card_x + card_w - 8.0, y, f"Time: {data.get('time', '')}")
    y -= 9.0

    if is_mock:
        c.setFont("Helvetica-Bold", 5.5)
        c.setFillColor(colors.HexColor("#b45309"))
        c.drawCentredString(width / 2.0, y, "*** PRACTICE BALLOT — NOT AN OFFICIAL VOTE ***")
        y -= 7.5

    c.setFont("Helvetica", 5.5)
    c.setFillColor(colors.HexColor("#6b7280"))
    c.drawCentredString(width / 2.0, y, "Check your choices above, then drop this slip into the box at the booth.")
    y -= 8.0

    card_bottom = y
    card_h = card_top - card_bottom

    # Card border
    c.setStrokeColor(colors.HexColor("#4b5563"))
    c.setLineWidth(1.0)
    c.roundRect(card_x, card_bottom, card_w, card_h, 3.0, fill=0, stroke=1)

    c.showPage()
    c.save()


class ReceiptService:
    @classmethod
    def record_receipt(
        cls,
        election_id: int,
        slip_id: str,
        choices: List[Dict[str, Any]],
        booth_name: str = "Booth",
        is_mock: bool = False,
        institution_name: Optional[str] = None,
        logo_b64: Optional[str] = None,
        election_title: Optional[str] = None,
    ) -> VoteReceipt:
        """Atomically record and persist the receipt on the server (DB, HTML, and PDF)."""
        now = datetime.now(timezone.utc)
        time_str = now.strftime("%Y-%m-%d %H:%M:%S UTC")

        from app.models.system_setting import SystemSetting
        if not logo_b64:
            logo_b64 = SystemSetting.get("logo", "")
        if not institution_name:
            institution_name = SystemSetting.get("institution_name", "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga")

        election = db.session.get(Election, election_id)
        if election and not election_title:
            election_title = election.title

        data = {
            "slip": slip_id,
            "election": election_title or "Campus E-Voting",
            "institution": institution_name or "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga",
            "booth": booth_name or "BOOTH-01",
            "time": time_str,
            "is_mock": is_mock,
            "logo": logo_b64 or "",
            "lines": choices,
        }

        # 1. Generate HTML & PDF
        html_content = generate_receipt_html(data)
        pdf_filename = f"{slip_id}.pdf"
        storage_dir = get_receipt_dir(is_mock)
        pdf_path = os.path.join(storage_dir, pdf_filename)
        html_path = os.path.join(storage_dir, f"{slip_id}.html")

        try:
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(html_content)
            generate_receipt_pdf(data, pdf_path)
        except Exception as e:
            logger.error(f"Failed to write receipt files for slip {slip_id}: {e}", exc_info=True)

        # 2. Database Record
        receipt = VoteReceipt.query.filter_by(slip_id=slip_id).first()
        if not receipt:
            receipt = VoteReceipt(
                slip_id=slip_id,
                election_id=election_id,
                booth_name=booth_name,
                is_mock=is_mock,
                choices_json=json.dumps(choices),
                html_content=html_content,
                pdf_filename=pdf_filename,
                created_at=now,
            )
            db.session.add(receipt)
        else:
            receipt.booth_name = booth_name
            receipt.is_mock = is_mock
            receipt.choices_json = json.dumps(choices)
            receipt.html_content = html_content
            receipt.pdf_filename = pdf_filename
            receipt.created_at = now

        db.session.flush()
        return receipt

    @classmethod
    def get_receipt_pdf_bytes(cls, receipt: VoteReceipt) -> bytes:
        """Read PDF file or generate on the fly if missing."""
        storage_dir = get_receipt_dir(receipt.is_mock)
        pdf_path = os.path.join(storage_dir, receipt.pdf_filename or f"{receipt.slip_id}.pdf")
        if os.path.exists(pdf_path):
            with open(pdf_path, "rb") as f:
                return f.read()

        # Regenerate in memory
        buf = io.BytesIO()
        election_title = receipt.election.title if receipt.election else "Campus E-Voting"
        data = {
            "slip": receipt.slip_id,
            "election": election_title,
            "institution": "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga",
            "booth": receipt.booth_name or "BOOTH-01",
            "time": receipt.created_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "is_mock": receipt.is_mock,
            "lines": receipt.get_choices(),
        }
        generate_receipt_pdf(data, buf)
        buf.seek(0)
        pdf_bytes = buf.getvalue()

        # Cache to disk
        try:
            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)
        except Exception:
            pass

        return pdf_bytes

    @classmethod
    def export_zip(cls, election_id: Optional[int] = None, is_mock: bool = False) -> io.BytesIO:
        """Create a zip archive containing all receipts and a manifest CSV."""
        query = VoteReceipt.query.filter_by(is_mock=is_mock)
        if election_id:
            query = query.filter_by(election_id=election_id)
        receipts = query.order_by(VoteReceipt.created_at.asc()).all()

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # 1. Add Manifest CSV
            csv_buf = io.StringIO()
            writer = csv.writer(csv_buf)
            writer.writerow(["Slip ID", "Booth", "Election", "Time (UTC)", "Status", "Choices"])
            for r in receipts:
                choices_summary = "; ".join([f"{c.get('position')}: {c.get('choice')}" for c in r.get_choices()])
                writer.writerow([
                    r.slip_id,
                    r.booth_name or "Booth",
                    r.election.title if r.election else "",
                    r.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    "Mock Practice" if r.is_mock else "Official Vote",
                    choices_summary,
                ])
            zf.writestr("manifest.csv", csv_buf.getvalue())

            # 2. Add each PDF
            for r in receipts:
                pdf_bytes = cls.get_receipt_pdf_bytes(r)
                fn = f"{r.slip_id}.pdf"
                zf.writestr(fn, pdf_bytes)

        zip_buf.seek(0)
        return zip_buf

    @classmethod
    def clear_mock_receipts(cls, election_id: Optional[int] = None) -> int:
        """Wipe mock election receipts from disk and database."""
        query = VoteReceipt.query.filter_by(is_mock=True)
        if election_id:
            query = query.filter_by(election_id=election_id)
        count = query.count()
        query.delete(synchronize_session=False)
        db.session.commit()

        mock_dir = get_receipt_dir(is_mock=True)
        try:
            for item in os.listdir(mock_dir):
                item_path = os.path.join(mock_dir, item)
                if os.path.isfile(item_path):
                    os.unlink(item_path)
        except Exception as e:
            logger.warn(f"Could not clear all mock files from {mock_dir}: {e}")

        return count
