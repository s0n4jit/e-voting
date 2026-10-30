"""
manage.py — Operational commands.

    python manage.py migrate        apply pending schema upgrades (safe to repeat)
    python manage.py seed           load sample data into an empty database (test environments only)
    python manage.py reset [--empty]  drop everything, re-create the schema, then seed (or leave empty
                                      so the installation wizard runs). Refused in production unless
                                      ALLOW_DB_RESET=true.
    python manage.py programmes     add the college's default departments (safe to repeat)
    python manage.py set-password <username>   set a staff password (prompts for it)
    python manage.py reset-2fa <username>      turn off two-step verification for a staff account (lost phone)
    python manage.py status         show whether the instance is installed
"""

import os
import sys

from app import create_app
from app.extensions import db


def main(argv):
    cmd = argv[1] if len(argv) > 1 else ""
    if cmd not in ("migrate", "seed", "reset", "status", "programmes", "set-password", "reset-2fa"):
        print(__doc__)
        return 2

    app = create_app()
    with app.app_context():
        from app.models.system_setting import SystemSetting

        if cmd == "migrate":
            print("Database is up to date.")  # create_app already applied pending migrations
        elif cmd == "programmes":
            from app.programme_import import TEMPLATE_CSV, import_programme_csv

            created, skipped, errors = import_programme_csv(TEMPLATE_CSV)
            db.session.commit()
            print(f"Programmes: {created} added, {skipped} already present, {len(errors)} errors.")
        elif cmd == "set-password":
            return _set_password(argv[2] if len(argv) > 2 else "")
        elif cmd == "reset-2fa":
            return _reset_2fa(argv[2] if len(argv) > 2 else "")
        elif cmd == "status":
            print("installed" if SystemSetting.is_installed() else "not installed (setup wizard pending)")
        elif cmd == "seed":
            if SystemSetting.is_installed():
                print("Refusing to seed: this instance is already installed. Run `reset` first.")
                return 1
            _print_seed()
        elif cmd == "reset":
            if os.environ.get("FLASK_ENV", "").lower() == "production" and os.environ.get("ALLOW_DB_RESET") != "true":
                print("Refusing to reset a production database. Set ALLOW_DB_RESET=true to override.")
                return 1
            db.drop_all()
            db.session.execute(db.text("DROP TABLE IF EXISTS schema_migrations"))
            db.session.commit()
            from app.migrations import run_migrations

            run_migrations()
            if "--empty" in argv:
                print("Database reset and empty. Open the app to run the installation wizard.")
            else:
                _print_seed()
    return 0


def _set_password(username):
    import getpass

    from app.models.user import User
    from app.utils.validators import validate_password

    user = User.query.filter(db.func.lower(User.student_id) == username.lower(), User.role.in_(("admin", "polling_officer"))).first()
    if not user:
        print("No staff account with that username.")
        return 1
    new = getpass.getpass("New password: ")
    ok, message = validate_password(new)
    if not ok or new != getpass.getpass("Repeat it: "):
        print(message or "The passwords do not match.")
        return 1
    user.set_password(new)
    db.session.commit()
    print(f"Password updated for {user.name}.")
    return 0


def _reset_2fa(username):
    """Lost authenticator: the officer is asked to set up two-step verification again at the next sign-in."""
    from app.models.user import User

    user = User.query.filter(db.func.lower(User.student_id) == username.lower(), User.role.in_(("admin", "polling_officer"))).first()
    if not user:
        print("No staff account with that username.")
        return 1
    user.otp_enabled, user.otp_secret = False, None
    db.session.commit()
    print(f"Two-step verification reset for {user.name}. They must set it up again after signing in.")
    return 0


def _print_seed():
    from app.sample_data import seed_sample_data

    info = seed_sample_data()
    o = info["officer"]
    print(f"Seeded '{info['election']}'.")
    print(f"  Election Officer : {o['username']} / {o['password']}")
    for d in info["desks"]:
        print(f"  Desk Officer     : {d['username']} / {d['password']}")
    print("  Voter Slip IDs   :")
    for slip, name in info["slips"]:
        print(f"    {slip}  {name}")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
