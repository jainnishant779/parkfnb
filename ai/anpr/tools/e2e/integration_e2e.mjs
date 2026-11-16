// The real server + the real viewer: a camera feeding frames, the page reading them, an operator answering,
// then the camera stopping.  Started for you by run_e2e.py (which makes the server).
//   env: ANPR_URL (default http://127.0.0.1:8123), ANPR_KEY (the camera key, default testkey1234)
import { launch, harness, OUT } from './cdp_lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const { check, finish } = harness();
const base = process.env.ANPR_URL || 'http://127.0.0.1:8123';
const key = process.env.ANPR_KEY || 'testkey1234';
const night = fs.readFileSync(path.join(OUT, 'night.jpg'));

let feeding = true, n = 0;
const feed = (async () => {
  while (feeding) {
    // a real camera never sends the same JPEG twice (the server treats ten identical ones as a frozen camera): vary the bytes after the picture
    await fetch(`${base}/live/frame-raw?camera_id=phone-1`, { method: 'POST', headers: { 'X-Camera-Key': key, 'Content-Type': 'image/jpeg' }, body: Buffer.concat([night, Buffer.from(String(++n))]) }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
  }
})();

const b = await launch({ port: 9335, width: 1440, height: 1000 });
const text = (sel) => b.ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await b.sleep(300); } return false; };
try {
  await b.viewport(1440, 1000);
  await b.goto(`${base}/live?camera_id=phone-1`);
  check('the real page goes Live', await until(async () => /^Live/.test(await text('#status')), 45000), await text('#status'));
  check('the real picture arrives', await until(() => b.ev(`document.getElementById('frame').naturalWidth>0`), 15000));
  await b.sleep(2500);
  const s = await (await fetch(`${base}/live/state?camera_id=phone-1`)).json();
  check('the state has the canonical fields', s.slots.length === 5 && s.slot_summary.total === 5 && s.stream_status === 'live' && s.light === 'low' && s.is_admin === true,
        JSON.stringify({ n: s.slots.length, st: s.stream_status, light: s.light, admin: s.is_admin }));
  check('dark frame: no bay is called vacant', s.slot_summary.vacant === 0 && s.slots.every(x => x.status === 'UNCERTAIN' || x.status === 'OCCUPIED'), JSON.stringify(s.slot_summary));
  check('the page tells the visitor about the night', /Night mode/.test(await text('#banner')) && (await text('#health')).includes('Low'));
  check('the numbers on the page are the numbers in the state',
        (await b.ev(`['k-total','k-occ','k-vac','k-unc'].map(i=>document.getElementById(i).textContent).join()`)) === [s.slot_summary.total, s.slot_summary.occupied_confirmed, s.slot_summary.vacant, s.slot_summary.uncertain].join());
  const hdr = await fetch(`${base}/live/frame.jpg?camera_id=phone-1`);
  check('the picture carries its frame number', Number(hdr.headers.get('x-frame-seq')) >= s.frame_seq - 2, hdr.headers.get('x-frame-seq'));
  await b.shot(path.join(OUT, 'integ_1_night.png'));

  // the operator answers for P1 from the page
  const occ0 = Number(await text('#k-occ'));
  await b.ev(`document.querySelectorAll('#stage .bay-poly')[0].dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
  check('the operator buttons are there (this machine counts as admin)', await b.ev(`document.querySelector('#detail .ops')!==null`));
  await b.ev(`[...document.querySelectorAll('#detail .ops button')].find(x=>/Mark occupied/.test(x.textContent)).click()`);
  check('the bay becomes occupied by operator, and the numbers follow', await until(async () => Number(await text('#k-occ')) === occ0 + 1), `${occ0} -> ${await text('#k-occ')}`);
  const d = await text('#detail');
  check('the detail says it was set by an operator', /Set by operator/.test(d) && /Operator answer/.test(d), d.slice(0, 140));
  check('the timeline records it', /P1 marked occupied/.test(await text('#events')));
  const s2 = await (await fetch(`${base}/live/state?camera_id=phone-1`)).json();
  check('the summary still adds up', s2.slot_summary.vacant + s2.slot_summary.occupied_confirmed + s2.slot_summary.uncertain + s2.slot_summary.stale === 5 && s2.slot_summary.flagged === 0, JSON.stringify(s2.slot_summary));
  await b.shot(path.join(OUT, 'integ_2_operator.png'));
  await b.ev(`[...document.querySelectorAll('#detail .ops button')].find(x=>/Clear/.test(x.textContent)).click()`);
  check('Clear takes the answer back', await until(async () => Number(await text('#k-occ')) === occ0), `${await text('#k-occ')} (was ${occ0})`);

  // the camera stops: the page goes to "no signal" and keeps the last known numbers
  feeding = false; await feed;
  check('the camera stops: the page says so and greys out', await until(async () => /offline/i.test(await text('#status')), 40000), await text('#status'));
  check('and the bays say no signal', (await b.ev(`document.querySelectorAll('#stage .bay-poly.stale').length`)) === 5);
  const s3 = await (await fetch(`${base}/live/state?camera_id=phone-1`)).json();
  check('the timeline has the outage', s3.events.some(e => e.type === 'feed_offline') && s3.events.some(e => e.type === 'low_light'), JSON.stringify(s3.events.map(e => e.type)));
  await b.shot(path.join(OUT, 'integ_3_offline.png'));
} catch (e) {
  check('script ran to the end', false, String(e));
} finally {
  feeding = false; b.close();
}
finish();
