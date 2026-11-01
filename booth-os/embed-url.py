#!/usr/bin/env python3
"""Put your portal address into a downloaded Campus E-Voting Booth OS ISO.

    python embed-url.py evote-booth-os.iso https://vote.example.edu/kiosk/vote [output.iso]

The ISO carries a fixed-size placeholder on its boot command line. This tool copies the ISO and overwrites
the placeholder in the copy (same length, so the image stays valid) in every boot menu entry it finds. The
original is left untouched, so you can make one per address. Works on Windows, macOS and Linux with plain Python 3.
"""
import os
import re
import shutil
import sys

PLACEHOLDER = b"@EVOTEURL@" + b"x" * 190  # must match booth-os/auto/config
CHUNK = 64 * 1024 * 1024
URL_RE = re.compile(r"^https?://[^/\s]+/kiosk/vote$")


def patch(path: str, url: str) -> int:
    if not URL_RE.match(url) or len(url) > len(PLACEHOLDER):
        raise SystemExit(f"The address must look like https://your-site.example/kiosk/vote and be under {len(PLACEHOLDER)} characters.")
    replacement = url.encode().ljust(len(PLACEHOLDER), b" ")  # trailing spaces are ignored on the kernel command line
    found = 0
    with open(path, "r+b") as f:
        carry = b""
        pos = 0
        while True:
            block = f.read(CHUNK)
            if not block:
                break
            data = carry + block
            base = pos - len(carry)
            start = 0
            while (i := data.find(PLACEHOLDER, start)) != -1:
                f.seek(base + i)
                f.write(replacement)
                found += 1
                start = i + len(PLACEHOLDER)
            f.seek(pos + len(block))
            carry = data[-(len(PLACEHOLDER) - 1):]
            pos += len(block)
    return found


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit(__doc__)
    source, url = sys.argv[1], sys.argv[2]
    if not os.path.isfile(source):
        raise SystemExit(f"File not found: {source}
Give the full path of the downloaded ISO, for example booth-os/evote-booth-os.iso")
    host = re.sub(r"[^a-z0-9.-]", "", (url.split("//")[-1].split("/")[0]).lower()) or "booth"
    out = sys.argv[3] if len(sys.argv) == 4 else f"{os.path.splitext(source)[0]}-{host}.iso"
    if os.path.abspath(out) == os.path.abspath(source):
        raise SystemExit("The output file must differ from the original.")
    shutil.copyfile(source, out)
    count = patch(out, url)
    if not count:
        os.remove(out)
        raise SystemExit("No placeholder found: this is not an unmodified Booth OS ISO (or it already has an address). Download a fresh copy.")
    print(f"Done: {out}
The address is written in {count} boot menu entr{'y' if count == 1 else 'ies'}. Write this file to the USB stick.")
