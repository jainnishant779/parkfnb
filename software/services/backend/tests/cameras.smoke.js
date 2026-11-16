/**
 * End-to-end smoke test for camera linking and the ANPR access grant:
 * /api/cameras/* (admin inventory + assignment, owner pairing, access-grant).
 *
 * Boots an in-memory MongoDB, mounts the real routers, and drives the requests
 * the admin panel and the owner web dashboard make, including the camelCase ->
 * snake_case transform their API clients apply on the way out.
 *
 * Run: npm run test:cameras
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
};

const toSnake = (obj) => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnake);
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const out = {};
    for (const k of Object.keys(obj)) {
      out[k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())] = toSnake(obj[k]);
    }
    return out;
  }
  return obj;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'smoke-test-secret';
  process.env.JWT_EXPIRE = '7d';
  process.env.NODE_ENV = 'development';
  process.env.ALLOW_DEV_OTP = 'true';
  const GRANT_SECRET = 'smoke-grant-secret-that-is-at-least-32-chars';
  const BASE_ONE = 'https://anpr.example.test';
  const BASE_TWO = 'https://anpr-two.example.test';
  process.env.ANPR_GRANT_SECRET = GRANT_SECRET;
  process.env.ANPR_DEFAULT_BASE_URL = BASE_ONE;
  process.env.ANPR_BASE_URLS = `${BASE_ONE},${BASE_TWO}/`; // trailing slash is tolerated
  process.env.CAMERA_PAIR_RATE_MAX = '1000'; // the limiter is not what this file is about

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('mongo up\n');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/authRoutes'));
  app.use('/api/cameras', require('../src/routes/cameraRoutes'));
  app.use(require('../src/middleware/errorHandler'));

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, p, body, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(base + p, {
      method, headers, body: body ? JSON.stringify(toSnake(body)) : undefined,
    });
    return { status: r.status, json: await r.json() };
  };

  /** Sign a fresh account in through the real OTP flow. */
  const signUp = async (phone, role) => {
    let r = await call('POST', '/api/auth/otp/send', { identifier: phone });
    r = await call('POST', '/api/auth/otp/verify', {
      identifier: phone,
      code: r.json.data.dev_code,
      // Like the owner app: it sends role 'owner' (one word, so the snake_case transform leaves it alone).
      role: role === 'owner' ? 'owner' : 'user',
    });
    return r.json.data;
  };

  const User = require('../src/models/User');
  const Property = require('../src/models/Property');
  const Camera = require('../src/models/Camera');

  const adminAcct = await signUp('9826010001', 'user');
  // The admin role cannot be granted through the API; set it the way scripts/make-admin.js does.
  await User.findByIdAndUpdate(adminAcct.user.id, { user_type: 'admin' });
  const admin = adminAcct.token;

  const ownerA = await signUp('9826010002', 'owner');
  const ownerB = await signUp('9826010003', 'owner');
  const ownerC = await signUp('9826010004', 'owner');
  const renter = await signUp('9826010005', 'user');

  const makeProperty = (owner, name) => Property.create({
    owner_id: owner.owner.id, property_name: name,
    address: '14 Scheme 54', city: 'Indore', state: 'Madhya Pradesh',
    postal_code: '452010', country: 'IN', location_lat: 22.7196, location_lng: 75.8577,
  });
  const propA = await makeProperty(ownerA, 'A Parking');
  const propB = await makeProperty(ownerB, 'B Parking');
  const propB2 = await makeProperty(ownerB, 'B Second Lot');

  const verifyGrant = (token) =>
    jwt.verify(token, GRANT_SECRET, { algorithms: ['HS256'], issuer: 'parkfnb-backend', audience: 'parkfnb-anpr' });
  const grantOf = async (owner) => (await call('POST', '/api/cameras/access-grant', null, owner.token));

  // ------------------------------------------------------------- admin: inventory
  console.log('ADMIN: create and list');
  let r = await call('POST', '/api/cameras/admin', { cameraId: 'cam-a', name: 'Gate camera' });
  ok('creating a camera needs sign-in', r.status === 401, String(r.status));
  r = await call('POST', '/api/cameras/admin', { cameraId: 'cam-a', name: 'Gate camera' }, ownerA.token);
  ok('an owner cannot create cameras', r.status === 403, String(r.status));
  r = await call('POST', '/api/cameras/admin', { cameraId: 'cam-a', name: 'Gate camera' }, admin);
  ok('an admin creates a camera', r.status === 201 && r.json.success, JSON.stringify(r.json));
  ok('it starts unassigned with no owner',
    r.json.data?.status === 'unassigned' && r.json.data?.owner_id === null && r.json.data?.linked_at === null);
  r = await call('POST', '/api/cameras/admin', { cameraId: 'cam-a' }, admin);
  ok('a duplicate id is a 409', r.status === 409, String(r.status));
  r = await call('POST', '/api/cameras/admin', { cameraId: 'bad id!' }, admin);
  ok('an id with spaces or symbols is refused', r.status === 400, String(r.status));
  r = await call('POST', '/api/cameras/admin', { cameraId: 'x'.repeat(33) }, admin);
  ok('an id over 32 characters is refused', r.status === 400, String(r.status));
  r = await call('POST', '/api/cameras/admin', { cameraId: 'cam-evil', anprBaseUrl: 'https://evil.example' }, admin);
  ok('a server outside ANPR_BASE_URLS is refused', r.status === 400, String(r.status));
  r = await call('POST', '/api/cameras/admin', { cameraId: 'cam-c', name: 'Second server', anpr_base_url: BASE_TWO + '/' }, admin);
  ok('an approved second server is accepted, trailing slash trimmed',
    r.status === 201 && r.json.data?.anpr_base_url === BASE_TWO, JSON.stringify(r.json.data));
  r = await call('POST', '/api/cameras/admin', { cameraId: 'cam-b', name: 'Entrance' }, admin);
  ok('a third camera', r.status === 201);

  r = await call('GET', '/api/cameras/admin', null, admin);
  ok('the admin list shows all cameras', r.status === 200 && r.json.data?.cameras?.length === 3, JSON.stringify(r.json).slice(0, 200));
  ok('...with the properties to pick from', r.json.data?.properties?.length === 3);
  ok('...and the approved servers', r.json.data?.anpr_base_urls?.includes(BASE_ONE) && r.json.data?.anpr_base_urls?.includes(BASE_TWO));
  r = await call('GET', '/api/cameras/admin', null, ownerA.token);
  ok('an owner cannot read the admin list', r.status === 403, String(r.status));

  // ------------------------------------------------------------- admin: assignment
  console.log('\nADMIN: assignment');
  r = await call('PUT', '/api/cameras/admin/cam-a/assignment', { propertyId: propA._id.toString() }, admin);
  ok('assigning a camera to a property works', r.status === 200 && r.json.success, JSON.stringify(r.json).slice(0, 200));
  ok('the owner comes from the property', r.json.data?.owner_id?._id === ownerA.owner.id, JSON.stringify(r.json.data?.owner_id));
  ok('it is active, linked by an admin, with a since time',
    r.json.data?.status === 'active' && r.json.data?.linked_via === 'admin' && !!r.json.data?.linked_at);
  const linkedAtA = new Date(r.json.data.linked_at);
  r = await call('PUT', '/api/cameras/admin/cam-a/assignment', { propertyId: 'nope' }, admin);
  ok('a malformed property id is a 400', r.status === 400, String(r.status));
  r = await call('PUT', '/api/cameras/admin/cam-a/assignment', { propertyId: new mongoose.Types.ObjectId().toString() }, admin);
  ok('an unknown property is a 404', r.status === 404, String(r.status));
  r = await call('PUT', '/api/cameras/admin/nope/assignment', { propertyId: propA._id.toString() }, admin);
  ok('an unknown camera is a 404', r.status === 404, String(r.status));

  // ------------------------------------------------------------- admin: pairing code
  console.log('\nADMIN: pairing code');
  r = await call('POST', '/api/cameras/admin/cam-a/pairing-code', null, admin);
  ok('no code for a camera that already has an owner', r.status === 409, String(r.status));
  r = await call('POST', '/api/cameras/admin/cam-b/pairing-code', null, admin);
  ok('a code for an unowned camera', r.status === 200 && r.json.success, JSON.stringify(r.json));
  const code1 = r.json.data?.code;
  ok('looks like xxxxx-xxxxx from the safe alphabet', /^[a-hj-km-np-z2-9]{5}-[a-hj-km-np-z2-9]{5}$/.test(code1 || ''), code1);
  ok('expires in about 7 days',
    Math.abs(new Date(r.json.data?.expires_at) - (Date.now() + 7 * 864e5)) < 60e3);
  r = await call('GET', '/api/cameras/admin', null, admin);
  const camB = r.json.data.cameras.find((c) => c.camera_id === 'cam-b');
  ok('the list says a code is waiting', camB?.pairing_pending === true);
  ok('...but never contains the code or its hash',
    !JSON.stringify(r.json).includes('code_hash') && !JSON.stringify(r.json).includes(code1));
  const stored = await Camera.findOne({ camera_id: 'cam-b' }).select('+pairing.code_hash');
  ok('only a hash is stored', stored.pairing.code_hash?.length === 64 && !stored.pairing.code_hash.includes(code1.replace('-', '')));

  // ------------------------------------------------------------- owner: list
  console.log('\nOWNER: my cameras');
  r = await call('GET', '/api/cameras/mine', null, ownerA.token);
  ok('an owner sees their camera', r.status === 200 && r.json.data?.length === 1 && r.json.data[0].camera_id === 'cam-a', JSON.stringify(r.json));
  ok('...with the property name', r.json.data?.[0]?.property_id?.property_name === 'A Parking');
  ok('...and no pairing data', !('pairing' in (r.json.data?.[0] || {})) && !JSON.stringify(r.json).includes('code_hash'));
  r = await call('GET', '/api/cameras/mine', null, ownerB.token);
  ok('another owner sees none of it', r.status === 200 && r.json.data?.length === 0, JSON.stringify(r.json));
  r = await call('GET', '/api/cameras/mine', null, renter.token);
  ok('a renter is refused', r.status === 403, String(r.status));
  r = await call('GET', '/api/cameras/mine', null, admin);
  ok('an admin has no Owner record and is refused', r.status === 403, String(r.status));
  r = await call('GET', '/api/cameras/mine');
  ok('signing in is required', r.status === 401, String(r.status));

  // ------------------------------------------------------------- owner: pairing
  console.log('\nOWNER: pairing');
  const pair = (owner, cameraId, pairingCode, propertyId) =>
    call('POST', '/api/cameras/pair', { cameraId, pairingCode, propertyId: propertyId.toString() }, owner.token);

  r = await pair(ownerB, 'cam-b', 'abcde-fghjk', propB._id);
  const failMessage = r.json.error?.message;
  ok('a wrong code is refused', r.status === 400 && !r.json.success, JSON.stringify(r.json));
  r = await pair(ownerB, 'no-such-cam', code1, propB._id);
  ok('an unknown camera answers exactly like a wrong code', r.status === 400 && r.json.error?.message === failMessage, JSON.stringify(r.json));
  r = await pair(ownerB, 'cam-a', code1, propB._id);
  ok('so does a camera someone else owns', r.status === 400 && r.json.error?.message === failMessage, JSON.stringify(r.json));
  r = await call('POST', '/api/cameras/pair', { cameraId: 'cam-b', pairingCode: code1 }, ownerB.token);
  ok('a property is required', r.status === 400, String(r.status));
  r = await call('POST', '/api/cameras/pair', { cameraId: 'cam-b', pairingCode: 'short', propertyId: propB._id.toString() }, ownerB.token);
  ok('a code of the wrong length is refused', r.status === 400, String(r.status));
  r = await pair(ownerB, 'cam-b', code1, propA._id);
  ok('another owner\'s property cannot be used', r.status === 403, String(r.status));

  for (let i = 0; i < 4; i++) await pair(ownerB, 'cam-b', 'zzzzz-zzzzz', propB._id); // wrong try #2..#5 (one was above)
  r = await pair(ownerB, 'cam-b', code1, propB._id);
  ok('five wrong tries burn the code, even for the right one', r.status === 400, JSON.stringify(r.json));
  r = await call('GET', '/api/cameras/admin', null, admin);
  ok('...and the list no longer shows a waiting code', r.json.data.cameras.find((c) => c.camera_id === 'cam-b')?.pairing_pending === false);

  r = await call('POST', '/api/cameras/admin/cam-b/pairing-code', null, admin);
  const code2 = r.json.data.code;
  ok('an admin can make a fresh code', code2 && code2 !== code1);
  const messy = code2.toUpperCase().replace('-', '  ');
  r = await pair(ownerB, 'cam-b', messy, propB._id);
  ok('the right code pairs, however it is typed', r.status === 200 && r.json.success, JSON.stringify(r.json));
  ok('the camera is now owner B\'s, linked by pairing',
    r.json.data?.owner_id === ownerB.owner.id && r.json.data?.linked_via === 'pairing' && r.json.data?.status === 'active',
    JSON.stringify(r.json.data));
  r = await pair(ownerA, 'cam-b', code2, propA._id);
  ok('the code works once: another owner cannot reuse it', r.status === 400, JSON.stringify(r.json));
  r = await pair(ownerB, 'cam-b', 'whatever-xx', propB2._id);
  ok('pairing a camera that is already yours is a harmless 200', r.status === 200, JSON.stringify(r.json));
  r = await call('GET', '/api/cameras/mine', null, ownerB.token);
  ok('it shows in B\'s list', r.json.data?.some((c) => c.camera_id === 'cam-b'));

  // two owners racing for the same fresh code: exactly one wins
  await call('POST', '/api/cameras/admin', { cameraId: 'cam-d' }, admin);
  r = await call('POST', '/api/cameras/admin/cam-d/pairing-code', null, admin);
  const codeD = r.json.data.code;
  const raced = await Promise.all([pair(ownerA, 'cam-d', codeD, propA._id), pair(ownerB, 'cam-d', codeD, propB._id)]);
  ok('a code is single-use even when two requests race',
    raced.map((x) => x.status).sort().join() === '200,400', raced.map((x) => x.status).join());
  // Whoever won, hand it back so the grant checks below start from a known state.
  r = await call('PUT', '/api/cameras/admin/cam-d/assignment', { propertyId: null }, admin);
  ok('(the winner\'s camera is unassigned again)', r.status === 200 && r.json.data?.owner_id === null);

  // an expired code
  await call('POST', '/api/cameras/admin', { cameraId: 'cam-e' }, admin);
  r = await call('POST', '/api/cameras/admin/cam-e/pairing-code', null, admin);
  const codeE = r.json.data.code;
  await Camera.updateOne({ camera_id: 'cam-e' }, { $set: { 'pairing.expires_at': new Date(Date.now() - 1000) } });
  r = await pair(ownerC, 'cam-e', codeE, (await makeProperty(ownerC, 'C Parking'))._id);
  ok('an expired code is refused', r.status === 400, JSON.stringify(r.json));

  // ------------------------------------------------------------- the grant
  console.log('\nACCESS GRANT');
  r = await call('POST', '/api/cameras/access-grant');
  ok('needs sign-in', r.status === 401, String(r.status));
  r = await call('POST', '/api/cameras/access-grant', null, renter.token);
  ok('a renter is refused', r.status === 403, String(r.status));

  const cameraA = await Camera.findOne({ camera_id: 'cam-a' });
  r = await grantOf(ownerA);
  ok('owner A gets a grant', r.status === 200 && r.json.success, JSON.stringify(r.json).slice(0, 300));
  let g = r.json.data?.grants?.[0];
  ok('one server, with just that camera listed',
    r.json.data?.grants?.length === 1 && g?.anpr_base_url === BASE_ONE
    && g?.cameras?.length === 1 && g?.cameras?.[0]?.camera_id === 'cam-a', JSON.stringify(r.json.data?.grants));
  const camAEntry = g?.cameras?.find((c) => c.camera_id === 'cam-a');
  ok('...with its name and property', camAEntry?.name === 'Gate camera' && camAEntry?.property_name === 'A Parking', JSON.stringify(camAEntry));
  ok('refresh_after_s is two thirds of the lifetime', r.json.data?.refresh_after_s === 600);
  let claims;
  try { claims = verifyGrant(g.token); } catch (e) { claims = null; }
  ok('the token verifies with the shared secret, HS256, issuer and audience', !!claims);
  ok('...and says who: the owner, scope owner, no personal data',
    claims?.oid === ownerA.owner.id && claims?.sub === ownerA.user.id && claims?.scope === 'owner'
    && !('name' in claims) && !('email' in claims) && !('phone' in claims), JSON.stringify(claims));
  ok('...lives 15 minutes', claims?.exp - claims?.iat === 900, String(claims?.exp - claims?.iat));
  ok('...and carries each camera\'s since time',
    claims?.cams?.['cam-a'] === Math.floor(cameraA.linked_at.getTime() / 1000), JSON.stringify(claims?.cams));
  ok('...of the right cameras only', !('cam-b' in (claims?.cams || {})));
  let rejected = false;
  try { jwt.verify(g.token, 'smoke-test-secret'); } catch (e) { rejected = true; }
  ok('the sign-in secret does not verify it (separate secret)', rejected);

  r = await grantOf(ownerC);
  ok('an owner with no cameras gets no grants and no token', r.status === 200 && r.json.data?.grants?.length === 0, JSON.stringify(r.json));

  // a second ANPR server gets its own grant
  r = await call('PUT', '/api/cameras/admin/cam-c/assignment', { propertyId: propA._id.toString() }, admin);
  r = await grantOf(ownerA);
  ok('cameras on two servers get one grant each',
    r.json.data?.grants?.length === 2
    && r.json.data.grants.find((x) => x.anpr_base_url === BASE_TWO)?.cameras?.[0]?.camera_id === 'cam-c',
    JSON.stringify(r.json.data?.grants?.map((x) => [x.anpr_base_url, x.cameras.map((c) => c.camera_id)])));
  const grantTwo = r.json.data.grants.find((x) => x.anpr_base_url === BASE_TWO);
  ok('...and each token lists only its own server\'s cameras',
    Object.keys(verifyGrant(grantTwo.token).cams).join() === 'cam-c');

  // disabling
  r = await call('PATCH', '/api/cameras/admin/cam-c', { status: 'disabled' }, admin);
  ok('an admin can disable a camera', r.status === 200 && r.json.data?.status === 'disabled', JSON.stringify(r.json).slice(0, 200));
  r = await grantOf(ownerA);
  ok('a disabled camera is left out of the grant', r.json.data?.grants?.length === 1 && !JSON.stringify(r.json.data).includes('cam-c'));
  r = await call('GET', '/api/cameras/mine', null, ownerA.token);
  ok('...but still shows in the owner\'s list', r.json.data?.some((c) => c.camera_id === 'cam-c'));
  r = await call('PATCH', '/api/cameras/admin/cam-c', { status: 'active' }, admin);
  ok('and can be switched back on', r.status === 200 && r.json.data?.status === 'active');
  r = await call('PATCH', '/api/cameras/admin/cam-e', { status: 'active' }, admin);
  ok('a camera with no owner cannot be made active', r.status === 400, String(r.status));
  r = await call('PATCH', '/api/cameras/admin/cam-a', { name: 'Main gate' }, admin);
  ok('a camera can be renamed', r.status === 200 && r.json.data?.name === 'Main gate');

  // never send a pass to an address nobody approved
  await Camera.updateOne({ camera_id: 'cam-a' }, { $set: { anpr_base_url: 'https://evil.example' } });
  r = await grantOf(ownerA);
  ok('a camera pointing at an unapproved server is left out', !JSON.stringify(r.json.data).includes('cam-a'), JSON.stringify(r.json.data?.grants?.map((x) => x.anpr_base_url)));
  await Camera.updateOne({ camera_id: 'cam-a' }, { $set: { anpr_base_url: null } });

  // ------------------------------------------------------------- reassigning
  console.log('\nREASSIGNING (the "since" time)');
  await sleep(1100); // so a new since time differs by a whole second
  r = await call('PUT', '/api/cameras/admin/cam-a/assignment', { propertyId: propB._id.toString() }, admin);
  ok('an admin moves the camera to another owner', r.status === 200 && r.json.data?.owner_id?._id === ownerB.owner.id, JSON.stringify(r.json).slice(0, 200));
  const linkedAtB = new Date(r.json.data.linked_at);
  ok('...which starts a new since time', linkedAtB.getTime() > linkedAtA.getTime());
  r = await grantOf(ownerA);
  ok('owner A\'s grant no longer has it', !JSON.stringify(r.json.data).includes('cam-a'));
  r = await grantOf(ownerB);
  const claimsB = verifyGrant(r.json.data.grants[0].token);
  ok('owner B\'s grant has it, with the new since time (not A\'s old one)',
    claimsB.cams['cam-a'] === Math.floor(linkedAtB.getTime() / 1000) && claimsB.cams['cam-a'] > Math.floor(linkedAtA.getTime() / 1000),
    JSON.stringify(claimsB.cams));
  await sleep(1100);
  r = await call('PUT', '/api/cameras/admin/cam-a/assignment', { propertyId: propB2._id.toString() }, admin);
  ok('moving it between the same owner\'s properties keeps the since time',
    r.status === 200 && new Date(r.json.data.linked_at).getTime() === linkedAtB.getTime(), JSON.stringify(r.json.data?.linked_at));
  ok('...and updates the property', r.json.data?.property_id?.property_name === 'B Second Lot');

  // ------------------------------------------------------------- unpair / unassign / delete
  console.log('\nUNPAIR, UNASSIGN, DELETE');
  r = await call('DELETE', '/api/cameras/cam-b/unpair', null, ownerA.token);
  ok('an owner cannot unpair someone else\'s camera (404, as if missing)', r.status === 404, String(r.status));
  r = await call('DELETE', '/api/cameras/no-such/unpair', null, ownerA.token);
  const missing = r.json.error?.message;
  r = await call('DELETE', '/api/cameras/cam-b/unpair', null, ownerA.token);
  ok('...the same answer as for a camera that does not exist', r.json.error?.message === missing);
  r = await call('DELETE', '/api/cameras/cam-b/unpair', null, ownerB.token);
  ok('the owner can unpair their own', r.status === 200 && r.json.data?.status === 'unassigned' && r.json.data?.owner_id === null, JSON.stringify(r.json));
  r = await call('GET', '/api/cameras/mine', null, ownerB.token);
  ok('it leaves their list', !r.json.data?.some((c) => c.camera_id === 'cam-b'));
  r = await call('DELETE', '/api/cameras/admin/cam-a', null, admin);
  ok('an owned camera cannot be deleted', r.status === 409, String(r.status));
  r = await call('PUT', '/api/cameras/admin/cam-a/assignment', { propertyId: null }, admin);
  ok('an admin can unassign it', r.status === 200 && r.json.data?.status === 'unassigned' && r.json.data?.linked_at === null, JSON.stringify(r.json).slice(0, 200));
  r = await call('DELETE', '/api/cameras/admin/cam-a', null, admin);
  ok('an unowned camera can be deleted', r.status === 200 && r.json.data?.deleted === true);
  r = await call('DELETE', '/api/cameras/admin/cam-a', null, admin);
  ok('deleting it again is a 404', r.status === 404, String(r.status));

  // ------------------------------------------------------------- guards on the grant
  console.log('\nGRANT GUARDS');
  await call('POST', '/api/cameras/admin', { cameraId: 'cam-g' }, admin);
  await call('PUT', '/api/cameras/admin/cam-g/assignment', { propertyId: propA._id.toString() }, admin);
  process.env.ANPR_GRANT_SECRET = 'too-short';
  r = await grantOf(ownerA);
  ok('a secret under 32 characters is refused (503)', r.status === 503, String(r.status));
  delete process.env.ANPR_GRANT_SECRET;
  r = await grantOf(ownerA);
  ok('no secret at all is a 503', r.status === 503, String(r.status));
  process.env.ANPR_GRANT_SECRET = GRANT_SECRET;

  // In production, no pass while the fixed test sign-in code can still work.
  process.env.NODE_ENV = 'production';
  r = await grantOf(ownerA);
  ok('production with no test sign-in: the grant works', r.status === 200, String(r.status));
  process.env.ALLOW_TEST_OTP_IN_PRODUCTION = 'true';
  r = await grantOf(ownerA);
  ok('production with the test sign-in switched on: refused (503)', r.status === 503, String(r.status));
  process.env.ANPR_GRANT_ALLOW_TEST_LOGIN = 'true';
  r = await grantOf(ownerA);
  ok('...unless that is overridden on purpose', r.status === 200, String(r.status));
  delete process.env.ANPR_GRANT_ALLOW_TEST_LOGIN;
  delete process.env.ALLOW_TEST_OTP_IN_PRODUCTION;
  process.env.NODE_ENV = 'development';

  console.log(`\n${pass} passed, ${fail} failed`);
  await server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
