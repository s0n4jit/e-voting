"""
app/services/slip_pdf_service.py — Printable A4 PDF Voting Slips Generator.

Generates clean, professional, high-contrast, print-friendly A4 voting slip sheets:
  - 8 slips per A4 page (2 columns x 4 rows).
  - Clear scissor / cut dashed guidelines between slips.
  - Clearly displays:
      * Election Name & Institution
      * Booth Number (e.g. "BOOTH 1")
      * Sequential Voting ID (e.g. "1001")
      * 4-Digit Voting PIN (e.g. "4829")
  - No voter names, roll numbers, or personal identifying data.
  - Supports generating booth-specific sheets or combined multi-booth sheets.
"""

import io
from typing import List, Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas

from app.models.booth_slip import BoothSlip
from app.models.election import Election
from app.models.system_setting import SystemSetting


class SlipPdfService:
    @classmethod
    def generate_slips_pdf(
        cls,
        slips: List[BoothSlip],
        election: Optional[Election] = None,
        institution_name: Optional[str] = None,
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

        # Grid configuration: 2 columns x 4 rows = 8 slips per page
        margin_x = 24.0
        margin_y = 24.0
        gutter_x = 14.0
        gutter_y = 12.0
        cols = 2
        rows = 4

        slip_w = (page_w - (margin_x * 2) - (gutter_x * (cols - 1))) / cols  # ~266.6 pt
        slip_h = (page_h - (margin_y * 2) - (gutter_y * (rows - 1))) / rows  # ~192.2 pt

        slips_per_page = cols * rows
        total_slips = len(slips)

        for idx, slip in enumerate(slips):
            slot_idx = idx % slips_per_page

            # New page after every 8 slips
            if slot_idx == 0 and idx > 0:
                c.showPage()

            col = slot_idx % cols
            row = slot_idx // cols  # 0 at top, 3 at bottom

            # Calculate coordinates (ReportLab origin (0,0) is bottom-left)
            x = margin_x + col * (slip_w + gutter_x)
            # Row 0 is at top:
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
            )

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
    ):
        """Draws one individual voter slip within (x, y, w, h)."""
        # Outer cutting border (dashed light slate)
        c.saveState()
        c.setStrokeColor(colors.HexColor("#94a3b8"))
        c.setLineWidth(0.8)
        c.setDash([3, 3], 0)
        c.roundRect(x, y, w, h, 6, fill=0, stroke=1)
        c.restoreState()

        # Inner slip card content
        inner_pad = 8.0
        ix = x + inner_pad
        iy = y + inner_pad
        iw = w - (inner_pad * 2)
        ih = h - (inner_pad * 2)

        # Draw Header bar
        header_h = 28.0
        header_y = iy + ih - header_h
        c.saveState()
        c.setFillColor(colors.HexColor("#1e293b"))  # Dark slate header
        c.roundRect(ix, header_y, iw, header_h, 4, fill=1, stroke=0)

        # Header Title
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8)
        # Truncate institution if too long
        inst_text = institution_name[:36] + ("..." if len(institution_name) > 36 else "")
        c.drawCentredString(ix + iw / 2.0, header_y + 16, inst_text.upper())

        c.setFont("Helvetica", 7)
        elec_text = election_title[:40] + ("..." if len(election_title) > 40 else "")
        c.drawCentredString(ix + iw / 2.0, header_y + 6, elec_text)
        c.restoreState()

        # Booth Badge
        badge_y = header_y - 18.0
        c.saveState()
        c.setFillColor(colors.HexColor("#3b82f6"))  # Bright blue
        c.roundRect(ix, badge_y, iw, 14.0, 3, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8)
        booth_label = f"OFFICIAL VOTING SLIP  •  BOOTH {slip.booth_number}"
        c.drawCentredString(ix + iw / 2.0, badge_y + 3.5, booth_label)
        c.restoreState()

        # Two main credential boxes: Voting ID and 4-Digit PIN
        cred_gap = 6.0
        cred_w = (iw - cred_gap) / 2.0
        cred_h = 62.0
        cred_y = badge_y - cred_h - 8.0

        # 1. Voting ID Box
        c.saveState()
        c.setFillColor(colors.HexColor("#f8fafc"))
        c.setStrokeColor(colors.HexColor("#cbd5e1"))
        c.setLineWidth(1)
        c.roundRect(ix, cred_y, cred_w, cred_h, 5, fill=1, stroke=1)

        c.setFillColor(colors.HexColor("#64748b"))
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(ix + cred_w / 2.0, cred_y + cred_h - 12, "VOTING ID")

        c.setFillColor(colors.HexColor("#0f172a"))
        c.setFont("Helvetica-Bold", 18)
        c.drawCentredString(ix + cred_w / 2.0, cred_y + 24, str(slip.voting_id))

        c.setFillColor(colors.HexColor("#94a3b8"))
        c.setFont("Helvetica", 6)
        c.drawCentredString(ix + cred_w / 2.0, cred_y + 8, "Displays automatically")
        c.restoreState()

        # 2. 4-Digit PIN Box
        c.saveState()
        pin_x = ix + cred_w + cred_gap
        c.setFillColor(colors.HexColor("#eff6ff"))  # Soft blue
        c.setStrokeColor(colors.HexColor("#3b82f6"))  # Blue outline
        c.setLineWidth(1.2)
        c.roundRect(pin_x, cred_y, cred_w, cred_h, 5, fill=1, stroke=1)

        c.setFillColor(colors.HexColor("#1d4ed8"))
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(pin_x + cred_w / 2.0, cred_y + cred_h - 12, "4-DIGIT VOTING PIN")

        # Reveal PIN
        pin_val = getattr(slip, "raw_pin", None) or slip.reveal_pin() or "••••"
        # Format PIN with spacing: "4  8  2  9"
        spaced_pin = "  ".join(list(str(pin_val)))
        c.setFillColor(colors.HexColor("#1e3a8a"))
        c.setFont("Helvetica-Bold", 17)
        c.drawCentredString(pin_x + cred_w / 2.0, cred_y + 24, spaced_pin)

        c.setFillColor(colors.HexColor("#3b82f6"))
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(pin_x + cred_w / 2.0, cred_y + 8, "Enter on voting machine")
        c.restoreState()

        # Instructions / Security Footer
        footer_y = iy + 4.0
        c.saveState()
        c.setFillColor(colors.HexColor("#475569"))
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(ix + iw / 2.0, footer_y + 12, f"Walk to Booth {slip.booth_number} and enter your 4-digit PIN.")
        c.setFont("Helvetica", 5.5)
        c.setFillColor(colors.HexColor("#64748b"))
        c.drawCentredString(
            ix + iw / 2.0,
            footer_y + 4,
            "Secret Ballot: No voter identity is linked to this slip. Destroy after voting.",
        )
        c.restoreState()
