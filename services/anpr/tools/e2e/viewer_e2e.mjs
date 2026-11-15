// The public viewer (static/live.html) in a real browser, against a mock server, in every situation it must handle.
//   node tools/e2e/viewer_e2e.mjs            (after: python tools/e2e/make_fixtures.py)
import { launch, harness, OUT } from './cdp_lib.mjs';
import { start } from './mock_viewer.mjs';
import path from 'node:path';

const { check, finish } = harness();
const srv = await start(8130);
const b = await launch({ port: 9334, width: 1440, height: 1000 });
const base = 'http://127.0.0.1:8130';
const set = async (name, delay = 0) => { await fetch(`${base}/__set?name=${name}&delay=${delay}`); };
const text = (sel) => b.ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const visible = (sel) => b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});return !!e && !e.hidden && e.offsetParent!==null;})()`);
const load = async (name, query = '', w = 1440, h = 1000, mobile = false) => {
  await set(name);
  await b.viewport(w, h, mobile);
  await b.goto(`${base}/live${query}`);
  const noPicture = name === 'notstarted' || name === 'nobays';
  for (let i = 0; i < 40; i++) {                       // until the first answer has been drawn
    if (await b.ev(`!document.body.classList.contains('loading') && (${noPicture} || document.getElementById('frame').naturalWidth > 0)`)) break;
    await b.sleep(150);
  }
  await b.sleep(400);
};
const shot = (n) => b.shot(path.join(OUT, `viewer_${n}.png`));
const click = (expr) => b.ev(`${expr}.dispatchEvent(new MouseEvent('click',{bubbles:true}))`);

try {
  // ---- live, mixed
  await load('live');
  check('the status pill says Live', /^Live/.test(await text('#status')), await text('#status'));
  const k = await b.ev(`['k-total','k-occ','k-vac','k-unc'].map(i=>document.getElementById(i).textContent)`);
  check('KPI cards: 5 total, 2 occupied, 2 available, 1 unclear', JSON.stringify(k) === '["5","2","2","1"]', JSON.stringify(k));
  const sub = await b.ev(`['s-occ','s-unc'].map(i=>document.getElementById(i).textContent)`);
  check('occupancy % is of the bays reporting; the unclear card says how many', sub[0] === '40% (1 parked over line)' && sub[1] === '1 bay(s) obscured', JSON.stringify(sub));
  const legend = await b.ev(`[...document.querySelectorAll('#legend .dot')].map(d=>d.parentNode.textContent)`);
  check('the legend adds up to the total bays', legend.reduce((s, t) => s + Number((/\((\d+)\)/.exec(t) || [0, 0])[1]), 0) === 5, JSON.stringify(legend));
  check('the map has all 5 bays', (await b.ev(`document.querySelectorAll('#stage .bay-poly').length`)) === 5);
  const cls = await b.ev(`[...document.querySelectorAll('#stage .bay-poly')].map(e=>e.getAttribute('class').replace('bay-poly ','').trim())`);
  check('bay colours follow status (vacant, occupied, occupied, uncertain, vacant)', JSON.stringify(cls) === '["vacant","occupied","occupied","uncertain","vacant"]', JSON.stringify(cls));
  check('a badly parked bay is marked with a flag on the map', (await b.ev(`[...document.querySelectorAll('#stage .bay-flag')].map(e=>e.getAttribute('opacity'))`)).join() === '0,0,1,0,0');
  check('no gate card when there is no IN/OUT line', !(await visible('#gateCard')));
  check('no operator buttons for a visitor', !(await visible('#detail .ops')));
  check('the camera picture is shown', await b.ev(`document.getElementById('frame').naturalWidth>0`));
  const chips = await b.ev(`[...document.querySelectorAll('#health .hc')].map(c=>c.textContent)`);
  check('the health strip shows stream, age, speed, latency, light, view', chips.length === 6 && /Live/.test(chips[0]) && /147 ms/.test(chips[3]) && /In place/.test(chips[5]), JSON.stringify(chips));
  check('the timeline lists feed events as well as bay events', await b.ev(`/Camera went offline/.test(document.getElementById('events').textContent) && /Too dark to judge/.test(document.getElementById('events').textContent) && /marked available/.test(document.getElementById('events').textContent)`));
  check('no banner while everything is fine', !(await visible('#banner')));
  await shot('1_live');

  // ---- picking a bay: from the map, the list and the camera
  await click(`document.querySelectorAll('#stage .bay-poly')[2]`);
  const d1 = await text('#detail');
  check('picking P3 on the map shows its details', /Bay P3/.test(d1) && /Occupied/.test(d1) && /Parked badly/.test(d1) && /Since/.test(d1) && /recent readings agree/.test(d1), d1.slice(0, 120));
  await b.ev(`document.getElementById('tab-list').click()`);
  await b.sleep(300);
  check('the list view shows the same selection', await b.ev(`document.querySelector('#stage .lcard.sel')!==null && /P3/.test(document.querySelector('#stage .lcard.sel').textContent)`));
  await b.ev(`document.querySelectorAll('#stage .lcard')[3].click()`);
  check('picking P4 (not read yet, so unclear) from the list', /Bay P4/.test(await text('#detail')) && /Waiting for the first reading/.test(await text('#detail')));
  await click(`document.querySelector('#hit polygon[data-id="1"]')`);
  check('picking P1 by clicking the camera picture', /Bay P1/.test(await text('#detail')) && /Free/.test(await text('#detail')));
  check('the picked bay is highlighted on the camera', await b.ev(`document.querySelector('#hit polygon.sel')?.getAttribute('data-id')==='1'`));
  await click(`document.querySelector('#hit polygon[data-id="1"]')`);
  check('picking it again lets go', /No bay selected/.test(await text('#detail')));
  await b.ev(`document.getElementById('tab-map').click()`);

  // ---- how the cars are parked, judged in 3D: only on solid evidence
  await load('parking');
  const sub3 = await text('#s-occ');
  check('the occupied card says how many are parked correctly / over the line / close', sub3 === '80% · 1 parked correctly · 1 over the line · 1 close to the line', sub3);
  const lg3 = await text('#legend');
  check('the legend says how the occupied bays are parked, including those not judged', /of the occupied: 1 correct, 1 over the line, 1 close to the line, 1 not judged/.test(lg3), lg3);
  const marks = await b.ev(`[...document.querySelectorAll('#stage .bay-flag')].map(e=>e.getAttribute('opacity')==='1' ? e.textContent+':'+e.getAttribute('class').replace('bay-flag v-','') : '')`);
  check('the map marks ✓ correct, ! over the line, ! close, ? not judged (nothing on the empty bay)', JSON.stringify(marks) === '["","✓:correct","!:over_line","!:close_to_line","?:not_judged"]', JSON.stringify(marks));
  await click(`document.querySelectorAll('#stage .bay-poly')[1]`);
  const d2 = await text('#detail');
  check('a correctly parked bay shows the distances to its lines', /Parked correctly/.test(d2) && /0\.42 m to the left line, 0\.50 m to the right line/.test(d2) && /Good \(about ±0\.12 m\)/.test(d2), d2.slice(0, 200));
  await click(`document.querySelectorAll('#stage .bay-poly')[2]`);
  const d3 = await text('#detail');
  check('an over-the-line bay says by how much and on which side', /Over the line/.test(d3) && /Over the left line by 0\.25 m/.test(d3), d3.slice(0, 160));
  await click(`document.querySelectorAll('#stage .bay-poly')[3]`);
  const d4 = await text('#detail');
  check('a slanted car shows the angle and that the bay is only roughly calibrated', /Close to the line/.test(d4) && /21° to the bay/.test(d4) && /Degraded \(about ±0\.22 m\)/.test(d4), d4.slice(0, 220));
  await click(`document.querySelectorAll('#stage .bay-poly')[4]`);
  const d5 = await text('#detail');
  check('a bay with no outline of the car is "not judged", never "parked badly"', /Parking not judged/.test(d5) && /waiting for a clear outline/.test(d5) && !/badly|Over the line/.test(d5), d5.slice(0, 200));
  check('the timeline has the parking events in plain words', /P3 parked over the line/.test(await text('#events')) && /Over the left line by 0\.25 m/.test(await text('#events')) && /P2 parked correctly again/.test(await text('#events')));
  check('a visitor does not see the 3D chip', !/3D/.test(await text('#health')));
  await shot('7_parking');
  await load('parking_admin');
  check('the operator sees whether the 3D camera is ready', /3DReady · 4\/5 bays good/.test(await text('#health')), await text('#health'));

  // ---- admin: operator review
  await load('admin');
  await click(`document.querySelectorAll('#stage .bay-poly')[3]`);
  check('an admin sees the operator buttons', await visible('#detail .ops'));
  await b.ev(`[...document.querySelectorAll('#detail .ops button')].find(x=>/Mark occupied/.test(x.textContent)).click()`);
  await b.sleep(600);
  const posts = await (await fetch(`${base}/__posts`)).json();
  check('Mark occupied posts the right request', posts.length === 1 && posts[0].bay_id === '4' && posts[0].status === 'OCCUPIED' && posts[0].camera_id === 'phone-1' && posts[0].minutes === 15, JSON.stringify(posts));
  await shot('2_admin');

  // ---- night
  await load('night');
  check('night: banner explains the unclear bays', /Night mode/.test(await text('#banner')), await text('#banner'));
  const nk = await b.ev(`['k-occ','k-vac','k-unc'].map(i=>document.getElementById(i).textContent)`);
  check('night: nothing is called available; the bays with no car seen are unclear', nk[1] === '0' && nk[2] === '2', JSON.stringify(nk));
  check('night: the picture is tagged', await visible('#cam-note'));
  await shot('3_night');

  // ---- no signal
  for (const [name, pill, banner] of [['offline', 'Camera offline', 'last known state'], ['stalled', 'Processing stalled', 'nothing is being processed'], ['error', 'Processing error', 'could not be processed']]) {
    await load(name);
    check(`${name}: pill and banner`, (await text('#status')) === pill && new RegExp(banner).test(await text('#banner')), await text('#status'));
    check(`${name}: numbers are dimmed and the picture greyed`, await b.ev(`document.getElementById('kpis').classList.contains('dim') && document.getElementById('cam').classList.contains('stale')`));
    check(`${name}: the last known numbers are kept, not zeroed`, (await b.ev(`['k-occ','k-vac'].map(i=>document.getElementById(i).textContent).join()`)) === '2,2');
    check(`${name}: bays show "No signal" and no raw error text leaks`, (await b.ev(`document.querySelectorAll('#stage .bay-poly.stale').length`)) === 5 && !/boom|RuntimeError/.test(await text('body')));
  }
  await load('offline'); await shot('4_offline');

  // ---- moved camera, not started, no bays, gate
  await load('moved');
  check('moved: banner says the layout needs a check', /view has changed/.test(await text('#banner')) && /Moved/.test(await text('#health')));
  await load('notstarted');
  check('not started: says so', /not started/.test(await text('#status')) && /Waiting for the camera/.test(await text('#stage')) && /^–$/.test(await text('#k-total')));
  await load('nobays');
  check('no bays: "Layout not set up"', /Layout not set up/.test(await text('#stage')));
  await load('gate');
  check('gate card appears once a line is set', (await visible('#gateCard')) && (await b.ev(`['g-in','g-out','g-inside'].map(i=>document.getElementById(i).textContent).join()`)) === '12,7,5');

  // ---- the server goes away and comes back
  await load('live');
  await set('down');
  await fetch(`${base}/__hits`);
  await b.sleep(9000);
  const hits = Number(await (await fetch(`${base}/__hits`)).text());
  check('server down: says so and keeps the last numbers', /unreachable/.test(await text('#status')) && /Cannot reach the server/.test(await text('#banner')) && (await text('#k-total')) === '5');
  check('server down: it backs off instead of hammering (about 4 tries in 9 s, not 6)', hits >= 2 && hits <= 5, `hits=${hits}`);
  await set('live');
  await b.sleep(13500);
  check('server back: recovers by itself', /^Live/.test(await text('#status')) && !(await visible('#banner')));
  await load('live');
  await set('live', 10000);
  await b.sleep(11500);
  check('a request that never answers is given up on after 8 s', /unreachable/.test(await text('#status')), await text('#status'));
  await set('live');

  // ---- sizes
  await load('live', '', 820, 1100);
  check('tablet: one column, no sideways scroll', await b.ev(`document.documentElement.scrollWidth <= window.innerWidth`));
  await load('live', '', 390, 844, true);
  const m = await b.ev(`({sw: document.documentElement.scrollWidth, iw: window.innerWidth, cam: document.getElementById('cam').getBoundingClientRect().top, kp: document.getElementById('kpis').getBoundingClientRect().top})`);
  check('phone: no sideways scroll', m.sw <= m.iw, JSON.stringify(m));
  check('phone: the camera comes before the numbers', m.cam < m.kp, JSON.stringify(m));
  const order = await b.ev(`['cam','kpis','stage','detail','events'].map(i=>document.getElementById(i).getBoundingClientRect().top)`);
  check('phone: camera, numbers, zone, selected bay, activity — in that order', order.every((v, i) => i === 0 || v > order[i - 1]), JSON.stringify(order.map(Math.round)));
  await shot('5_phone');
  await load('live', '', 1440, 1000);
  await b.ev(`document.getElementById('tab-list').click()`);
  await shot('6_list');
} catch (e) {
  check('script ran to the end', false, String(e));
} finally {
  b.close(); srv.close();
}
finish();
