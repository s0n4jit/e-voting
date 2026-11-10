"""
app/services/slip_pdf_service.py — Printable A4 PDF Voting Slips Generator.

Generates clean, professional, high-contrast, print-friendly A4 voting slip sheets
matching the classic official slips layout:
  - 4 slips per A4 page (2 columns x 2 rows) matching the reference layout.
  - Dedicated single-slip PDF rendering for individual download.
  - Features the official college logo branding on the header.
  - Displays:
      * Institution Logo & College Name
      * Election Name
      * Optional Booth Indicator (e.g. "VOTING BOOTH 1")
      * Voter Slip ID (e.g. "SUE26-B1-1001")
      * 4-Digit Voting PIN (e.g. "4   8   2   9")
      * Official voter instruction footer.
  - Strictly no personal identifying data or internal architecture disclosures.
"""

import io
import base64
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import List, Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from app.models.booth_slip import BoothSlip
from app.models.election import Election
from app.models.system_setting import SystemSetting
from app.services.default_logo import DEFAULT_LOGO


class SlipPdfService:
    @classmethod
    def _format_election_schedule(cls, election: Optional[Election]) -> tuple[str, str]:
        """Returns (voting_date, voting_time) formatted in the configured system timezone."""
        if not election:
            return "", ""
        st = getattr(election, "start_time", None)
        et = getattr(election, "end_time", None)
        if not st:
            return "", ""

        tz_name = SystemSetting.get("timezone", "Asia/Kolkata") or "Asia/Kolkata"
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")

        def to_local(dt):
            if not dt:
                return None
            if not dt.tzinfo:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(tz)

        try:
            st_loc = to_local(st)
            voting_date = st_loc.strftime("%d %b %Y")
            s_str = st_loc.strftime("%I:%M %p").lstrip("0")
            if et:
                et_loc = to_local(et)
                e_str = et_loc.strftime("%I:%M %p").lstrip("0")
                voting_time = f"{s_str} – {e_str}"
            else:
                voting_time = s_str
            return voting_date, voting_time
        except Exception:
            return st.strftime("%d %b %Y"), ""

    @classmethod
    def _get_logo_image(cls, logo_b64: Optional[str] = None) -> Optional[ImageReader]:
        """Safely loads the institution logo as an ImageReader instance."""
        logo_data = logo_b64 or SystemSetting.get("logo", "") or DEFAULT_LOGO or ""
        if not logo_data:
            return None
        try:
            raw_b64 = logo_data.split("base64,")[1] if "base64," in logo_data else logo_data
            img_bytes = base64.b64decode(raw_b64)
            return ImageReader(io.BytesIO(img_bytes))
        except Exception:
            return None

    @classmethod
    def generate_slips_pdf(
        cls,
        slips: List[BoothSlip],
        election: Optional[Election] = None,
        institution_name: Optional[str] = None,
        logo_b64: Optional[str] = None,
    ) -> bytes:
        """
        Renders a list of BoothSlip instances onto printable A4 sheets (4 slips per page).
        Returns the raw PDF bytes.
        """
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        page_w, page_h = A4  # 595.27 x 841.89 points

        if not institution_name:
            institution_name = SystemSetting.get(
                "institution_name", "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga"
            )
        election_title = election.title if election else "Students' Union Election 2026-27 (test)"
        img_reader = cls._get_logo_image(logo_b64)

        # 6 slips per page: 2 columns x 3 rows
        cols = 2
        rows = 3
        margin_x = 22.0
        gutter_x = 14.0
        gutter_y = 12.0
        slip_w = (page_w - (margin_x * 2) - (gutter_x * (cols - 1))) / cols  # ~268.6 pt
        slip_h = 258.0
        total_grid_h = rows * slip_h + (rows - 1) * gutter_y
        start_y = (page_h - total_grid_h) / 2.0

        slips_per_page = cols * rows

        el = election or (slips[0].election if slips and hasattr(slips[0], "election") else None)
        voting_date, voting_time = cls._format_election_schedule(el)
        if not voting_date:
            voting_date = datetime.now().strftime("%d %b %Y")

        for idx, slip in enumerate(slips):
            slot_idx = idx % slips_per_page

            if slot_idx == 0 and idx > 0:
                c.showPage()

            col = slot_idx % cols
            row = slot_idx // cols

            x = margin_x + col * (slip_w + gutter_x)
            y = page_h - start_y - (row + 1) * slip_h - row * gutter_y

            cls._draw_single_slip(
                c=c,
                x=x,
                y=y,
                w=slip_w,
                h=slip_h,
                slip=slip,
                election_title=election_title,
                institution_name=institution_name,
                voting_date=voting_date,
                voting_time=voting_time,
                img_reader=img_reader,
            )

            # At the end of each page, draw subtle cut guide lines in the gutters
            if slot_idx == slips_per_page - 1 or idx == len(slips) - 1:
                c.saveState()
                c.setStrokeColor(colors.HexColor("#cbd5e1"))
                c.setLineWidth(0.4)
                c.setDash([2.5, 4], 0)
                # Vertical center cut line
                cut_cx = margin_x + slip_w + (gutter_x / 2.0)
                c.line(cut_cx, start_y - 8.0, cut_cx, page_h - start_y + 8.0)
                # Horizontal row cut lines
                for r_idx in range(1, rows):
                    cut_ry = page_h - start_y - (r_idx * slip_h) - (r_idx * gutter_y) + (gutter_y / 2.0)
                    c.line(margin_x - 8.0, cut_ry, page_w - margin_x + 8.0, cut_ry)
                c.restoreState()

        c.save()
        buffer.seek(0)
        return buffer.getvalue()

    @classmethod
    def generate_single_slip_pdf(
        cls,
        slip: BoothSlip,
        election: Optional[Election] = None,
        institution_name: Optional[str] = None,
        logo_b64: Optional[str] = None,
    ) -> bytes:
        """
        Renders a single individual voter slip sheet centered on an A4 page.
        """
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        page_w, page_h = A4

        if not institution_name:
            institution_name = SystemSetting.get(
                "institution_name", "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga"
            )
        election_title = election.title if election else (
            slip.election.title if slip.election else "Students' Union Election 2026-27 (test)"
        )
        img_reader = cls._get_logo_image(logo_b64)

        card_w = 268.5
        card_h = 258.0
        card_x = (page_w - card_w) / 2.0
        card_y = (page_h - card_h) / 2.0

        el = election or getattr(slip, "election", None)
        voting_date, voting_time = cls._format_election_schedule(el)
        if not voting_date:
            voting_date = datetime.now().strftime("%d %b %Y")

        cls._draw_single_slip(
            c=c,
            x=card_x,
            y=card_y,
            w=card_w,
            h=card_h,
            slip=slip,
            election_title=election_title,
            institution_name=institution_name,
            voting_date=voting_date,
            voting_time=voting_time,
            img_reader=img_reader,
        )

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer.getvalue()

    @classmethod
    def _draw_single_slip(
        cls,
        c: canvas.Canvas,
        x: float,
        y: float,
        w: float,
        h: float,
        slip: BoothSlip,
        election_title: str,
        institution_name: str,
        voting_date: str = "",
        voting_time: str = "",
        img_reader: Optional[ImageReader] = None,
    ):
        """Draws one individual voter slip card matching the 6-per-A4 sheet layout."""
        # 1. Outer rounded border: slate-300
        c.saveState()
        c.setStrokeColor(colors.HexColor("#cbd5e1"))
        c.setLineWidth(0.8)
        c.roundRect(x, y, w, h, 6, fill=0, stroke=1)
        c.restoreState()

        # 2. Header: Logo on left, Institution & Election on right
        logo_size = 26.0
        logo_x = x + 8.0
        logo_y = y + h - logo_size - 8.0

        if img_reader:
            try:
                c.saveState()
                c.drawImage(
                    img_reader,
                    logo_x,
                    logo_y,
                    width=logo_size,
                    height=logo_size,
                    preserveAspectRatio=True,
                    mask="auto",
                )
                c.restoreState()
                text_left = logo_x + logo_size + 6.0
            except Exception:
                text_left = x + 10.0
        else:
            text_left = x + 10.0

        # Institution name & Election title formatting (fits full name cleanly)
        c.saveState()
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Helvetica-Bold", 7.0)

        # Smart clean wrap for institution name without ugly truncation
        words = institution_name.split()
        if len(institution_name) > 28 and len(words) > 2:
            mid = len(words) // 2
            line1 = " ".join(words[:mid])
            line2 = " ".join(words[mid:])
        else:
            line1 = institution_name
            line2 = ""

        if line2:
            c.drawString(text_left, y + h - 15.5, line1)
            c.drawString(text_left, y + h - 24.5, line2)
            c.setFont("Helvetica", 6.2)
            c.setFillColor(colors.HexColor("#475569"))
            c.drawString(text_left, y + h - 33.5, election_title[:48])
        else:
            c.drawString(text_left, y + h - 18.0, line1)
            c.setFont("Helvetica", 6.2)
            c.setFillColor(colors.HexColor("#475569"))
            c.drawString(text_left, y + h - 28.0, election_title[:48])
        c.restoreState()

        # Header dividing dashed line
        c.saveState()
        c.setStrokeColor(colors.HexColor("#cbd5e1"))
        c.setLineWidth(0.6)
        c.setDash([2.5, 2.5], 0)
        c.line(x, y + h - 42.0, x + w, y + h - 42.0)
        c.restoreState()

        # 3. Booth badge & Voting Date / Time (informational)
        badge_w = 72.0
        badge_h = 13.0
        badge_x = x + 10.0
        badge_y = y + h - 59.0

        c.saveState()
        c.setFillColor(colors.HexColor("#f1f5f9"))
        c.setStrokeColor(colors.HexColor("#cbd5e1"))
        c.roundRect(badge_x, badge_y, badge_w, badge_h, 3, fill=1, stroke=1)
        c.setFillColor(colors.HexColor("#1e293b"))
        c.setFont("Helvetica-Bold", 6.8)
        booth_str = f"BOOTH-{str(slip.booth_number or 1).zfill(2)}"
        c.drawCentredString(badge_x + badge_w / 2.0, badge_y + 3.5, booth_str)

        # Voting date & informational scheduled time
        if voting_time:
            c.setFillColor(colors.HexColor("#334155"))
            c.setFont("Helvetica-Bold", 6.2)
            c.drawRightString(x + w - 10.0, badge_y + 7.5, f"Date: {voting_date}")
            c.setFont("Helvetica", 5.6)
            c.setFillColor(colors.HexColor("#64748b"))
            c.drawRightString(x + w - 10.0, badge_y - 1.5, f"Time: {voting_time}")
        else:
            c.setFillColor(colors.HexColor("#475569"))
            c.setFont("Helvetica-Bold", 6.8)
            c.drawRightString(x + w - 10.0, badge_y + 3.5, f"Voting Date: {voting_date}")
        c.restoreState()

        # 4. Voter Slip ID Section
        id_top = y + h - 79.0
        c.saveState()
        c.setFillColor(colors.HexColor("#64748b"))
        c.setFont("Helvetica-Bold", 6.8)
        c.drawCentredString(x + w / 2.0, id_top, "VOTER SLIP ID")

        # Monospace formatted ID: SUE26-E3-1001
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Courier-Bold", 15.0)
        c.drawCentredString(x + w / 2.0, id_top - 16.0, str(slip.voting_id))
        c.restoreState()

        # 5. 4-Digit Voting PIN Section
        pin_top = id_top - 44.0
        c.saveState()
        c.setFillColor(colors.HexColor("#64748b"))
        c.setFont("Helvetica-Bold", 6.8)
        c.drawCentredString(x + w / 2.0, pin_top, "VOTING PIN")

        pin_val = getattr(slip, "raw_pin", None) or slip.reveal_pin() or "••••"
        spaced_pin = "   ".join(list(str(pin_val)))
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Courier-Bold", 20.0)
        c.drawCentredString(x + w / 2.0, pin_top - 20.0, spaced_pin)
        c.restoreState()

        # 6. Dashed divider above footer
        c.saveState()
        c.setStrokeColor(colors.HexColor("#cbd5e1"))
        c.setLineWidth(0.6)
        c.setDash([2.5, 2.5], 0)
        c.line(x, y + 36.0, x + w, y + 36.0)
        c.restoreState()

        # 7. Official Voter Instruction Footer
        c.saveState()
        c.setFillColor(colors.HexColor("#475569"))
        c.setFont("Helvetica", 6.8)
        c.drawCentredString(x + w / 2.0, y + 22.0, "Keep this slip and PIN secret. At the voting booth, check that")
        c.drawCentredString(x + w / 2.0, y + 12.0, "the on-screen Slip ID matches this slip, then enter only your Voting PIN.")
        c.restoreState()
