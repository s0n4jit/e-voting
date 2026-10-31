"""Create or complete .env with random secrets, so a fresh clone starts with one command.

    python scripts/make_env.py && docker compose up -d --build

Existing values are never changed; only missing ones are added.
"""
import pathlib
import secrets

path = pathlib.Path(__file__).resolve().parent.parent / ".env"
have = {}
if path.exists():
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, _, value = line.partition("=")
            have[key.strip()] = value.strip()

wanted = {
    "POSTGRES_PASSWORD": secrets.token_hex(16),  # letters and digits only: it is embedded in a URL
    "SECRET_KEY": secrets.token_hex(32),
    "JWT_SECRET_KEY": secrets.token_hex(32),
    "SETUP_TOKEN": secrets.token_urlsafe(12),  # asked by the installation wizard
}
added = [k for k in wanted if not have.get(k)]
if added:
    with path.open("a", encoding="utf-8") as f:
        f.write("\n" if path.exists() and path.read_text(encoding="utf-8")[-1:] not in ("", "\n") else "")
        for k in added:
            f.write(f"{k}={wanted[k]}\n")
print("Setup token for the installation wizard: " + (wanted["SETUP_TOKEN"] if "SETUP_TOKEN" in added else have["SETUP_TOKEN"]))
print(f".env ready ({'added ' + ', '.join(added) if added else 'nothing to add'}).")
