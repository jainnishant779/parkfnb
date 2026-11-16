// A stand-in for the server for viewer tests: serves the real static/live.html and the scenario JSON that
// make_fixtures.py builds (with the real status.py, so the shape is the true one).
//   GET /__set?name=live|admin|night|offline|stalled|error|moved|notstarted|nobays|gate|down&delay=<ms>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { HERE, OUT } from './cdp_lib.mjs';

const PAGE = path.join(HERE, '..', '..', 'static', 'live.html');
let scenario = 'live';
let delayMs = 0;
let hits = 0;
const posts = [];

export function start(port = 8130) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/__set') { scenario = u.searchParams.get('name'); delayMs = Number(u.searchParams.get('delay') || 0); res.end('ok'); return; }
    if (u.pathname === '/__hits') { res.end(String(hits)); hits = 0; return; }
    if (u.pathname === '/__posts') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(posts)); return; }
    if (u.pathname === '/live') { res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(PAGE)); return; }
    if (u.pathname === '/live/state') {
      hits++;
      setTimeout(() => {
        if (scenario === 'down') { res.statusCode = 503; res.end('down'); return; }
        res.setHeader('Content-Type', 'application/json'); res.end(fs.readFileSync(path.join(OUT, `state_${scenario}.json`)));
      }, delayMs);
      return;
    }
    if (u.pathname === '/live/frame.jpg') { res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('X-Frame-Seq', '8315'); res.end(fs.readFileSync(path.join(OUT, 'frame.jpg'))); return; }
    if (u.pathname === '/live/bay-override' && req.method === 'POST') {
      let b = ''; req.on('data', d => b += d).on('end', () => { posts.push(JSON.parse(b)); res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); });
      return;
    }
    res.statusCode = 404; res.end('no');
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
