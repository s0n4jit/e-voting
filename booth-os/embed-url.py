#!/usr/bin/env python3
"""Put your portal address into a downloaded Campus E-Voting Booth OS ISO.

    python embed-url.py evote-booth-os.iso https://vote.example.edu/kiosk/vote

The ISO carries a fixed-size placeholder on its boot command line. This tool overwrites it in place
(same length, so the image stays valid) in every boot menu entry it finds. Works on Windows, macOS and
Linux with plain Python 3. The ISO is changed in place; keep a copy of the original if you need other addresses.
"""
import re
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
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    count = patch(sys.argv[1], sys.argv[2])
    if not count:
        raise SystemExit("No placeholder found: this is not an unmodified Booth OS ISO (or it already has an address). Download a fresh copy.")
    print(f"Done: address written in {count} boot menu entr{'y' if count == 1 else 'ies'}.")
