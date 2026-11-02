"""
app/routes/manage.py — Election Officer management: overview, lifecycle, positions,
programmes, instance settings and reports. Every route is admin-only.
"""

import csv
import io
from datetime import datetime, timezone

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt_identity
from sqlalchemy import func

from app.extensions import db
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate
from app.models.election import Election
from app.models.voting_token import VotingToken
from app.models.election_position import ElectionPosition
from app.models.programme import Programme
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.voter_record import VoterRecord
from app.programme_import import DUPLICATE, programme_fields, import_programme_csv
from app.routes.setup import validate_payload
from app.services.vote_service import VoteService
from app.utils.decorators import admin_required
from app.utils.timeutil import utc_iso
from app.utils.validators import clean_name, sanitize_input

manage_bp = Blueprint("manage", __name__)

_LOCKED_AFTER = Election.STATUSES.index("voting_active")  # positions/candidates frozen from here on


def _audit(action, details):
    ident = get_jwt_identity()
    db.session.add(AuditLog(
        user_id=int(ident) if ident and str(ident).isdigit() else None,
        action=action,
        details=details,
        ip_address=request.remote_addr or "",
        user_agent=(request.user_agent.string or "")[:255],
    ))


def election_locked(election) -> bool:
    return Election.STATUSES.index(election.effective_status) >= _LOCKED_AFTER


def transition(election, target):
    """Apply a lifecycle change. Returns an error message, or None on success."""
    cur = election.effective_status
    order = Election.STATUSES
    if target not in order:
        return "Unknown election status."
    i, j = order.index(cur), order.index(target)
    if j == i:
        return None
    # Forward one step at a time; before voting opens an officer may also step back.
    if j != i + 1 and not (j < i and i <= order.index("ready")):
        return f"An election cannot move from {Election.STATUS_LABELS[cur]} to {Election.STATUS_LABELS[target]}."

    if target == "voting_active":
        names = [p.name for p in election.positions]
        if not names:
            return "Add at least one position before opening voting."
        covered = {r[0] for r in db.session.query(Candidate.position).filter_by(election_id=election.id)}
        missing = [n for n in names if n not in covered]
        if missing:
            return "Every position needs at least one candidate. Missing: " + ", ".join(missing) + "."
    election.set_status(target)
    if target == "voting_closed":  # PINs handed out but not used can no longer start a vote
        now = datetime.now(timezone.utc)
        VotingToken.query.filter_by(election_id=election.id, is_used=False).update({"expires_at": now})
    return None


# ── overview ──────────────────────────────────────────────────────────────────

@manage_bp.get("/overview")
@admin_required
def overview():
    election = Election.current()
    voters = User.query.filter_by(role="voter").count()
    cast = (
        VoterRecord.query.filter_by(election_id=election.id, has_voted=True).count() if election else 0
    )
    candidates = Candidate.query.filter_by(election_id=election.id).count() if election else 0
    recent = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(8).all()
    actors = {u.id: u.name for u in User.query.filter(User.id.in_({a.user_id for a in recent if a.user_id})).all()}
    return jsonify({
        "election": election.to_dict() if election else None,
        "stats": {
            "registered_voters": voters,
            "desk_officers": User.query.filter_by(role="polling_officer").count(),
            "candidates": candidates,
            "votes_cast": cast,
            "remaining_voters": max(voters - cast, 0),
            "turnout_percent": round(cast / voters * 100, 1) if voters else 0.0,
        },
        "setup": {
            "programmes": Programme.query.filter_by(is_active=True).count(),
            "positions": len(election.positions) if election else 0,
            "candidates": candidates,
            "desk_officers": User.query.filter_by(role="polling_officer").count(),
        },
        "recent_activity": [
            {
                "action": a.action,
                "details": a.details,
                "actor": actors.get(a.user_id, "System"),
                "at": utc_iso(a.created_at),
            }
            for a in recent
        ],
    }), 200


# ── lifecycle ─────────────────────────────────────────────────────────────────

@manage_bp.post("/elections/<int:election_id>/status")
@admin_required
def set_election_status(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    target = (request.get_json(silent=True) or {}).get("status")
    err = transition(election, target)
    if err:
        return jsonify({"error": err}), 409
    _audit("ELECTION_STATUS_CHANGED", f"Moved \u201c{election.title}\u201d to the stage \u201c{Election.STATUS_LABELS[target]}\u201d.")
    db.session.commit()
    return jsonify(election.to_dict()), 200


@manage_bp.post("/elections/<int:election_id>/pause")
@admin_required
def pause_voting(election_id):
    """Pause voting (for example a break): booths stop accepting votes until it is resumed."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election.effective_status != "voting_active":
        return jsonify({"error": "Voting can only be paused while it is open."}), 409
    if not election.voting_paused:
        election.voting_paused = True
        _audit("VOTING_PAUSED", f"Paused voting in \u201c{election.title}\u201d.")
        db.session.commit()
    return jsonify(election.to_dict()), 200


@manage_bp.post("/elections/<int:election_id>/resume")
@admin_required
def resume_voting(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election.effective_status != "voting_active":
        return jsonify({"error": "Voting is not open."}), 409
    if election.voting_paused:
        election.voting_paused = False
        _audit("VOTING_RESUMED", f"Resumed voting in \u201c{election.title}\u201d.")
        db.session.commit()
    return jsonify(election.to_dict()), 200



# ── mock election ─────────────────────────────────────────────────────────────

@manage_bp.post("/elections/<int:election_id>/mock/start")
@admin_required
def start_mock(election_id):
    """Dry run: open voting on the ready election as a mock. Ending it wipes everything it recorded."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election.is_mock:
        return jsonify({"error": "A mock election is already running."}), 409
    if election.effective_status != "ready":
        return jsonify({"error": "A mock election can only start while the election is in the Ready stage."}), 409
    err = transition(election, "voting_active")
    if err:
        return jsonify({"error": err}), 409
    election.is_mock = True
    election.mock_started_at = datetime.now(timezone.utc)
    _audit("MOCK_STARTED", f"Started a mock election for “{election.title}”.")
    db.session.commit()
    return jsonify(election.to_dict()), 200


@manage_bp.post("/elections/<int:election_id>/mock/end")
@admin_required
def end_mock(election_id):
    """End the mock: remove its ballots, PINs and log entries, reset every voter, and return to Ready."""
    from app.models.ballot_entry import BallotEntry

    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if not election.is_mock:
        return jsonify({"error": "No mock election is running."}), 409
    if (request.get_json(silent=True) or {}).get("confirm") != "RESET":
        return jsonify({"error": 'Type RESET to confirm.'}), 400
    ballots = BallotEntry.query.filter_by(election_id=election.id).delete(synchronize_session=False)
    voted = VoterRecord.query.filter_by(election_id=election.id).update({"has_voted": False, "voted_at": None})
    pins = VotingToken.query.filter_by(election_id=election.id).delete(synchronize_session=False)
    logs = AuditLog.query.filter(AuditLog.created_at >= election.mock_started_at).delete(synchronize_session=False)
    election.set_status("ready")
    election.is_mock = False
    election.mock_started_at = None
    election.public_token = None
    # one line is kept so the dry run itself stays accountable; nothing of what it recorded remains
    _audit("MOCK_RESET", f"A mock election was run and reset: {ballots} ballot rows, {pins} PINs and {logs} log entries removed; {voted} voters reset.")
    db.session.commit()
    return jsonify(election.to_dict()), 200


# ── positions ─────────────────────────────────────────────────────────────────

@manage_bp.get("/elections/<int:election_id>/positions")
@admin_required
def get_positions(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    return jsonify([p.name for p in election.positions]), 200


@manage_bp.put("/elections/<int:election_id>/positions")
@admin_required
def put_positions(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election_locked(election):
        return jsonify({"error": "Positions cannot be changed once voting has opened."}), 409

    names = [clean_name(n) for n in (request.get_json(silent=True) or {}).get("positions", []) if clean_name(n)]
    if not names:
        return jsonify({"error": "Add at least one position."}), 400
    if len({n.lower() for n in names}) != len(names) or any(len(n) > 100 for n in names):
        return jsonify({"error": "Position names must be unique and under 100 characters."}), 400
    names = [sanitize_input(n) for n in names]

    in_use = {r[0] for r in db.session.query(Candidate.position).filter_by(election_id=election.id)}
    dropped = in_use - set(names)
    if dropped:
        return jsonify({"error": "Remove the candidates first for: " + ", ".join(sorted(dropped)) + "."}), 409

    existing = {p.name: p for p in election.positions}
    for i, n in enumerate(names):
        if n in existing:
            existing[n].sort_order = i
        else:
            db.session.add(ElectionPosition(election_id=election.id, name=n, sort_order=i))
    for n, p in existing.items():
        if n not in names:
            db.session.delete(p)
    _audit("POSITIONS_UPDATED", f"Set the positions for \u201c{election.title}\u201d: {', '.join(names)}.")
    db.session.commit()
    db.session.refresh(election)
    return jsonify([p.name for p in election.positions]), 200


# ── programmes ────────────────────────────────────────────────────────────────

@manage_bp.get("/programmes")
@admin_required
def list_programmes():
    return jsonify([p.to_dict() for p in Programme.query.order_by(Programme.name).all()]), 200


@manage_bp.post("/programmes")
@admin_required
def create_programme():
    fields, err = programme_fields(request.get_json(silent=True) or {})
    if err:
        return jsonify({"error": err}), 400
    p = Programme(**fields)
    db.session.add(p)
    _audit("PROGRAMME_CREATED", f"Added the programme \u201c{p.name}\u201d.")
    db.session.commit()
    return jsonify(p.to_dict()), 201


@manage_bp.post("/programmes/import")
@admin_required
def import_programmes():
    """CSV columns: level (hs|degree), programme, department (stream for hs), terms (optional)."""
    upload = request.files.get("file")
    raw = upload.stream.read(200_001) if upload else b""
    if not raw or len(raw) > 200_000:
        return jsonify({"error": "Choose a CSV file under 200 KB."}), 400
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return jsonify({"error": "The file is not a valid UTF-8 CSV."}), 400
    created, skipped, errors = import_programme_csv(text)
    if errors and not created and not skipped:  # file-level problem (empty, too many rows)
        return jsonify({"error": errors[0]}), 400
    _audit("PROGRAMMES_IMPORTED", f"Imported programmes from a CSV file: {created} added, {skipped} already existed, {len(errors)} rows had problems.")
    db.session.commit()
    return jsonify({"created": created, "skipped": skipped, "errors": errors}), 200


@manage_bp.put("/programmes/<int:programme_id>")
@admin_required
def update_programme(programme_id):
    p = db.session.get(Programme, programme_id)
    if not p:
        return jsonify({"error": "Programme not found."}), 404
    payload = request.get_json(silent=True) or {}
    if any(k in payload for k in ("level", "programme", "department", "term_count")):
        fields, err = programme_fields(payload, p)
        if err:
            return jsonify({"error": err}), 400
        if fields["term_count"] < p.term_count and User.query.filter(
            User.programme_id == p.id, User.year > fields["term_count"]
        ).first():
            return jsonify({"error": "Registered students are enrolled in the terms you are removing."}), 409
        for k, v in fields.items():
            setattr(p, k, v)
        User.query.filter_by(programme_id=p.id).update({"department": p.name})
    if "is_active" in payload:
        p.is_active = bool(payload["is_active"])
    _audit("PROGRAMME_UPDATED", f"Updated the programme \u201c{p.name}\u201d.")
    db.session.commit()
    return jsonify(p.to_dict()), 200


@manage_bp.delete("/programmes/<int:programme_id>")
@admin_required
def delete_programme(programme_id):
    p = db.session.get(Programme, programme_id)
    if not p:
        return jsonify({"error": "Programme not found."}), 404
    if User.query.filter_by(programme_id=p.id).first():
        return jsonify({"error": "Students are registered under this programme. Deactivate it instead."}), 409
    _audit("PROGRAMME_DELETED", f"Deleted the programme \u201c{p.name}\u201d.")
    db.session.delete(p)
    db.session.commit()
    return jsonify({"message": "Programme deleted."}), 200


# ── instance settings ─────────────────────────────────────────────────────────

@manage_bp.get("/settings")
@admin_required
def get_settings():
    return jsonify(SystemSetting.branding()), 200


@manage_bp.put("/settings")
@admin_required
def put_settings():
    payload = request.get_json(silent=True) or {}
    merged = {**SystemSetting.branding(), **{k: payload[k] for k in SystemSetting.BRANDING_KEYS if k in payload}}
    errors = validate_payload({"system": merged}, ("system",))
    if errors:
        return jsonify({"error": "Please correct the highlighted fields.", "errors": errors}), 400
    merged["slip_code"] = (merged.get("slip_code") or "SUE").upper()
    for k, v in merged.items():
        SystemSetting.put(k, sanitize_input(clean_name(v)) if k in ("institution_name", "system_name") else v or "")
    _audit("SETTINGS_UPDATED", "Updated the institution settings.")
    db.session.commit()
    return jsonify(SystemSetting.branding()), 200


# ── reports ───────────────────────────────────────────────────────────────────

@manage_bp.get("/elections/<int:election_id>/results")
@admin_required
def election_results(election_id):
    """Results for officers, only once published (before that: turnout and the position list). Includes the public share path."""
    from app.routes.results import results_payload

    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    published = election.effective_status in ("results_published", "archived")
    voting_over = election.effective_status not in ("setup", "registration", "ready", "voting_active")
    if published or election.is_mock:  # a mock election shows live results so the whole run can be checked
        data = results_payload(election, force=True)
    else:
        # Counts, winners and candidates' votes stay hidden until the officer publishes the results.
        from app.services.vote_service import VoteService

        order = [p.name for p in election.positions]
        data = {
            "locked": True,
            "election": {"id": election.id, "title": election.title},
            "turnout": VoteService.calculate_turnout(election_id=election.id),
            "by_position": [{"position": n} for n in order],
        }
    data["published"] = published
    data["mock"] = bool(election.is_mock)
    data["voting_over"] = voting_over
    data["public_path"] = f"/results/{election.public_token}" if election.public_token else None
    return jsonify(data), 200


@manage_bp.post("/elections/<int:election_id>/public-link")
@admin_required
def create_public_link(election_id):
    """The officer decides when the results become public, typically after the projector reveal."""
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election.effective_status not in ("results_published", "archived"):
        return jsonify({"error": "A public link can be created only after the results are published."}), 409
    election.ensure_public_token()
    _audit("PUBLIC_LINK_CREATED", f"Created a public results link for \u201c{election.title}\u201d.")
    db.session.commit()
    return jsonify({"public_path": f"/results/{election.public_token}"}), 201


@manage_bp.delete("/elections/<int:election_id>/public-link")
@admin_required
def delete_public_link(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    election.public_token = None
    _audit("PUBLIC_LINK_DELETED", f"Deleted the public results link for \u201c{election.title}\u201d.")
    db.session.commit()
    return jsonify({"message": "The public link no longer works."}), 200


@manage_bp.get("/elections/<int:election_id>/report")
@admin_required
def election_report(election_id):
    election = db.session.get(Election, election_id)
    if not election:
        return jsonify({"error": "Election not found."}), 404
    if election.effective_status not in ("results_published", "archived"):
        return jsonify({"error": "The report is available after the results are published."}), 409
    results = VoteService.get_results(election_id=election.id, force=True)
    turnout = VoteService.calculate_turnout(election_id=election.id)

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Election", election.title])
    w.writerow(["Status", election.STATUS_LABELS[election.effective_status]])
    w.writerow(["Registered voters", turnout["total_registered"]])
    w.writerow(["Ballots cast", turnout["ballots_cast"]])
    w.writerow(["Registered voters who did not vote", turnout["total_registered"] - turnout["ballots_cast"]])
    w.writerow([])
    w.writerow(["Position", "Candidate", "Votes"])
    for pos in results["by_position"]:
        for c in pos["candidates"]:
            w.writerow([pos["position"], c["name"], c["votes"]])
        w.writerow([pos["position"], "NOTA (None of the Above, not a candidate)", pos["nota_count"]])
    _audit("REPORT_GENERATED", f"Downloaded the results report for \u201c{election.title}\u201d.")
    db.session.commit()
    return Response(
        out.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=election-{election.id}-report.csv"},
    )
