"""
app/services/slip_pdf_service.py — Printable A4 PDF Voting Slips Generator.

Generates clean, professional, high-contrast, print-friendly A4 voting slip sheets:
  - 8 slips per A4 page (2 columns x 4 rows) for bulk printing.
  - Dedicated single-slip PDF rendering for individual download.
  - Features the official college logo branding on the header.
  - Displays:
      * Institution Logo & College Name
      * Election Name
      * Booth Badge (e.g. "OFFICIAL VOTING SLIP • BOOTH 1")
      * Voter Slip ID (e.g. "SUE26-E1-1001")
      * 4-Digit Voting PIN (e.g. "4  8  2  9")
  - Strictly no voter names, roll numbers, or personal identifying data.
  - Clear scissor / cut dashed guidelines between slips.
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
        Renders a list of BoothSlip instances onto printable A4 sheets (8 slips per page).
        Returns the raw PDF bytes.
        """
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        page_w, page_h = A4  # 595.27 x 841.89 points

        if not institution_name:
            institution_name = SystemSetting.get("institution_name", "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya")
        election_title = election.title if election else "General Campus Election"
        img_reader = cls._get_logo_image(logo_b64)

        # Grid configuration: 2 columns x 4 rows = 8 slips per page
        margin_x = 22.0
        margin_y = 22.0
        gutter_x = 12.0
        gutter_y = 10.0
        cols = 2
        rows = 4

        slip_w = (page_w - (margin_x * 2) - (gutter_x * (cols - 1))) / cols  # ~269.6 pt
        slip_h = (page_h - (margin_y * 2) - (gutter_y * (rows - 1))) / rows  # ~192.0 pt

        slips_per_page = cols * rows

        for idx, slip in enumerate(slips):
            slot_idx = idx % slips_per_page

            # New page after every 8 slips
            if slot_idx == 0 and idx > 0:
                c.showPage()

            col = slot_idx % cols
            row = slot_idx // cols  # 0 at top, 3 at bottom

            # ReportLab origin (0,0) is bottom-left
            x = margin_x + col * (slip_w + gutter_x)
            y = page_h - margin_y - (row + 1) * slip_h - row * gutter_y

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
        Renders a single individual voter slip sheet centered on an A4 page with cutting guide.
        """
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=A4)
        page_w, page_h = A4

        if not institution_name:
            institution_name = SystemSetting.get("institution_name", "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya")
        election_title = election.title if election else (slip.election.title if slip.election else "General Campus Election")
        img_reader = cls._get_logo_image(logo_b64)

        # Center a large, crisp slip card (320 pt x 220 pt)
        card_w = 320.0
        card_h = 220.0
        card_x = (page_w - card_w) / 2.0
        card_y = (page_h - card_h) / 2.0

        # Draw page heading
        c.saveState()
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.HexColor("#0f172a"))
        c.drawCentredString(page_w / 2.0, card_y + card_h + 35, "OFFICIAL VOTER CREDENTIAL SLIP")
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#64748b"))
        c.drawCentredString(page_w / 2.0, card_y + card_h + 22, "Cut along the dashed lines below and present to the voter.")
        c.restoreState()

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
        """Draws one individual voter slip within (x, y, w, h)."""
        # 1. Outer cutting border (dashed slate border with scissors cue)
        c.saveState()
        c.setStrokeColor(colors.HexColor("#94a3b8"))
        c.setLineWidth(0.8)
        c.setDash([3, 3], 0)
        c.roundRect(x, y, w, h, 6, fill=0, stroke=1)
        c.restoreState()

        # Inner slip card content
        inner_pad = 7.0
        ix = x + inner_pad
        iy = y + inner_pad
        iw = w - (inner_pad * 2)
        ih = h - (inner_pad * 2)

        # 2. Header: College Logo on left + Institution & Election on right
        header_h = 32.0
        header_y = iy + ih - header_h

        logo_size = 26.0
        logo_x = ix + 4.0
        logo_y = header_y + (header_h - logo_size) / 2.0

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
                text_left = ix + 6.0
        else:
            text_left = ix + 6.0

        # Institution Name & Election Subtitle
        c.saveState()
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Helvetica-Bold", 7.5)
        inst_display = institution_name[:42] + ("…" if len(institution_name) > 42 else "")
        c.drawString(text_left, header_y + 18, inst_display)

        c.setFillColor(colors.HexColor("#475569"))
        c.setFont("Helvetica", 6.5)
        elec_display = election_title[:45] + ("…" if len(election_title) > 45 else "")
        c.drawString(text_left, header_y + 7, elec_display)
        c.restoreState()

        # Header dividing dashed line
        c.saveState()
        c.setStrokeColor(colors.HexColor("#cbd5e1"))
        c.setLineWidth(0.6)
        c.setDash([2, 2], 0)
        c.line(ix + 2, header_y - 2, ix + iw - 2, header_y - 2)
        c.restoreState()

        # 3. Booth Machine Pill Badge
        badge_h = 13.0
        badge_y = header_y - 18.0
        badge_w = min(150.0, iw - 16.0)
        badge_x = ix + (iw - badge_w) / 2.0

        c.saveState()
        c.setFillColor(colors.HexColor("#2563eb"))  # Brand blue
        c.roundRect(badge_x, badge_y, badge_w, badge_h, 3, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 7.0)
        booth_label = (
            f"OFFICIAL VOTING SLIP  •  BOOTH {slip.booth_number}"
            if slip.booth_number
            else "OFFICIAL VOTING SLIP  •  UNASSIGNED"
        )
        c.drawCentredString(ix + iw / 2.0, badge_y + 3.5, booth_label)
        c.restoreState()

        # 4. Voter Slip ID Section (Full width box for long formatted ID like SUE26-E1-1001)
        id_box_h = 32.0
        id_box_y = badge_y - id_box_h - 4.0

        c.saveState()
        c.setFillColor(colors.HexColor("#f8fafc"))
        c.setStrokeColor(colors.HexColor("#e2e8f0"))
        c.setLineWidth(0.8)
        c.roundRect(ix + 4, id_box_y, iw - 8, id_box_h, 4, fill=1, stroke=1)

        c.setFillColor(colors.HexColor("#64748b"))
        c.setFont("Helvetica-Bold", 6.0)
        c.drawCentredString(ix + iw / 2.0, id_box_y + id_box_h - 9, "VOTER SLIP ID")

        # Monospace formatted ID: SUE26-E1-1001
        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Courier-Bold", 12.0)
        c.drawCentredString(ix + iw / 2.0, id_box_y + 7, str(slip.voting_id))
        c.restoreState()

        # 5. 4-Digit Voting PIN Section
        pin_box_h = 38.0
        pin_box_y = id_box_y - pin_box_h - 5.0

        c.saveState()
        c.setFillColor(colors.HexColor("#eff6ff"))  # Soft blue
        c.setStrokeColor(colors.HexColor("#3b82f6"))  # Blue outline
        c.setLineWidth(1.0)
        c.roundRect(ix + 4, pin_box_y, iw - 8, pin_box_h, 4, fill=1, stroke=1)

        c.setFillColor(colors.HexColor("#1d4ed8"))
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(ix + iw / 2.0, pin_box_y + pin_box_h - 10, "4-DIGIT VOTING PIN")

        # Reveal PIN
        pin_val = getattr(slip, "raw_pin", None) or slip.reveal_pin() or "••••"
        spaced_pin = "   ".join(list(str(pin_val)))
        c.setFillColor(colors.HexColor("#1e3a8a"))
        c.setFont("Courier-Bold", 16.0)
        c.drawCentredString(ix + iw / 2.0, pin_box_y + 8, spaced_pin)
        c.restoreState()

        # 6. Instructions / Security Footer
        footer_y = iy + 3.0
        c.saveState()
        c.setFillColor(colors.HexColor("#334155"))
        c.setFont("Helvetica-Bold", 6.0)
        inst_text = (
            f"Walk to Booth {slip.booth_number} and enter your 4-digit PIN."
            if slip.booth_number
            else "Walk to your assigned booth and enter your 4-digit PIN."
        )
        c.drawCentredString(ix + iw / 2.0, footer_y + 10, inst_text)

        c.setFont("Helvetica", 5.2)
        c.setFillColor(colors.HexColor("#64748b"))
        c.drawCentredString(
            ix + iw / 2.0,
            footer_y + 2,
            "Secret Ballot: No voter identity is linked to this slip. Destroy after voting.",
        )
        c.restoreState()
