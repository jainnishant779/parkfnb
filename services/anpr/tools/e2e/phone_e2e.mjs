// The phone's camera page, in a real browser with a fake camera: it must start, list the lenses, send frames, and keep
// sending after the lens is changed.  Started for you by run_e2e.py.
//   env: ANPR_URL (default http://127.0.0.1:8123), ANPR_KEY (camera key, default testkey1234)
import { launch, harness, OUT } from './cdp_lib.mjs';
import path from 'node:path';

const { check, finish } = harness();
const base = process.env.ANPR_URL || 'http://127.0.0.1:8123';
const key = process.env.ANPR_KEY || 'testkey1234';
const b = await launch({ port: 9338, width: 500, height: 900,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await b.sleep(300); } return false; };
const state = async () => (await (await fetch(`${base}/live/state?camera_id=phone-1`)).json());
try {
  await b.goto(`${base}/live/camera?camera_id=phone-1&key=${key}`);
  check('the page opens with a lens picker', await b.ev(`!!document.getElementById('lens')`));
  await b.ev(`document.getElementById('toggle').click()`);
  check('Start camera begins sending frames', await until(async () => (await state()).frames_received >= 2, 25000), `frames ${(await state()).frames_received}`);
  check('the lens list is filled with the phone\'s cameras by name', await until(() => b.ev(`document.getElementById('lens').options.length >= 2`)),
    String(await b.ev(`[...document.getElementById('lens').options].map(o=>o.textContent).join(' | ')`)));
  const before = (await state()).frames_received;
  check('the message says it is sending', await until(() => b.ev(`/Sending/.test(document.getElementById('msg').textContent)`)), await b.ev(`document.getElementById('msg').textContent`));
  await b.shot(path.join(OUT, 'phone_1_sending.png'));

  // change the lens: the camera restarts and frames keep coming
  const second = await b.ev(`(()=>{const s=document.getElementById('lens'); const o=[...s.options].find(o=>o.value); if(!o) return null; s.value=o.value; s.dispatchEvent(new Event('change')); return o.value})()`);
  check('a lens could be chosen', !!second);
  check('and frames keep arriving after the change', await until(async () => (await state()).frames_received >= before + 3, 25000), `before ${before}, now ${(await state()).frames_received}`);
  check('the choice is remembered for the next visit', (await b.ev(`localStorage.getItem('pf.lens')`)) === second);
  check('no error is showing', !(await b.ev(`document.getElementById('msg').classList.contains('err')`)), await b.ev(`document.getElementById('msg').textContent`));

  // a reload carries on by itself, and a lens that no longer exists must not leave the page dead
  await b.ev(`localStorage.setItem('pf.lens','gone-id')`);
  const f0 = (await state()).frames_received;
  await b.goto(`${base}/live/camera?camera_id=phone-1&key=${key}`);                  // no tap on Start camera
  check('after a reload the camera starts again by itself, on the lens that is gone falling back to the phone\'s own', await until(async () => (await state()).frames_received >= f0 + 2, 25000));
  check('the button reads Stop camera', await until(() => b.ev(`document.getElementById('toggle').textContent === 'Stop camera'`)));
  await b.ev(`document.getElementById('toggle').click()`);                           // the user presses Stop
  await b.goto(`${base}/live/camera?camera_id=phone-1&key=${key}`);
  await b.sleep(3000);
  check('after Stop it stays stopped through a reload', await b.ev(`document.getElementById('toggle').textContent === 'Start camera'`));
  await b.shot(path.join(OUT, 'phone_2_fallback.png'));
} catch (e) {
  check('the phone script ran to the end', false, String(e.stack || e));
} finally {
  b.close();
  finish();
}
