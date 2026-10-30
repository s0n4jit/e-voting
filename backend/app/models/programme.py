"""
app/models/programme.py — Academic programmes configurable by the Election Officer.

One row is one selectable combination. Degree: programme "Bachelor of Science", department
"Physics", terms are semesters. Higher Secondary: programme "Higher Secondary", department is the
stream ("Arts" / "Science"), terms are "HS 1st Year" and "HS 2nd Year".
"""

from app.extensions import db


def _ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


class Programme(db.Model):
    __tablename__ = "programmes"

    id = db.Column(db.Integer, primary_key=True)
    level = db.Column(db.String(10), nullable=False, default="degree")  # hs | degree
    programme = db.Column(db.String(120), nullable=False, default="")
    department = db.Column(db.String(120), nullable=False, default="")
    name = db.Column(db.String(120), nullable=False, unique=True)  # "<programme> - <department>"
    term_label = db.Column(db.String(10), nullable=False, default="Semester")  # Semester | Year
    term_count = db.Column(db.Integer, nullable=False, default=6)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    def term_name(self, n) -> str:
        return f"HS {_ordinal(n)} Year" if self.level == "hs" else f"{self.term_label} {n}"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "level": self.level,
            "programme": self.programme or self.name,
            "department": self.department,
            "name": self.name,
            "term_label": self.term_label,
            "term_count": self.term_count,
            "terms": [{"value": n, "label": self.term_name(n)} for n in range(1, self.term_count + 1)],
            "is_active": self.is_active,
        }
