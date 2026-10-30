"""Preview the landing page locally with the same clean URLs GitHub Pages uses.

    python scripts/serve-site.py [port]      ->  http://localhost:8765/
"""
import functools
import http.server
import os
import sys

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")


class CleanUrls(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        real = super().translate_path(path)
        if not os.path.exists(real) and os.path.exists(real + ".html"):
            return real + ".html"
        return real


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(CleanUrls, directory=DOCS)
    print(f"Serving {os.path.abspath(DOCS)} at http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
