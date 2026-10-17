"""로컬 실행용 정적 서버. .env 같은 숨김 파일과 tools/ 는 절대 서빙하지 않는다.
사용법: python tools/serve.py  →  http://localhost:8765"""
import http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)
    def send_head(self):
        parts = self.path.split("?")[0].strip("/").split("/")
        if any(p.startswith(".") for p in parts) or parts[0] == "tools":
            self.send_error(404); return None
        return super().send_head()

print(f"Sky Roadster → http://localhost:{PORT}")
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
