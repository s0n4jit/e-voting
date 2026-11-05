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
      * Voter Slip ID (e.g. "SUE26-E1-1001")
      * 4-Digit Voting PIN (e.g. "4   8   2   9")
      * Official voter instruction footer.
  - Strictly no personal identifying data or internal architecture disclosures.
"""

import io
import base64
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

        # 4 slips per page: 2 columns x 2 rows
        cols = 2
        rows = 2
        margin_x = 32.0
        gutter_x = 18.0
        gutter_y = 20.0
        slip_w = (page_w - (margin_x * 2) - (gutter_x * (cols - 1))) / cols  # ~248.6 pt
        slip_h = 320.0
        total_grid_h = rows * slip_h + (rows - 1) * gutter_y
        start_y = (page_h - total_grid_h) / 2.0

        slips_per_page = cols * rows

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
                img_reader=img_reader,
            )

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

        card_w = 260.0
        card_h = 330.0
        card_x = (page_w - card_w) / 2.0
        card_y = (page_h - card_h) / 2.0

        cls._draw_single_slip(
            c=c,
            x=card_x,
            y=card_y,
            w=card_w,
            h=card_h,
            slip=slip,
            election_title=election_title,
            institution_name=institution_name,
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
        img_reader: Optional[ImageReader] = None,
    ):
        """Draws one individual voter slip card matching the classic reference slips layout."""
        # 1. Outer rounded border: slate-400
        c.saveState()
        c.setStrokeColor(colors.HexColor("#94a3b8"))
        c.setLineWidth(0.8)
        c.roundRect(x, y, w, h, 8, fill=0, stroke=1)
        c.restoreState()

        # 2. Header: Logo on left, Institution & Election on right
        logo_size = 36.0
        logo_x = x + 12.0
        logo_y = y + h - logo_size - 13.0

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
                text_left = logo_x + logo_size + 8.0
            except Exception:
                text_left = x + 12.0
        else:
            text_left = x + 12.0

        # Institution name (up to 2 lines)
        c.saveState()
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Helvetica-Bold", 8.8)

        name_parts = [p.strip() for p in institution_name.split(",") if p.strip()]
        if len(name_parts) >= 2:
            line1 = name_parts[0]
            line2 = ", ".join(name_parts[1:])
        elif len(institution_name) > 34:
            words = institution_name.split()
            mid = len(words) // 2
            line1 = " ".join(words[:mid])
            line2 = " ".join(words[mid:])
        else:
            line1 = institution_name
            line2 = ""

        if line2:
            c.drawString(text_left, y + h - 21.0, line1)
            c.drawString(text_left, y + h - 32.0, line2)
        else:
            c.drawString(text_left, y + h - 26.0, line1)

        c.setFillColor(colors.HexColor("#475569"))
        c.setFont("Helvetica", 7.8)
        elec_display = election_title[:46] + ("…" if len(election_title) > 46 else "")
        c.drawString(text_left, y + h - 45.0, elec_display)
        c.restoreState()

        # Header dividing dashed line
        c.saveState()
        c.setStrokeColor(colors.HexColor("#94a3b8"))
        c.setLineWidth(0.6)
        c.setDash([3, 3], 0)
        c.line(x, y + h - 58.0, x + w, y + h - 58.0)
        c.restoreState()

        # 3. Optional Booth badge
        content_top = y + h - 68.0
        if slip.booth_number:
            badge_w = 110.0
            badge_h = 13.0
            badge_x = x + (w - badge_w) / 2.0
            badge_y = content_top - badge_h

            c.saveState()
            c.setFillColor(colors.HexColor("#f1f5f9"))
            c.setStrokeColor(colors.HexColor("#cbd5e1"))
            c.roundRect(badge_x, badge_y, badge_w, badge_h, 3, fill=1, stroke=1)
            c.setFillColor(colors.HexColor("#334155"))
            c.setFont("Helvetica-Bold", 6.8)
            c.drawCentredString(x + w / 2.0, badge_y + 3.5, f"BOOTH-{str(slip.booth_number).zfill(2)}")
            c.restoreState()
            id_header_y = badge_y - 18.0
        else:
            id_header_y = content_top - 12.0

        # 4. Voter Slip ID Section
        c.saveState()
        c.setFillColor(colors.HexColor("#64748b"))
        c.setFont("Helvetica-Bold", 7.5)
        c.drawCentredString(x + w / 2.0, id_header_y, "VOTER SLIP ID")

        # Monospace formatted ID: SUE26-E1-1001
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Courier-Bold", 17.0)
        c.drawCentredString(x + w / 2.0, id_header_y - 20.0, str(slip.voting_id))
        c.restoreState()

        # 5. 4-Digit Voting PIN Section
        pin_header_y = id_header_y - 52.0
        c.saveState()
        c.setFillColor(colors.HexColor("#64748b"))
        c.setFont("Helvetica-Bold", 7.5)
        c.drawCentredString(x + w / 2.0, pin_header_y, "VOTING PIN")

        pin_val = getattr(slip, "raw_pin", None) or slip.reveal_pin() or "••••"
        spaced_pin = "   ".join(list(str(pin_val)))
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Courier-Bold", 22.0)
        c.drawCentredString(x + w / 2.0, pin_header_y - 25.0, spaced_pin)
        c.restoreState()

        # 6. Dashed divider above footer
        c.saveState()
        c.setStrokeColor(colors.HexColor("#94a3b8"))
        c.setLineWidth(0.6)
        c.setDash([3, 3], 0)
        c.line(x, y + 42.0, x + w, y + 42.0)
        c.restoreState()

        # 7. Official Voter Instruction Footer
        c.saveState()
        c.setFillColor(colors.HexColor("#475569"))
        c.setFont("Helvetica", 7.2)
        c.drawCentredString(x + w / 2.0, y + 25.0, "Keep this slip and the PIN secret. At the voting booth,")
        c.drawCentredString(x + w / 2.0, y + 14.0, "enter the slip ID and this PIN to vote once.")
        c.restoreState()
