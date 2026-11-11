"""
app/services/receipt_service.py — Centralized Server-Side Receipt Storage and Audit Service.

Generates and persists voter receipts (1-column half-A4 PDF and HTML) directly on the server,
organizes them into live and mock directories, and provides officer audit, view, and bulk ZIP export.
"""

import base64
import csv
import io
import json
import logging
import os
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from flask import current_app
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

from app.extensions import db
from app.models.election import Election
from app.models.vote_receipt import VoteReceipt
from app.services.default_logo import DEFAULT_LOGO

logger = logging.getLogger(__name__)


def get_receipt_base_dir() -> str:
    """Resolve a writable base directory for receipts."""
    env_dir = os.environ.get("RECEIPTS_DIR")
    if env_dir:
        try:
            os.makedirs(env_dir, exist_ok=True)
            return env_dir
        except (OSError, PermissionError):
            pass

    # Inside Docker container
    docker_dir = "/app/data/receipts"
    try:
        os.makedirs(docker_dir, exist_ok=True)
        return docker_dir
    except (OSError, PermissionError):
        pass

    # Local workspace data folder
    project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data", "receipts"))
    try:
        os.makedirs(project_dir, exist_ok=True)
        return project_dir
    except (OSError, PermissionError):
        pass

    # System temp directory
    temp_dir = os.path.join(tempfile.gettempdir(), "evote_receipts")
    try:
        os.makedirs(temp_dir, exist_ok=True)
        return temp_dir
    except (OSError, PermissionError):
        return tempfile.gettempdir()


def get_receipt_dir(is_mock: bool = False) -> str:
    """Store all receipts (live and mock) in one central directory."""
    d = get_receipt_base_dir()
    try:
        os.makedirs(d, exist_ok=True)
    except (OSError, PermissionError):
        pass
    return d


def esc(s: Any) -> str:
    """HTML escape helper."""
    text = str(s or "")
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def generate_receipt_html(data: Dict[str, Any]) -> str:
    """
    Generate self-contained HTML for in-browser preview matching booth-app/lib/receipt.js 100%.
    Laid out at 125mm card width centered for clear, beautiful display and half-A4 paper tear off.
    """
    slip = esc(data.get("slip", ""))
    election_title = esc(data.get("election", "Students' Union Election"))
    institution = esc(data.get("institution", "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga"))
    booth = esc(data.get("booth", "BOOTH-01"))
    time_str = esc(data.get("time", ""))
    is_mock = bool(data.get("is_mock"))
    lines = data.get("lines", [])

    rows_html = "".join([
        f'<tr><td class="p">{esc(row.get("position", ""))}</td><td class="c">{esc(row.get("choice", ""))}</td></tr>'
        for row in lines
    ])

    active_logo = data.get("logo") or DEFAULT_LOGO or ""
    logo_html = f'<img class="logo" src="{active_logo}" alt="College Logo" />' if active_logo else ""

    border_color = "#0f172a"
    dash_color = "#64748b"
    hdr_bg = "#fafafa"
    title_color = "#0f172a"
    sub_color = "#334155"
    badge_bg = "#ffffff"
    badge_border = "#0f172a"
    badge_text = "#0f172a"
    badge_label = "OFFICIAL VOTE RECEIPT - VVPAT"
    banner_dash = "#94a3b8"
    th_bg = "#f1f5f9"
    th_border = "#cbd5e1"
    th_text = "#475569"

    footer_content = '<p class="info">Check your choices above, then fold this slip and drop it into the box at the booth.</p>'

    return f"""<!doctype html><html><head><meta charset="utf-8"><title>Vote copy {slip}</title><style>
    @page {{ size: A4 portrait; margin: 0; }}
    html, body {{
      width: 100%;
      margin: 0;
      padding: 0;
      background: transparent;
      color: #0f172a;
      display: flex;
      justify-content: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}
    @media print {{
      html, body {{ background: #ffffff !important; }}
      .card {{ box-shadow: none !important; }}
    }}
    .page-wrap {{
      width: 100%;
      margin: 0 auto;
      padding: 4mm 0 8mm;
      box-sizing: border-box;
      text-align: center;
    }}
    .card {{
      width: 125mm;
      max-width: 100%;
      margin: 0 auto;
      display: block;
      text-align: left;
      border: 1.5px solid {border_color};
      border-radius: 3mm;
      background: #ffffff;
      box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.12);
      overflow: hidden;
      box-sizing: border-box;
    }}
    .hdr {{
      padding: 2.5mm 4mm 2mm;
      text-align: center;
      border-bottom: 1.2px dashed {dash_color};
      background: {hdr_bg};
    }}
    .logo {{
      height: 12mm;
      max-width: 15mm;
      max-height: 12mm;
      object-fit: contain;
      margin: 0 auto 1.5mm;
      display: block;
    }}
    h1 {{
      font-size: 9pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .02em;
      margin: 0;
      line-height: 1.2;
      text-align: center;
      color: {title_color};
    }}
    .sub {{
      font-size: 7.5pt;
      color: {sub_color};
      margin: 0.6mm 0;
      text-align: center;
      font-weight: 500;
    }}
    .badge {{
      display: inline-block;
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: {badge_text};
      border: .8px solid {badge_border};
      background: {badge_bg};
      border-radius: 1mm;
      padding: .2mm 2.5mm;
      margin-top: .4mm;
      text-align: center;
    }}
    .banner {{
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1.5mm 4mm;
      border-bottom: 1px dashed {banner_dash};
      background: #ffffff;
      font-size: 7pt;
    }}
    .banner .slip {{
      text-align: center;
    }}
    .banner .slip-lbl {{
      font-size: 5.5pt;
      text-transform: uppercase;
      letter-spacing: .12em;
      color: #64748b;
      font-weight: 700;
      display: block;
    }}
    .banner .slip-id {{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11pt;
      font-weight: 800;
      letter-spacing: .08em;
      color: #0f172a;
    }}
    .table-wrap {{
      width: 100%;
      background: #ffffff;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 7.8pt;
    }}
    th {{
      background: {th_bg};
      padding: 1mm 4mm;
      font-size: 6.5pt;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: {th_text};
      border-bottom: 1px solid {th_border};
    }}
    th.p {{ text-align: left; }}
    th.c {{ text-align: right; }}
    td {{
      padding: 1.1mm 4mm;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      line-height: 1.2;
    }}
    tr:last-child td {{ border-bottom: 0; }}
    .p {{ color: #334155; font-weight: 500; }}
    .c {{ text-align: right; font-weight: 700; color: #0f172a; }}
    .ftr {{
      padding: 1.5mm 4mm;
      border-top: 1.2px dashed {dash_color};
      background: {hdr_bg};
      text-align: center;
    }}
    .info {{
      font-size: 5.5pt;
      color: {sub_color};
      margin: 0;
      text-align: center;
      line-height: 1.25;
    }}
    .mock-warning {{
      font-weight: 800;
      letter-spacing: .05em;
      display: block;
      margin-bottom: .3mm;
    }}
  </style></head><body>
    <div class="page-wrap">
      <div class="card">
        <div class="hdr">
          {logo_html}
          <h1>{institution}</h1>
          <div class="sub">{election_title}</div>
          <div class="badge">{badge_label}</div>
        </div>
        <div class="banner">
          <div class="slip">
            <span class="slip-lbl">BALLOT REF</span>
            <span class="slip-id">{slip}</span>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th class="p">Contested Position</th><th class="c">Selected Choice</th></tr>
            </thead>
            <tbody>{rows_html}</tbody>
          </table>
        </div>
        <div class="ftr">
          {footer_content}
        </div>
      </div>
    </div>
  </body></html>"""


def generate_receipt_pdf(data: Dict[str, Any], output_target) -> None:
    """
    Generate pixel-perfect half-A4 vector PDF strictly in the top half of A4 page,
    matching the 125mm single-column receipt card layout exactly.
    """
    c = canvas.Canvas(output_target, pagesize=A4)
    width, height = A4

    card_w = 354.33  # 125mm
    card_x = (width - card_w) / 2.0
    top_margin = 17.0  # ~6mm from top
    card_top = height - top_margin

    is_mock = bool(data.get("is_mock"))
    card_border_color = colors.HexColor("#0f172a")
    dash_color = colors.HexColor("#64748b")
    hdr_bg_color = colors.HexColor("#fafafa")
    title_color = colors.HexColor("#0f172a")
    sub_color = colors.HexColor("#334155")
    badge_bg = colors.HexColor("#ffffff")
    badge_border = colors.HexColor("#0f172a")
    badge_text = colors.HexColor("#0f172a")
    badge_label = "OFFICIAL VOTE RECEIPT - VVPAT"

    # Running Y tracking
    y = card_top - 6.0

    # 1. Header with Logo, College Name, Subtitle, Badge
    logo_data = data.get("logo") or DEFAULT_LOGO or ""
    if logo_data and "base64," in logo_data:
        try:
            b64_bytes = base64.b64decode(logo_data.split("base64,")[1])
            img_r = ImageReader(io.BytesIO(b64_bytes))
            logo_w = 34.0
            logo_h = 32.0
            c.drawImage(img_r, (width - logo_w) / 2.0, y - logo_h, width=logo_w, height=logo_h, preserveAspectRatio=True, mask="auto")
            y -= (logo_h + 3.0)
        except Exception as e:
            logger.warning(f"Failed to embed logo in vector PDF: {e}")

    inst = str(data.get("institution", "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga"))
    c.setFont("Helvetica-Bold", 8.8)
    c.setFillColor(title_color)
    c.drawCentredString(width / 2.0, y, inst[:68].upper())
    y -= 10.0

    elec = str(data.get("election", "Students' Union Election"))
    c.setFont("Helvetica", 7.2)
    c.setFillColor(sub_color)
    c.drawCentredString(width / 2.0, y, elec[:70])
    y -= 10.0

    # Badge pill
    badge_w = 125.0
    badge_h = 9.5
    c.setFillColor(badge_bg)
    c.setStrokeColor(badge_border)
    c.setLineWidth(0.7)
    c.roundRect((width - badge_w) / 2.0, y - badge_h + 2.0, badge_w, badge_h, 2.5, fill=1, stroke=1)
    c.setFont("Helvetica-Bold", 5.8)
    c.setFillColor(badge_text)
    c.drawCentredString(width / 2.0, y - badge_h + 4.5, badge_label)
    y -= (badge_h + 4.0)

    # Header bottom dashed divider
    c.setStrokeColor(dash_color)
    c.setLineWidth(0.8)
    c.setDash(2, 2)
    c.line(card_x, y, card_x + card_w, y)
    c.setDash([])  # Reset dash
    y -= 4.0

    # 2. Centered Anonymous Banner: Monospace Slip ID
    banner_y = y - 14.0
    c.setFont("Helvetica-Bold", 5.2)
    c.setFillColor(colors.HexColor("#64748b"))
    c.drawCentredString(width / 2.0, banner_y + 11.0, "BALLOT REF")
    c.setFont("Courier-Bold", 10.5)
    c.setFillColor(colors.HexColor("#0f172a"))
    c.drawCentredString(width / 2.0, banner_y + 1.0, str(data.get("slip", "VOTER-SLIP")))
    y = banner_y - 4.0

    # Banner bottom dashed divider
    banner_dash_color = colors.HexColor("#94a3b8")
    c.setStrokeColor(banner_dash_color)
    c.setLineWidth(0.7)
    c.setDash(2, 2)
    c.line(card_x, y, card_x + card_w, y)
    c.setDash([])
    y -= 2.0

    # 3. Table of Choices
    th_bg_color = colors.HexColor("#f1f5f9")
    th_border_color = colors.HexColor("#cbd5e1")
    th_text_color = colors.HexColor("#475569")

    th_pos = ParagraphStyle("ThP", fontName="Helvetica-Bold", fontSize=6.5, leading=7.5, textColor=th_text_color)
    th_ch = ParagraphStyle("ThC", fontName="Helvetica-Bold", fontSize=6.5, leading=7.5, textColor=th_text_color, alignment=2)
    td_pos = ParagraphStyle("TdP", fontName="Helvetica", fontSize=7.0, leading=8.5, textColor=colors.HexColor("#334155"))
    td_ch = ParagraphStyle("TdC", fontName="Helvetica-Bold", fontSize=7.0, leading=8.5, textColor=colors.HexColor("#0f172a"), alignment=2)

    def _clean_pdf_text(val: Any) -> str:
        s = str(val or "")
        return (
            s.replace("\u2019", "'")
            .replace("\u2018", "'")
            .replace("\u201c", '"')
            .replace("\u201d", '"')
            .replace("\u2013", "-")
            .replace("\u2014", "-")
            .replace("\u00b7", "-")
        )

    table_data = [[Paragraph("CONTESTED POSITION", th_pos), Paragraph("SELECTED CHOICE", th_ch)]]
    for row in data.get("lines", []):
        p_txt = Paragraph(_clean_pdf_text(row.get("position", "")), td_pos)
        choice_val = _clean_pdf_text(row.get("choice", ""))
        c_txt = Paragraph(choice_val, td_ch)
        table_data.append([p_txt, c_txt])

    col_widths = [card_w * 0.52, card_w * 0.48]
    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), th_bg_color),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, th_border_color),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, colors.HexColor("#f1f5f9")),
        ("TOPPADDING", (0, 0), (-1, -1), 1.8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10.0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10.0),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    tw, th = t.wrap(card_w, height)
    t.drawOn(c, card_x, y - th)
    y -= (th + 3.0)

    # 4. Footer
    c.setStrokeColor(dash_color)
    c.setLineWidth(0.8)
    c.setDash(2, 2)
    c.line(card_x, y, card_x + card_w, y)
    c.setDash([])
    y -= 7.0

    c.setFont("Helvetica", 5.5)
    c.setFillColor(colors.HexColor("#64748b"))
    c.drawCentredString(width / 2.0, y, "Check your choices above, then fold this slip and drop it into the box at the booth.")
    y -= 6.0

    card_bottom = y
    card_h = card_top - card_bottom

    # 5. Draw the Outer Card Border (rounded rect)
    c.setStrokeColor(card_border_color)
    c.setLineWidth(1.4)
    c.roundRect(card_x, card_bottom, card_w, card_h, 8.5, fill=0, stroke=1)

    c.showPage()
    c.save()


class ReceiptService:
    @classmethod
    def record_receipt(
        cls,
        election_id: int,
        slip_id: str,
        choices: List[Dict[str, Any]],
        booth_name: str = "BOOTH-01",
        is_mock: bool = False,
        institution_name: Optional[str] = None,
        logo_b64: Optional[str] = None,
        election_title: Optional[str] = None,
    ) -> VoteReceipt:
        """Atomically record and persist the receipt on the server (DB, HTML, and vector PDF)."""
        now = datetime.now(timezone.utc)
        time_str = now.strftime("%Y-%m-%d %H:%M:%S UTC")

        from app.models.system_setting import SystemSetting
        if not logo_b64:
            logo_b64 = SystemSetting.get("logo", "") or DEFAULT_LOGO
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
            "logo": logo_b64 or DEFAULT_LOGO,
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
        except Exception as e:
            logger.warning(f"Failed to write receipt html for slip {slip_id}: {e}")

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
    def create_receipt(
        cls,
        slip_id: str,
        booth_name: str,
        election_id: int,
        election_title: str,
        institution_name: str,
        choices: List[Dict[str, Any]],
        is_mock: bool = False,
        logo_b64: Optional[str] = None,
        db_session: Any = None,
    ) -> VoteReceipt:
        """Compatibility wrapper that standardizes choice fields and delegates to record_receipt."""
        clean_choices = []
        for c in choices:
            choice_text = c.get("choice") or c.get("candidate_name")
            if not choice_text:
                choice_text = "None of the Above (NOTA)" if c.get("is_nota") else "Candidate"
            clean_choices.append({
                "position": c.get("position", ""),
                "choice": choice_text,
                "is_nota": bool(c.get("is_nota")),
            })
        return cls.record_receipt(
            election_id=election_id,
            slip_id=slip_id,
            choices=clean_choices,
            booth_name=booth_name,
            is_mock=is_mock,
            institution_name=institution_name,
            logo_b64=logo_b64,
            election_title=election_title,
        )

    @classmethod
    def get_receipt_pdf_bytes(cls, receipt: VoteReceipt) -> bytes:
        """Serve cached PDF from disk when available, otherwise generate and cache."""
        storage_dir = get_receipt_dir(receipt.is_mock)
        pdf_path = os.path.join(storage_dir, f"{receipt.slip_id}.pdf")
        if os.path.isfile(pdf_path):
            try:
                with open(pdf_path, "rb") as f:
                    return f.read()
            except Exception:
                pass

        buf = io.BytesIO()
        election_title = receipt.election.title if receipt.election else "Campus E-Voting"
        from app.models.system_setting import SystemSetting
        branding = SystemSetting.branding()

        data = {
            "slip": receipt.slip_id,
            "election": election_title,
            "institution": branding.get("institution_name") or "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga",
            "booth": receipt.booth_name or "BOOTH-01",
            "time": receipt.created_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "is_mock": receipt.is_mock,
            "logo": branding.get("logo") or DEFAULT_LOGO,
            "lines": receipt.get_choices(),
        }
        generate_receipt_pdf(data, buf)
        buf.seek(0)
        pdf_bytes = buf.getvalue()

        # Cache to disk
        try:
            storage_dir = get_receipt_dir(receipt.is_mock)
            pdf_path = os.path.join(storage_dir, f"{receipt.slip_id}.pdf")
            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)
        except Exception:
            pass

        return pdf_bytes

    @classmethod
    def export_zip(cls, election_id: Optional[int] = None, is_mock: Optional[bool] = None) -> io.BytesIO:
        """Create a zip archive containing receipts and a manifest CSV."""
        query = VoteReceipt.query
        if is_mock is not None:
            query = query.filter_by(is_mock=is_mock)
        if election_id:
            query = query.filter_by(election_id=election_id)
        receipts = query.order_by(VoteReceipt.slip_id.asc()).all()

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
                    r.booth_name or "BOOTH-01",
                    r.election.title if r.election else "",
                    r.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    "Mock Election" if r.is_mock else "Official Vote",
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
        """Wipe mock election receipts from disk and database so count clears to 0."""
        query = VoteReceipt.query.filter_by(is_mock=True)
        if election_id:
            query = query.filter_by(election_id=election_id)
        receipts = query.all()
        count = len(receipts)

        storage_dir = get_receipt_base_dir()
        if os.path.exists(storage_dir):
            targets = set()
            for r in receipts:
                targets.add(f"{r.slip_id}.pdf")
                targets.add(f"{r.slip_id}.html")
                if r.pdf_filename:
                    targets.add(r.pdf_filename)
                db.session.delete(r)

            if targets:
                for root, _, files in os.walk(storage_dir):
                    for f in files:
                        if f in targets:
                            try:
                                os.unlink(os.path.join(root, f))
                            except Exception:
                                pass
        else:
            for r in receipts:
                db.session.delete(r)
        db.session.commit()

        try:
            from app.models.audit_log import AuditLog
            db.session.add(AuditLog(
                action="MOCK_RECEIPTS_CLEARED",
                details=f"Cleared mock election receipts archive ({count} records wiped).",
            ))
            db.session.commit()
        except Exception:
            pass

        return count
