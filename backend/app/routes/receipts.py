"""
app/routes/receipts.py — Election Officer Centralized Receipt & Audit Endpoints.
Allows viewing individual receipts, downloading vector PDFs, bulk downloading ZIP archives,
and clearing mock election receipts before live polling.
"""

from flask import Blueprint, Response, jsonify, request, send_file
from sqlalchemy import or_

from app.models.vote_receipt import VoteReceipt
from app.services.receipt_service import ReceiptService
from app.utils.decorators import admin_required

receipts_bp = Blueprint("receipts", __name__, url_prefix="/api/officer/receipts")


@receipts_bp.get("")
@admin_required
def list_receipts():
    """List receipts with filtering by live/mock, election, and search query."""
    is_mock = request.args.get("is_mock", "false").lower() in ("true", "1", "yes")
    election_id = request.args.get("election_id", type=int)
    search = (request.args.get("search") or "").strip()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 25, type=int), 1), 100)

    query = VoteReceipt.query.filter_by(is_mock=is_mock)
    if election_id:
        query = query.filter_by(election_id=election_id)

    if search:
        search_term = f"%{search}%"
        if search.isdigit():
            padded = f"%{int(search):02d}%"
            query = query.filter(
                or_(
                    VoteReceipt.booth_name.ilike(search_term),
                    VoteReceipt.booth_name.ilike(padded),
                )
            )
        else:
            query = query.filter(VoteReceipt.booth_name.ilike(search_term))

    total = query.count()
    items = (
        query.order_by(VoteReceipt.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    live_count = VoteReceipt.query.filter_by(is_mock=False).count()
    mock_count = VoteReceipt.query.filter_by(is_mock=True).count()
    unprinted_count = VoteReceipt.query.filter_by(is_mock=is_mock, is_printed=False).count()

    return jsonify({
        "items": [r.to_dict() for r in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page),
        "live_count": live_count,
        "mock_count": mock_count,
        "unprinted_count": unprinted_count,
    }), 200


@receipts_bp.get("/<slip_id>/html")
@admin_required
def get_receipt_html(slip_id):
    """Serve standalone HTML for modal preview."""
    receipt = VoteReceipt.query.filter_by(slip_id=slip_id).first()
    if not receipt:
        return jsonify({"error": "Receipt not found."}), 404

    from app.services.receipt_service import generate_receipt_html
    from app.extensions import db

    if receipt.html_content and 'class="banner"' in receipt.html_content:
        html = receipt.html_content
    else:
        election_title = receipt.election.title if receipt.election else "Campus E-Voting"
        from app.models.system_setting import SystemSetting
        branding = SystemSetting.branding()
        html = generate_receipt_html({
            "slip": receipt.slip_id,
            "election": election_title,
            "institution": branding.get("institution_name") or "Pandit Deendayal Upadhyaya Adarsha Mahavidyalaya, Amjonga",
            "booth": receipt.booth_name or "BOOTH-01",
            "time": receipt.created_at.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "is_mock": receipt.is_mock,
            "logo": branding.get("logo") or "",
            "lines": receipt.get_choices(),
        })
        try:
            receipt.html_content = html
            db.session.commit()
        except Exception:
            pass

    return Response(html, mimetype="text/html; charset=utf-8")


@receipts_bp.get("/<slip_id>/pdf")
@admin_required
def get_receipt_pdf(slip_id):
    """Download individual receipt vector PDF."""
    receipt = VoteReceipt.query.filter_by(slip_id=slip_id).first()
    if not receipt:
        return jsonify({"error": "Receipt not found."}), 404

    pdf_bytes = ReceiptService.get_receipt_pdf_bytes(receipt)
    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{slip_id}.pdf"',
            "Content-Type": "application/pdf",
        },
    )


@receipts_bp.get("/export-zip")
@admin_required
def export_receipts_zip():
    """Bulk download all receipts as a ZIP archive with manifest.csv."""
    is_mock = request.args.get("is_mock", "false").lower() in ("true", "1", "yes")
    election_id = request.args.get("election_id", type=int)

    zip_buffer = ReceiptService.export_zip(election_id=election_id, is_mock=is_mock)
    label = "mock_receipts" if is_mock else "official_receipts"
    fn = f"{label}.zip"

    return Response(
        zip_buffer.getvalue(),
        mimetype="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{fn}"',
            "Content-Type": "application/zip",
        },
    )


@receipts_bp.delete("/mock")
@admin_required
def clear_mock():
    """Clear all mock election receipts before live voting."""
    election_id = request.args.get("election_id", type=int)
    count = ReceiptService.clear_mock_receipts(election_id=election_id)
    return jsonify({
        "success": True,
        "message": f"Successfully cleared {count} mock election receipt(s).",
        "cleared": count,
    }), 200


@receipts_bp.post("/<slip_id>/mark-printed")
@admin_required
def mark_receipt_printed(slip_id):
    """Mark a receipt as printed / reprinted from the election officer admin panel."""
    from datetime import datetime, timezone
    from app.extensions import db
    from app.models.audit_log import AuditLog
    receipt = VoteReceipt.query.filter_by(slip_id=slip_id).first_or_404()
    receipt.is_printed = True
    receipt.print_error = None
    receipt.reprinted_at = datetime.now(timezone.utc)
    db.session.add(AuditLog(
        action="RECEIPT_REPRINTED",
        details=f"Receipt slip {slip_id} ({receipt.booth_name}) marked as printed / reprinted remotely from election officer panel.",
        ip_address=request.remote_addr or "",
        user_agent=(request.user_agent.string or "")[:255],
    ))
    db.session.commit()
    return jsonify(receipt.to_dict()), 200
