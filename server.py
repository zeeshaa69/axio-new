#!/usr/bin/env python3
"""Static file server for the local Axio Ventures site mirror.

Handles quirks left over from mirroring a Next.js site:
- Next's on-the-fly image optimizer (`/_next/image?url=...&w=...&q=...`) has no
  server to run against locally, so this resolves the `url` param straight to
  the matching file under this directory.
- Requests carry a `?dpl=...` cache-busting query string that isn't part of
  any file on disk, so query strings are stripped before falling back to a
  plain file lookup.
- The client-side router generates clean, extension-less hrefs (e.g. /how,
  /programs/standard) that don't match the exported .html files on disk, so
  those fall back to the matching .html file.
"""
import http.server
import os
import re
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
RANGE_RE = re.compile(r'bytes=(\d*)-(\d*)')


def decode_maybe_double(s):
    prev = s
    for _ in range(3):
        dec = urllib.parse.unquote(prev)
        if dec == prev:
            break
        prev = dec
    return prev


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path

        if path.startswith("/_next/image"):
            qs = urllib.parse.parse_qs(parsed.query)
            url_param = qs.get("url", [None])[0]
            if url_param:
                target = decode_maybe_double(url_param)
                candidate = os.path.join(ROOT, target.lstrip("/"))
                if os.path.isfile(candidate):
                    self.path = "/" + os.path.relpath(candidate, ROOT)
                    return super().send_head()

        candidate = os.path.join(ROOT, path.lstrip("/"))
        if not os.path.isfile(candidate) and path != "/":
            # Next.js's client router generates clean, extension-less hrefs
            # (e.g. /how, /programs/standard) that don't match the exported
            # .html files on disk, so fall back to appending .html.
            html_candidate = candidate.rstrip("/") + ".html"
            if os.path.isfile(html_candidate):
                self.path = "/" + os.path.relpath(html_candidate, ROOT)
                return super().send_head()
            self.path = path
        return super().send_head()

    def do_GET(self):
        range_header = self.headers.get("Range")
        if not range_header:
            return super().do_GET()

        parsed = urllib.parse.urlsplit(self.path)
        candidate = os.path.join(ROOT, parsed.path.lstrip("/"))
        if parsed.path.startswith("/_next/image"):
            qs = urllib.parse.parse_qs(parsed.query)
            url_param = qs.get("url", [None])[0]
            if url_param:
                resolved = os.path.join(ROOT, decode_maybe_double(url_param).lstrip("/"))
                if os.path.isfile(resolved):
                    candidate = resolved

        if not os.path.isfile(candidate):
            return super().do_GET()

        file_size = os.path.getsize(candidate)
        m = RANGE_RE.match(range_header)
        if not m:
            return super().do_GET()

        start_s, end_s = m.groups()
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else file_size - 1
        end = min(end, file_size - 1)
        if start >= file_size or start > end:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{file_size}")
            self.end_headers()
            return

        length = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(candidate))
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        with open(candidate, "rb") as f:
            f.seek(start)
            remaining = length
            chunk = 64 * 1024
            while remaining > 0:
                data = f.read(min(chunk, remaining))
                if not data:
                    break
                self.wfile.write(data)
                remaining -= len(data)


if __name__ == "__main__":
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving {ROOT} on http://0.0.0.0:{port}")
    server.serve_forever()
