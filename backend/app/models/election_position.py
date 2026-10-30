"""
app/models/election_position.py — Ordered positions contested in an election.
"""

from app.extensions import db


class ElectionPosition(db.Model):
    __tablename__ = "election_positions"

    id = db.Column(db.Integer, primary_key=True)
    election_id = db.Column(
        db.Integer,
        db.ForeignKey("elections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(100), nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    __table_args__ = (
        db.UniqueConstraint("election_id", "name", name="uq_election_position_name"),
    )

    def to_dict(self) -> dict:
        return {"id": self.id, "election_id": self.election_id, "name": self.name, "sort_order": self.sort_order}
