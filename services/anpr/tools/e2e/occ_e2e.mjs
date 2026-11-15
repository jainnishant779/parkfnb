// The bay editor (static/occupancy.html) in a real browser against a real server that already holds a saved
// 5-bay layout for phone-1 and is being sent a 1280x720 picture.   Started for you by run_e2e.py.
//   env: ANPR_URL (default http://127.0.0.1:8123)
import { launch, harness, OUT } from './cdp_lib.mjs';
import path from 'node:path';

const { check, finish } = harness();
const URL_ = process.env.ANPR_URL || 'http://127.0.0.1:8123';
const b = await launch({ port: 9333 });
// wait for a condition rather than for a fixed time: the machine may be busy
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await b.sleep(250); } return false; };
try {
  await b.goto(`${URL_}/occupancy?camera=phone-1`);
  await until(() => b.ev(`typeof img !== 'undefined' && img !== null && Object.keys(bays).length > 0`), 30000);

  // 1. opens with the saved layout, the saved line and the live picture
  const st = await b.ev(`({n:Object.keys(bays).length, line:!!savedLine, img: img? [img.width,img.height]:null,
      note: document.getElementById('layoutNote').textContent, unsaved, chip: document.getElementById('unsavedChip').style.display,
      issues: document.getElementById('issueList').textContent})`);
  check('opens with the 5 saved bays', st.n === 5, JSON.stringify(st.note));
  check('opens with the saved IN/OUT line', st.line === true);
  check('loads the live picture by itself', Array.isArray(st.img) && st.img[0] === 1280, JSON.stringify(st.img));
  check('nothing is marked unsaved on opening', st.unsaved === false && st.chip === 'none');
  check('the real pilot layout shows no issues', st.issues === '', JSON.stringify(st.issues));
  await b.shot(path.join(OUT, 'e2e_1_open.png'));

  // 2. edit mode: drag a corner
  await b.ev(`document.getElementById('btnEdit').click()`);
  const before = await b.ev(`JSON.stringify(bays['3'])`);
  const v0 = JSON.parse(before)[0];
  await b.drag(v0, [v0[0] + 25, v0[1] - 18]);
  const after = JSON.parse(await b.ev(`JSON.stringify(bays['3'])`));
  check('dragging a corner moves only that corner', Math.abs(after[0][0] - (v0[0] + 25)) <= 4 && Math.abs(after[0][1] - (v0[1] - 18)) <= 4 &&
        after[1][0] === JSON.parse(before)[1][0], JSON.stringify(after[0]));
  const s2 = await b.ev(`({unsaved, sel: selectedBay, chip: document.getElementById('unsavedChip').style.display})`);
  check('a change shows "Unsaved changes" and selects the bay', s2.unsaved === true && s2.sel === '3' && s2.chip !== 'none');

  // 3. drag the whole bay, then nudge with the keyboard
  const c4 = await b.ev(`(()=>{const p=bays['4'];return [p.reduce((s,q)=>s+q[0],0)/p.length, p.reduce((s,q)=>s+q[1],0)/p.length]})()`);
  const b4 = JSON.parse(await b.ev(`JSON.stringify(bays['4'])`));
  await b.drag(c4, [c4[0] + 30, c4[1] + 10]);
  const a4 = JSON.parse(await b.ev(`JSON.stringify(bays['4'])`));
  check('dragging inside a bay moves the whole bay', Math.abs(a4[0][0] - b4[0][0] - 30) <= 2 && Math.abs(a4[2][1] - b4[2][1] - 10) <= 2);
  await b.key('ArrowLeft', 'ArrowLeft', { windowsVirtualKeyCode: 37 });
  const n4 = JSON.parse(await b.ev(`JSON.stringify(bays['4'])`));
  check('an arrow key nudges the selected bay by 1 px', Math.abs((a4[0][0] - n4[0][0]) - 1) < 0.01, `${a4[0][0]} -> ${n4[0][0]}`);

  // 4. rename, duplicate, delete
  await b.ev(`document.getElementById('editRename').value='Z9'; document.getElementById('btnRename').click()`);
  const r1 = await b.ev(`({ids:Object.keys(bays), sel:selectedBay})`);
  check('rename keeps the order', JSON.stringify(r1.ids) === '["1","2","3","5","Z9"]' || JSON.stringify(r1.ids) === '["1","2","3","Z9","5"]', JSON.stringify(r1.ids));
  await b.ev(`document.getElementById('editRename').value='1'; document.getElementById('btnRename').click()`);
  check('renaming onto an existing name is refused', b.dialogs.some(d => /already a bay called '1'/.test(d.message)), JSON.stringify(b.dialogs.at(-1)));
  await b.ev(`document.getElementById('btnDuplicate').click()`);
  const d1 = await b.ev(`({ids:Object.keys(bays), sel:selectedBay})`);
  check('duplicate adds a new bay and selects it', d1.ids.length === 6 && d1.sel !== 'Z9', JSON.stringify(d1));
  await b.key('Delete', 'Delete', { windowsVirtualKeyCode: 46 });
  check('the Delete key removes the selected bay', (await b.ev(`Object.keys(bays).length`)) === 5);
  await b.ev(`document.getElementById('btnEdit').click()`);
  await b.shot(path.join(OUT, 'e2e_2_edited.png'));

  // 5. validation: make a bow-tie and try to save it
  await b.ev(`bays['bad'] = [[100,100],[300,100],[100,200],[300,200]]; updateJson(); redraw();`);
  const iss = await b.ev(`document.getElementById('issueList').textContent`);
  check('a crossing outline is reported while drawing', /Bay bad: the outline crosses itself/.test(iss), iss);
  b.dialogs.length = 0;
  await b.ev(`document.getElementById('btnApplyBays').click()`);
  await b.sleep(400);
  check('saving is blocked with the reason', b.dialogs.some(d => /Fix these before saving/.test(d.message) && /crosses itself/.test(d.message)), JSON.stringify(b.dialogs));
  await b.shot(path.join(OUT, 'e2e_3_invalid.png'));
  await b.ev(`delete bays['bad']; updateJson(); redraw();`);

  // 6. the server refuses what the page missed, and keeps the layout
  const refused = await b.ev(`fetch('/occupancy/bays',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({camera_id:'phone-1',bays:{x:[[0,0],[10,10]]}})}).then(async r=>[r.status,(await r.json()).error])`);
  check('the server refuses a bad layout', refused[0] === 400, JSON.stringify(refused));

  // 7. save, then it is backed up and can be restored
  b.dialogs.length = 0;
  await b.ev(`document.getElementById('btnApplyBays').click()`);
  await until(() => b.ev(`unsaved === false`));
  const saved = await b.ev(`({unsaved})`);
  check('Apply to Server saves and clears "Unsaved"', saved.unsaved === false && b.dialogs.some(d => /Saved 5 bays/.test(d.message)), JSON.stringify(b.dialogs.at(-1)));
  const bk = await b.ev(`fetch('/occupancy/bays/backups?camera_id=phone-1').then(r=>r.json())`);
  check('the layout it replaced was kept', bk.backups.length >= 1, JSON.stringify(bk.backups.map(x => x.bays)));
  await b.ev(`document.getElementById('btnBackups').click()`);
  await until(() => b.ev(`document.querySelector('#backupPanel button') !== null`));
  const panel = await b.ev(`document.getElementById('backupPanel').textContent`);
  check('Earlier Layouts lists it', /Restore/.test(panel) && /5 bays/.test(panel), panel.slice(0, 120));
  await b.ev(`document.querySelector('#backupPanel button').click()`);
  await until(() => b.ev(`JSON.stringify(Object.keys(bays)) === '["1","2","3","4","5"]' && unsaved === false`), 15000);
  const restored = await b.ev(`({ids:Object.keys(bays), unsaved})`);
  check('Restore brings the original 5 bays back', JSON.stringify(restored.ids) === '["1","2","3","4","5"]' && restored.unsaved === false, JSON.stringify(restored));

  // 7b. "Check 3D": can parking be judged with these bays?  Nothing is saved; the grades show only while the bays are unchanged
  const serverBays = () => b.ev(`fetch('/occupancy/bays?camera_id=phone-1').then(r=>r.json()).then(j=>JSON.stringify(j.bays))`);
  const nBackups = () => b.ev(`fetch('/occupancy/bays/backups?camera_id=phone-1').then(r=>r.json()).then(j=>j.backups.length)`);
  const savedBefore = await serverBays(), backupsBefore = await nBackups();
  b.dialogs.length = 0;
  await b.ev(`document.getElementById('btnCheck3D').click()`);
  const got3d = await until(async () => /3D (ready|NOT ready)/.test(await b.ev(`document.getElementById('calibPanel').textContent`)), 40000);
  const panel3d = await b.ev(`document.getElementById('calibPanel').textContent`);
  check('Check 3D tells whether parking can be judged, and per bay how accurate each one is', got3d && /(3D ready: \d+ of \d+ bays are good|3D NOT ready: (only \d good bays?, at least \d needed|one camera could not be fitted))/.test(panel3d) && /±\d/.test(panel3d), panel3d.slice(0, 220));
  check('the grades are drawn on the bays while they are unchanged', await b.ev(`calibCheck !== null && JSON.stringify(bays) === calibCheck.snapshot`));
  await b.shot(path.join(OUT, 'e2e_3d_check.png'));
  await b.ev(`bays['1'] = bays['1'].map(p => [p[0] + 3, p[1]]); updateJson(); redraw();`);
  check('...and no longer once a bay has been moved (the old grade would be a lie)', await b.ev(`JSON.stringify(bays) !== calibCheck.snapshot`));
  check('Check 3D saved nothing (the server has the same bays and no new backup)', (await serverBays()) === savedBefore && (await nBackups()) === backupsBefore);
  await b.ev(`bays['1'] = bays['1'].map(p => [p[0] - 3, p[1]]); updateJson(); redraw();`);

  // 8. the row tool under perspective: far stalls narrower than near ones
  await b.ev(`bays = {}; updateJson(); renderBayList(); redraw();`);
  b.answer({ text: '6' }, { text: 'R-' });
  await b.ev(`document.getElementById('btnAutoGrid').click()`);
  for (const p of [[150, 520], [1050, 440], [1050, 540], [120, 690]]) await b.clickCanvas(...p);     // a row, near on the left
  await b.sleep(800);
  const row = JSON.parse(await b.ev(`JSON.stringify(bays)`));
  const ids = Object.keys(row);
  const widths = ids.map(i => Math.max(...row[i].map(p => p[0])) - Math.min(...row[i].map(p => p[0])));
  check('the row tool makes 6 bays with the prefix', ids.length === 6 && ids[0] === 'R-01', JSON.stringify(ids));
  check('near stalls come out wider than far ones (perspective)', widths[0] > widths[5] * 1.01, widths.map(Math.round).join(', '));
  check('every generated bay is valid', (await b.ev(`Object.values(issues).every(v=>v.errors.length===0)`)) === true);
  await b.shot(path.join(OUT, 'e2e_4_row.png'));

  // 9. a bay id is shown as text, never as markup
  await b.ev(`bays['<img src=x onerror=window.__pwned=1>'] = [[10,10],[60,10],[60,60],[10,60]]; updateJson(); renderBayList();`);
  await b.sleep(300);
  check('a bay id is shown as text, never as markup', (await b.ev(`window.__pwned === 1`)) === false);
} catch (e) {
  check('script ran to the end', false, String(e));
} finally {
  b.close();
}
finish();
