// Minimal Chrome DevTools Protocol driver (needs node 22+, which has WebSocket built in).
// No npm packages: it starts Chrome itself, headless, and speaks the protocol over a socket.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(HERE, 'out');                 // screenshots, fixtures, scratch (git-ignored)
fs.mkdirSync(OUT, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findChrome() {
  const found = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  if (!found) throw new Error('Chrome not found: set CHROME_PATH to chrome.exe / chromium');
  return found;
}

export function tempProfile() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'parkfnb-e2e-'));
}

export async function launch({ port = 9333, width = 1500, height = 1100, profile = tempProfile(), args = [] } = {}) {
  const proc = spawn(findChrome(), [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, `--window-size=${width},${height}`, ...args, 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 200));
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch { /* not up yet */ }
  }
  const page = (targets || []).find(t => t.type === 'page');
  if (!page) throw new Error('Chrome did not start');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const handlers = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
    else if (msg.method) handlers.forEach(h => h(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  const dialogs = []; let answers = [];
  handlers.push(async (msg) => {                          // alert / confirm / prompt: record, answer, carry on
    if (msg.method === 'Page.javascriptDialogOpening') {
      dialogs.push({ type: msg.params.type, message: msg.params.message });
      const a = answers.length ? answers.shift() : { accept: true };
      await send('Page.handleJavaScriptDialog', { accept: a.accept !== false, promptText: a.text ?? msg.params.defaultPrompt ?? '' });
    }
  });
  const api = {
    send, dialogs,
    answer: (...list) => { answers = list; },
    async goto(url) { await send('Page.navigate', { url }); await new Promise(r => setTimeout(r, 1500)); },
    async ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); },
    async mouse(type, x, y, extra = {}) { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra }); },
    async key(key, code, extra = {}) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, ...extra }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code }); },
    // a pixel of the drawing canvas -> viewport coordinates
    async toScreen(px, py) {
      return await api.ev(`(()=>{const r=document.getElementById('mainCanvas').getBoundingClientRect();return {x:r.left+${px}*r.width/canvas.width, y:r.top+${py}*r.height/canvas.height};})()`);
    },
    async drag(from, to, steps = 6) {
      const a = await api.toScreen(...from), b = await api.toScreen(...to);
      await api.mouse('mouseMoved', a.x, a.y, { buttons: 0 });
      await api.mouse('mousePressed', a.x, a.y);
      for (let i = 1; i <= steps; i++) await api.mouse('mouseMoved', a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps);
      await api.mouse('mouseReleased', b.x, b.y);
    },
    async clickCanvas(px, py) {
      const a = await api.toScreen(px, py);
      await api.mouse('mouseMoved', a.x, a.y, { buttons: 0 });
      await api.mouse('mousePressed', a.x, a.y);
      await api.mouse('mouseReleased', a.x, a.y);
    },
    async viewport(width, height, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    },
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    close() { try { ws.close(); } catch { /* already closed */ } proc.kill(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* in use */ } },
  };
  return api;
}

/** Tiny test harness: check(name, ok, detail) prints PASS/FAIL; finish() exits non-zero if anything failed. */
export function harness() {
  const results = [];
  return {
    check(name, ok, extra = '') { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); },
    finish() {
      const failed = results.filter(r => !r).length;
      console.log(`\n${results.length - failed}/${results.length} passed`);
      process.exit(failed ? 1 : 0);
    },
  };
}
