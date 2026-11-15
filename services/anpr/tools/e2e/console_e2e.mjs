// The management console in a real browser, against a real server that is being fed pictures and whose data folder
// was seeded with a day of history, a violation and an evidence picture (see run_e2e.py seed_console).
//   env: ANPR_URL (default http://127.0.0.1:8123), ANPR_KEY (camera key, default testkey1234)
import { launch, harness, OUT } from './cdp_lib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const { check, finish } = harness();
const base = process.env.ANPR_URL || 'http://127.0.0.1:8123';
const key = process.env.ANPR_KEY || 'testkey1234';
const frame = fs.readFileSync(path.join(OUT, 'frame.jpg'));
const VISITOR = { 'X-Forwarded-For': '203.0.113.9' };

let feeding = true, n = 0;
const feed = (async () => {
  while (feeding) {
    await fetch(`${base}/live/frame-raw?camera_id=phone-1`, { method: 'POST', headers: { 'X-Camera-Key': key, 'Content-Type': 'image/jpeg' }, body: Buffer.concat([frame, Buffer.from(String(++n))]) }).catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
  }
})();

const b = await launch({ port: 9337, width: 1440, height: 1000 });
const text = (sel) => b.ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await b.sleep(250); } return false; };
const go = async (route) => { await b.ev(`location.hash='#/${route}'`); await b.sleep(400); };
const broken = () => b.ev(`/could not be drawn/.test(document.getElementById('view').textContent)`);

try {
  await until(async () => (await (await fetch(`${base}/live/state?camera_id=phone-1`)).json()).frame_seq >= 3, 60000);

  // ---- the front door
  const door = await fetch(`${base}/`, { redirect: 'manual', headers: VISITOR });
  check('a visitor at the front door is sent to the sign-in page, not the live view', door.status === 303 && door.headers.get('location') === '/admin?next=%2F', `${door.status} ${door.headers.get('location')}`);
  const priv = await fetch(`${base}/console/api/violations`, { headers: VISITOR });
  check('and cannot read the register', priv.status === 403);

  // ---- dashboard
  await b.goto(`${base}/`);
  check('the operator gets the console', /Dashboard/.test(await text('#title')) && (await b.ev(`document.querySelectorAll('#nav a[data-r]').length`)) >= 10);
  const nBays = (await (await fetch(`${base}/live/state?camera_id=phone-1`)).json()).slots.length;
  check('the layout has bays to show', nBays >= 3, String(nBays));
  check('the dashboard counts every bay', await until(async () => (await text('#view')).replace(/\s/g, '').startsWith('Totalbays' + nBays)), (await text('#view')).slice(0, 120));
  check('it draws the occupancy chart', await until(() => b.ev(`!!document.querySelector('#view svg.chart')`)));
  check('the camera picker lists the camera', (await b.ev(`document.getElementById('camPick').options.length`)) >= 1 && /phone-1/.test(await b.ev(`document.getElementById('camPick').value`)));
  check('the sidebar names the site and the open violation count shows', /ParkFNB/.test(await text('#siteName')) && await until(async () => !(await b.ev(`document.getElementById('vbadge').hidden`))));
  await b.shot(path.join(OUT, 'console_1_dashboard.png'));

  // ---- live operations
  await go('live');
  check('live operations draws the camera picture', await until(() => b.ev(`(()=>{const i=document.querySelector('.cam img');return !!i&&i.naturalWidth>0})()`)));
  check('and one tile per bay', await until(async () => (await b.ev(`document.querySelectorAll('.bay').length`)) === nBays));
  await b.ev(`document.querySelector('.bay').click()`);
  await b.sleep(300);
  check('tapping a bay shows its details and the operator buttons', /Selected bay/.test(await text('#view')) && /Mark available/.test(await text('#view')));
  await b.shot(path.join(OUT, 'console_2_live.png'));
  // full screen: the button (a real click counts as a user gesture) puts the picture and the counts on the whole screen
  await b.send('Runtime.evaluate', { expression: `document.querySelector('.cam .fsbtn').click()`, userGesture: true, awaitPromise: true });
  check('the full-screen button fills the screen with the picture and the counts', await until(() => b.ev(`!!document.fullscreenElement && document.fullscreenElement.classList.contains('cam')
    && getComputedStyle(document.querySelector('.fsbar')).display === 'flex' && /Occupied/.test(document.querySelector('.fsbar').textContent)`), 5000));
  await b.shot(path.join(OUT, 'console_2b_fullscreen.png'));
  await b.send('Runtime.evaluate', { expression: `document.exitFullscreen()`, userGesture: true, awaitPromise: true });
  check('and Esc / the button brings it back', await until(() => b.ev(`!document.fullscreenElement`), 5000));

  // the menu: grouped, the editor and the log are real links (Back never bounces into them), and it folds to icons
  check('the editor and log menu entries link straight to their pages', await b.ev(`document.querySelector('#nav a[data-r="layout"]').getAttribute('href') === '/occupancy?camera=phone-1'
    && document.querySelector('#nav a[data-r="log"]').getAttribute('href') === '/live/log?camera_id=phone-1'`));
  await b.ev(`document.getElementById('collapse').click()`);
  await b.sleep(300);
  check('the menu folds to icons and remembers it', await b.ev(`document.querySelector('.app').classList.contains('mini') && document.querySelector('.side').getBoundingClientRect().width < 100 && localStorage.getItem('pf.mini') === '1'`));
  await b.shot(path.join(OUT, 'console_2c_menu_folded.png'));
  await b.ev(`document.getElementById('collapse').click()`);
  await b.sleep(300);
  check('and opens again', await b.ev(`!document.querySelector('.app').classList.contains('mini') && document.querySelector('.side').getBoundingClientRect().width > 200`));

  // ---- lots, vehicles, devices
  await go('lots');
  check('parking lots lists the camera and opens its live view on a click', await until(async () => /phone-1/.test(await text('#view'))));
  await b.ev(`document.querySelector('.tbl tr.click').click()`);
  await b.sleep(400);
  check('(the click went to Live Operations)', /Live Operations/.test(await text('#title')));
  await go('vehicles');
  check('vehicles explains how plates are read and invents none', /Number plates/.test(await text('#view')) && /never guessed/.test(await text('#view')) && !/\b[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}\b/.test(await text('#view')));
  await b.sleep(1500);
  check('vehicles has the arrivals card and says what to expect before any car has parked', /Arrivals: a sharp photo of each car/.test(await text('#view')) && /No car has parked since this was switched on|waiting for the photo|still there/.test(await text('#view')), (await text('#view')).slice(0, 200));
  await b.shot(path.join(OUT, 'console_3_vehicles.png'));
  await go('devices');
  check('devices shows the camera with its health', await until(async () => /phone-1/.test(await text('#view')) && /Live|Delayed|Behind|Offline|Stalled/.test(await text('#view'))), (await text('#view')).slice(0, 300));
  check('and a bay health table, one row per bay, each with a verdict', await until(async () => (await b.ev(`document.querySelectorAll('#view .card')[1].querySelectorAll('tbody tr').length`)) === nBays)
    && await b.ev(`[...document.querySelectorAll('#view .card')[1].querySelectorAll('tbody tr')].every(r=>/OK|Watch|Check layout/.test(r.textContent))`));

  // ---- reports and sessions
  await go('reports');
  check('reports draws tiles, the chart and the heat grid', await until(() => b.ev(`!!document.querySelector('#view .tiles') && !!document.querySelector('#view svg.chart') && !!document.querySelector('.heat')`)) && !(await broken()));
  await b.ev(`[...document.querySelectorAll('.seg button')].find(x=>x.textContent==='Yesterday').click()`);
  await b.sleep(900);
  const yday = await text('#view');
  check('yesterday has its own report (seeded history shows up)', /Camera seen/.test(yday) && !/Loading/.test(yday), yday.slice(0, 140).replace(/\s+/g, ' '));
  await b.ev(`[...document.querySelectorAll('.seg button')].find(x=>x.textContent==='Today').click()`);
  await b.sleep(900);
  const csvHref = await b.ev(`[...document.querySelectorAll('a.btn')].find(a=>/CSV: stays/.test(a.textContent)).getAttribute('href')`);
  const csv = (await (await fetch(base + csvHref)).text()).replace(/^﻿/, '');
  check('the stays CSV downloads with its header', csv.startsWith('bay,start,end,dwell_minutes,counted_in_averages,plate,note'), csv.slice(0, 80));
  await b.shot(path.join(OUT, 'console_4_reports.png'));
  await go('sessions');
  check('sessions lists the seeded stays', await until(async () => (await b.ev(`document.querySelectorAll('#view .tbl tbody tr').length`)) >= 1) && !(await broken()));
  const rowsNow = () => b.ev(`document.querySelectorAll('#view .tbl tbody tr').length`);
  const hidden = await rowsNow();
  check('a bay that keeps flickering is called out and its flickers are not listed as cars', /P5 \(7 times\)/.test(await text('#view')) && (await b.ev(`[...document.querySelectorAll('#view .tbl tbody tr')].every(r=>!/flicker/.test(r.textContent))`)), String(hidden));
  await b.ev(`document.querySelector('#view input[type=checkbox]').click()`);
  await b.sleep(300);
  check('"Show the short flickers too" adds them to the list', (await rowsNow()) === hidden + 7, `${hidden} -> ${await rowsNow()}`);
  await b.ev(`document.querySelector('#view input[type=checkbox]').click()`);

  // ---- violations
  await go('violations');
  check('violations lists the open one with its picture', await until(async () => (await b.ev(`document.querySelectorAll('#view .tbl tbody tr').length`)) === 1 && await b.ev(`!!document.querySelector('#view .tbl img')`)));
  await b.ev(`document.querySelector('#view .tbl tr.click').click()`);
  await b.sleep(500);
  check('a click opens the drawer with the picture and the buttons', await b.ev(`!!document.querySelector('.drawer img') && /Resolve/.test(document.querySelector('.drawer').textContent)`));
  await b.shot(path.join(OUT, 'console_5_violation.png'));
  await b.ev(`const t=document.querySelector('.drawer textarea'); t.value='Driver told to move'; [...document.querySelectorAll('.drawer button')].find(x=>/^Resolve/.test(x.textContent)).click()`);
  check('resolving it empties the open list', await until(async () => /Nothing open/.test(await text('#view'))));
  check('and the badge goes away', await until(() => b.ev(`document.getElementById('vbadge').hidden`)));
  await b.ev(`[...document.querySelectorAll('.seg button')].find(x=>x.textContent==='Resolved').click()`);
  await b.sleep(700);
  check('the resolved list has it with the note saved', await b.ev(`document.querySelectorAll('#view .tbl tbody tr').length`) >= 1);

  // ---- settings
  await go('settings');
  check('settings loads the site and the cameras', await until(() => b.ev(`!!document.querySelector('#view input[type=text]')`)));
  await b.ev(`const i=document.querySelector('#view input[type=text]'); i.value='Indore Pilot Lot'; [...document.querySelectorAll('#view button')].find(x=>x.textContent==='Save settings').click()`);
  check('saving renames the site in the sidebar', await until(async () => /Indore Pilot Lot/.test(await text('#siteName'))));

  // ---- the editor and log pages are one click away
  check('every menu entry draws without an error', await (async () => {
    for (const r of ['dashboard', 'live', 'lots', 'vehicles', 'sessions', 'reports', 'violations', 'devices', 'settings']) { await go(r); await b.sleep(500); if (await broken()) return false; }
    return true;
  })());

  // ---- a phone
  await b.viewport(390, 800, true);
  await go('dashboard');
  await b.sleep(900);
  const overflow = await b.ev(`document.scrollingElement.scrollWidth - window.innerWidth`);
  check('on a phone the menu is a strip on top and nothing scrolls sideways', overflow <= 1 && await b.ev(`getComputedStyle(document.querySelector('.side')).flexDirection==='row'`), 'overflow ' + overflow);
  await b.shot(path.join(OUT, 'console_6_phone.png'));
  await go('violations');
  await b.sleep(700);
  check('the register fits a phone too', (await b.ev(`document.scrollingElement.scrollWidth - window.innerWidth`)) <= 1);
} catch (e) {
  check('the console script ran to the end', false, String(e.stack || e));
} finally {
  feeding = false;
  await feed;
  b.close();
  finish();
}
