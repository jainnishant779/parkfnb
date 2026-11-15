// The operator sign-in page in a real browser, against a real server that has an ID and password set.
//   env: ANPR_URL (default http://127.0.0.1:8123), ANPR_TEST_USER, ANPR_TEST_PASSWORD   (started for you by run_e2e.py)
import { launch, harness, OUT } from './cdp_lib.mjs';
import path from 'node:path';

const { check, finish } = harness();
const base = process.env.ANPR_URL || 'http://127.0.0.1:8123';
const USER = process.env.ANPR_TEST_USER || 'admin';
const PASS = process.env.ANPR_TEST_PASSWORD || '';
const b = await launch({ port: 9337, width: 900, height: 800 });
const text = (sel) => b.ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
const url = () => b.ev(`location.pathname + location.search`);
const submit = async (user, pw) => {
  await b.ev(`document.getElementById('user').value=${JSON.stringify(user)}; document.getElementById('pw').value=${JSON.stringify(pw)}; document.getElementById('f').requestSubmit()`);
  await b.sleep(1500);
};
try {
  await b.goto(`${base}/admin?next=/live%3Fcamera_id%3Dphone-1`);
  check('the sign-in page asks for an ID and a password', /Sign in/.test(await text('h1')) && await b.ev(`document.getElementById('pw').type==='password'`));
  check('the password field is masked and the page shows no secrets', !(await text('body')).includes(PASS));
  await b.shot(path.join(OUT, 'login_1_page.png'));

  await submit(USER, 'not-the-password-123');
  check('a wrong password says so, plainly', /Wrong ID or password/.test(await text('#msg')) && (await url()).startsWith('/admin?'), await url());
  check('and does not say which part was wrong', !/password is|ID is|unknown user|no such/i.test(await text('#msg')));
  await b.shot(path.join(OUT, 'login_2_wrong.png'));

  await submit(USER, PASS);
  check('the right ID and password go on to where you were headed', (await url()) === '/live?camera_id=phone-1', await url());
  const cookies = (await b.send('Network.getAllCookies')).cookies.filter(c => c.name === 'parkfnb_session');
  check('a session cookie is set, HttpOnly, and holds no password', cookies.length === 1 && cookies[0].httpOnly && !cookies[0].value.includes(PASS), JSON.stringify(cookies.map(c => ({ n: c.name, h: c.httpOnly, s: c.secure, same: c.sameSite }))));
  check('the live page now offers Sign out', (await text('#opLink')) === 'Sign out' || await b.ev(`new Promise(r=>setTimeout(()=>r(document.getElementById('opLink').textContent==='Sign out'),2500))`));

  await b.goto(`${base}/admin/logout?next=%2Flive`);
  const after = (await b.send('Network.getAllCookies')).cookies.filter(c => c.name === 'parkfnb_session');
  check('signing out clears the cookie and returns to the live page', after.length === 0 && (await url()).startsWith('/live'), await url());

  // five wrong tries lock the sign-in, even for the right password
  for (let i = 0; i < 5; i++) { await b.goto(`${base}/admin`); await submit(USER, `wrong-password-${i}`); }
  await b.goto(`${base}/admin`);
  await submit(USER, PASS);
  check('after five wrong tries even the right password is refused for a while', /Too many wrong tries/.test(await text('#msg')) && (await url()).includes('error=locked'), await text('#msg'));
  await b.shot(path.join(OUT, 'login_3_locked.png'));
} catch (e) {
  check('script ran to the end', false, String(e));
} finally {
  b.close();
}
finish();
