"""Loopback-only static preview. QA files/config live outside the publishable repository."""
import argparse, functools, http.server, json, pathlib, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
QA = pathlib.Path(r'C:\Brewers-Site\deliverables\phase4a3-preview\public')
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8765)
parser.add_argument('--legacy', action='store_true', help='Unchanged production data/config; no QA routes')
parser.add_argument('--artifact', type=pathlib.Path, help='Validated local artifact; public files must be in its sibling public directory')
parser.add_argument('--label', help='Explicit label for this local-only preview')
args = parser.parse_args()
ARTIFACT=args.artifact.resolve() if args.artifact else QA.parent/'preview-artifact.json'
if args.artifact:
    QA=ARTIFACT.parent/'public'

class Preview(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        raw = urllib.parse.urlsplit(self.path).path
        decoded = urllib.parse.unquote(raw)
        if '\\' in decoded or any(p.startswith('.') for p in decoded.split('/') if p):
            return self.send_error(404)
        if decoded == '/ServerCode/sports-source.js' and not args.legacy:
            # Missing/corrupt preview metadata must never silently reactivate legacy sports data.
            try:
                artifact=json.loads(ARTIFACT.read_text(encoding='utf-8'))
                players=json.loads(next(text for name,text in artifact['files'].items() if name.endswith('/players.json')))['players']
            except (OSError, ValueError, KeyError, StopIteration):
                players=[]
            demos=[p['profileSlug'] or p['playerId'] for p in players if not (ROOT/'roster/stats'/f"{p['profileSlug'] or p['playerId']}.json").is_file()]
            body = ('window.BrewersSportsSource=Object.freeze(' + json.dumps({'enabled':True,'preview':True,'current':'__qa_sports__/sports/v1/current.json','previewProfiles':demos,'previewLabel':args.label}) + ');').encode()
            self.send_response(200); self.send_header('Content-Type','text/javascript; charset=utf-8'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body); return
        if decoded.startswith('/__qa_sports__/'):
            if args.legacy: return self.send_error(404)
            rel = decoded.removeprefix('/__qa_sports__/')
            target = (QA / rel).resolve()
            if not target.is_relative_to(QA.resolve()) or not rel.startswith('sports/v1/') or target.suffix != '.json' or not target.is_file(): return self.send_error(404)
            body=target.read_bytes(); self.send_response(200); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body); return
        if decoded.split('/')[1] in ('tools','tests','local-private','__pycache__'):
            return self.send_error(404)
        super().do_GET()

    def list_directory(self, path):
        return self.send_error(404)

    def log_message(self, format, *values):
        pass

if not args.legacy and not (QA/'sports/v1/current.json').is_file():
    raise SystemExit(r'Dati locali mancanti. Preparazione offline: node C:\Brewers-Site\deliverables\phase4a3-preview\prepare_sports_preview.cjs')
server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),functools.partial(Preview,directory=str(ROOT)))
print(f'Brewers {"legacy" if args.legacy else "QA locale"}: http://127.0.0.1:{args.port}/',flush=True)
server.serve_forever()
