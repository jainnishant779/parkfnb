// The activity log page and CSV, against a real server that is being fed pictures.  Started for you by run_e2e.py.
//   env: ANPR_URL (default http://127.0.0.1:8123), ANPR_KEY (camera key, default testkey1234)
import { launch, harness, OUT } from './cdp_lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const { check, finish } = harness();
const base = process.env.ANPR_URL || 'http://127.0.0.1:8123';
const key = process.env.ANPR_KEY || 'testkey1234';
const frame = fs.readFileSync(path.join(OUT, 'frame.jpg'));

let feeding = true, n = 0;
const feed = (async () => {
  while (feeding) {
    await fetch(`${base}/live/frame-raw?camera_id=phone-1`, { method: 'POST', headers: { 'X-Camera-Key': key, 'Content-Type': 'image/jpeg' }, body: Buffer.concat([frame, Buffer.from(String(++n))]) }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
  }
})();

const b = await launch({ port: 9336, width: 1300, height: 900 });
const text = (sel) => b.ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await b.sleep(300); } return false; };
try {
  // let the server see a few pictures, then have an operator answer once
  await until(async () => (await (await fetch(`${base}/live/state?camera_id=phone-1`)).json()).frame_seq >= 4, 60000);
  await fetch(`${base}/live/bay-override`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ camera_id: 'phone-1', bay_id: '2', status: 'OCCUPIED', minutes: 5 }) });
  await b.sleep(2500);                                   // a couple of samples (the runner sets one a second)

  await b.goto(`${base}/live?camera_id=phone-1`);
  await until(() => b.ev(`!document.body.classList.contains('loading')`), 20000);
  check('the live page offers the log to the operator', await b.ev(`!document.getElementById('logLinks').hidden`) && (await b.ev(`document.getElementById('logPage').getAttribute('href')`)).includes('/live/log?camera_id=phone-1'));

  await b.goto(`${base}/live/log?camera_id=phone-1`);
  check('the log page lists what happened', await until(async () => (await b.ev(`document.querySelectorAll('#rows tr').length`)) >= 3));
  const events = await text('#rows');
  check('the default view has events, not the minute-by-minute samples', /Bay first reading/.test(events) && /Operator answer/.test(events) && /marked occupied/.test(events) && !/Occupancy sample/.test(events), events.slice(0, 160));
  await b.ev(`document.getElementById('kind').value=''; document.getElementById('kind').dispatchEvent(new Event('change'))`);
  await b.sleep(900);
  const all = await text('#rows');
  check('"Everything" adds the samples (with every bay)', /Occupancy sample/.test(all) && /P1=available/.test(all), all.slice(0, 160));
  check('the count line says how many', /\d+ events?/.test(await text('#count')), await text('#count'));
  await b.shot(path.join(OUT, 'log_1_all.png'));

  await b.ev(`document.getElementById('kind').value='operator'; document.getElementById('kind').dispatchEvent(new Event('change'))`);
  await b.sleep(900);
  const op = await b.ev(`[...document.querySelectorAll('#rows tr')].map(r=>r.textContent)`);
  check('filtering to operator answers shows only those', op.length >= 1 && op.every(t => /Operator answer/.test(t)), JSON.stringify(op));
  await b.ev(`document.getElementById('kind').selectedIndex=0; document.getElementById('kind').dispatchEvent(new Event('change'))`);
  await b.sleep(900);
  await b.ev(`document.getElementById('bay').value='p2'; document.getElementById('bay').dispatchEvent(new Event('input'))`);
  const p2 = await b.ev(`[...document.querySelectorAll('#rows tr')].map(r=>r.children[2].textContent)`);
  check('the bay box filters by bay (p2 and P2 are the same)', p2.length >= 1 && p2.every(x => x === 'P2'), JSON.stringify(p2));
  await b.ev(`document.getElementById('bay').value='zzz'; document.getElementById('bay').dispatchEvent(new Event('input'))`);
  check('a bay with nothing says so', /Nothing for that bay/.test(await text('#msg')));
  await b.ev(`document.getElementById('bay').value=''; document.getElementById('bay').dispatchEvent(new Event('input'))`);

  const href = await b.ev(`document.getElementById('csv').getAttribute('href')`);
  const csv = await (await fetch(base + href)).text();
  const lines = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
  check('the Download CSV button points at a real CSV with a header', lines[0] === 'time,camera,event,bay,detail,epoch' && lines.length >= 4, lines.slice(0, 2).join(' | '));
  check('the CSV is oldest first', Number(lines[1].split(',').pop()) <= Number(lines.at(-1).split(',').pop()));
  await b.shot(path.join(OUT, 'log_2_filtered.png'));
} catch (e) {
  check('script ran to the end', false, String(e));
} finally {
  feeding = false; b.close();
}
finish();
