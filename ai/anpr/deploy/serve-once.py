"""
Hand a few files to ONE download each, then shut down.  For moving the deploy bundle to a server
that cannot reach this machine directly (use it behind a temporary tunnel).

    python deploy/serve-once.py --port 8099 --minutes 45 bundle.tgz deploy/setup-ec2.sh

Files are served at /<random-token>/<file name>.  Each can be fetched once; a second request, a
wrong token or an unknown name all get 404.  The server stops when every file has been fetched, or
when the time is up.  The token is written to <first file>.serve-info (JSON) and never logged.
"""

import argparse
import hashlib
import http.server
import json
import secrets
import threading
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8099)
    ap.add_argument("--minutes", type=float, default=45)
    ap.add_argument("--info", help="where to write the token (default: next to the first file)")
    ap.add_argument("files", nargs="+")
    a = ap.parse_args()

    files = {Path(f).name: Path(f) for f in a.files}
    for p in files.values():
        if not p.is_file():
            raise SystemExit(f"not a file: {p}")
    token = secrets.token_urlsafe(24)
    served: set[str] = set()
    lock = threading.Lock()

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):          # the path holds the token: log nothing
            pass

        def _send_404(self):
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            parts = self.path.split("?")[0].strip("/").split("/")
            if len(parts) != 2 or not secrets.compare_digest(parts[0], token) or parts[1] not in files:
                return self._send_404()
            name = parts[1]
            with lock:
                if name in served:
                    return self._send_404()
                served.add(name)                # claimed now: a parallel request cannot get it too
            data = files[name].read_bytes()
            try:
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except OSError:
                with lock:
                    served.discard(name)        # the transfer broke: allow one more try
                return
            if len(served) == len(files):
                threading.Thread(target=server.shutdown, daemon=True).start()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    info = Path(a.info) if a.info else Path(a.files[0] + ".serve-info")
    info.write_text(json.dumps({
        "port": a.port, "token": token,
        "files": {n: {"sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "bytes": p.stat().st_size}
                  for n, p in files.items()},
    }), encoding="utf-8")
    timer = threading.Timer(a.minutes * 60, server.shutdown)
    timer.daemon = True
    timer.start()
    server.serve_forever()
    timer.cancel()
    server.server_close()


if __name__ == "__main__":
    main()
