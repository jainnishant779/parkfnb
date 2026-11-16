/**
 * End-to-end smoke test for the new OTP auth flow.
 * Boots an in-memory MongoDB, starts the real Express app, and drives the
 * exact requests the two mobile apps make.
 */
const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
};

(async () => {
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'smoke-test-secret';
  process.env.JWT_EXPIRE = '7d';
  process.env.NODE_ENV = 'development';
  // dev_code is now behind an explicit flag, not NODE_ENV alone.
  process.env.ALLOW_DEV_OTP = 'true';

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('mongo up\n');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/authRoutes'));
  app.use(require('../src/middleware/errorHandler'));

  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const call = async (method, p, body, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(base + p, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json() };
  };

  // ---------------------------------------------------------- consumer flow
  console.log('CONSUMER APP');
  let r = await call('POST', '/api/auth/otp/send', { identifier: '9826012345', channel: 'sms' });
  ok('otp/send accepts a 10-digit number', r.status === 200 && r.json.success, JSON.stringify(r.json));
  ok('returns channel + expires_in', r.json.data?.channel === 'sms' && r.json.data?.expires_in > 0);
  const code1 = r.json.data?.dev_code;
  ok('dev_code exposed outside production', !!code1);

  r = await call('POST', '/api/auth/otp/send', { identifier: '12345' });
  ok('rejects a malformed number', r.status === 400, JSON.stringify(r.json));

  r = await call('POST', '/api/auth/otp/verify', { identifier: '9826012345', code: '000000', role: 'user' });
  ok('wrong code is rejected', r.status === 400 && !r.json.success);

  r = await call('POST', '/api/auth/otp/verify', { identifier: '9826012345', code: code1, role: 'user' });
  ok('correct code signs in', r.status === 200 && r.json.success, JSON.stringify(r.json));
  const consumer = r.json.data || {};
  ok('is_new_user true on first sign-in', consumer.is_new_user === true);
  ok('returns a token', typeof consumer.token === 'string' && consumer.token.length > 20);
  ok('user_type is user', consumer.user?.user_type === 'user');
  ok('owner is null for a consumer', consumer.owner === null);
  ok('onboarding_step starts at profile_setup', consumer.user?.onboarding_step === 'profile_setup');

  r = await call('POST', '/api/auth/otp/verify', { identifier: '9826012345', code: code1, role: 'user' });
  ok('code cannot be replayed', r.status === 400, JSON.stringify(r.json));

  r = await call('GET', '/api/auth/me', null, consumer.token);
  ok('/me works with the token', r.status === 200 && r.json.success);
  ok('/me returns { user, owner }', r.json.data?.user && 'owner' in (r.json.data || {}));

  // returning user
  r = await call('POST', '/api/auth/otp/send', { identifier: '9826012345' });
  const code2 = r.json.data?.dev_code;
  r = await call('POST', '/api/auth/otp/verify', { identifier: '9826012345', code: code2, role: 'user' });
  ok('returning user is not new', r.json.data?.is_new_user === false);

  // ---------------------------------------------------------- owner flow
  console.log('\nOWNER APP');
  r = await call('POST', '/api/auth/otp/send', { identifier: '9826099999', channel: 'sms' });
  const ocode = r.json.data?.dev_code;
  r = await call('POST', '/api/auth/otp/verify', {
    identifier: '9826099999', code: ocode, ownerType: 'individual', termsAccepted: true,
  });
  ok('owner sign-up succeeds', r.status === 200 && r.json.success, JSON.stringify(r.json));
  const owner = r.json.data || {};
  ok('user_type becomes owner', owner.user?.user_type === 'owner');
  ok('Owner record is created', !!owner.owner?.id);
  ok('kyc_status starts not_started', owner.owner?.kyc_status === 'not_started');

  r = await call('GET', '/api/auth/onboarding-status', null, owner.token);
  ok('onboarding-status works', r.status === 200 && r.json.success, JSON.stringify(r.json));
  ok('sends a new owner to ProfileSetup', r.json.data?.next_screen === 'ProfileSetup', r.json.data?.next_screen);

  r = await call('GET', '/api/auth/onboarding-status');
  ok('onboarding-status needs auth', r.status === 401);

  // ---------------------------------------------------------- rate limiting
  console.log('\nGUARDS');
  r = await call('POST', '/api/auth/otp/send', { identifier: '9826077777' });
  ok('first send ok', r.status === 200);
  r = await call('POST', '/api/auth/otp/send', { identifier: '9826077777' });
  ok('immediate resend is throttled', r.status === 429, JSON.stringify(r.json));

  // attempt cap
  r = await call('POST', '/api/auth/otp/send', { identifier: '9826088888' });
  for (let i = 0; i < 5; i++) {
    await call('POST', '/api/auth/otp/verify', { identifier: '9826088888', code: '111111', role: 'user' });
  }
  r = await call('POST', '/api/auth/otp/verify', { identifier: '9826088888', code: '111111', role: 'user' });
  ok('burns the code after 5 wrong attempts', r.status === 429, JSON.stringify(r.json));

  // ---------------------------------------------------------- phase 0 hardening
  console.log('\nPRODUCTION HARDENING');

  // The fixed test code must not sign anybody in once NODE_ENV=production.
  // (Read at call time, so flipping the env inside the test is enough.)
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  r = await call('POST', '/api/auth/otp/verify', { identifier: '9826055555', code: '123456', role: 'user' });
  ok('test code 123456 is refused in production', r.status === 400 && !r.json.success, JSON.stringify(r.json));
  process.env.ALLOW_TEST_OTP_IN_PRODUCTION = 'true';
  r = await call('POST', '/api/auth/otp/verify', { identifier: '9826055555', code: '123456', role: 'user' });
  ok('...unless ALLOW_TEST_OTP_IN_PRODUCTION=true is set on purpose', r.status === 200 && r.json.success, JSON.stringify(r.json));
  delete process.env.ALLOW_TEST_OTP_IN_PRODUCTION;
  process.env.NODE_ENV = prevEnv;
  r = await call('POST', '/api/auth/otp/verify', { identifier: '9826044444', code: '123456', role: 'user' });
  ok('test code still works outside production', r.status === 200 && r.json.success, JSON.stringify(r.json));

  // Clients send snake_case keys; the terms acceptance and owner type must still be recorded.
  r = await call('POST', '/api/auth/otp/send', { identifier: '9826066666' });
  r = await call('POST', '/api/auth/otp/verify', { identifier: '9826066666', code: r.json.data.dev_code, role: 'owner', terms_accepted: true, owner_type: 'business' });
  const Owner = require('../src/models/Owner');
  const snakeOwner = await Owner.findOne({ user_id: r.json.data?.user?.id });
  ok('terms_accepted (snake_case) is recorded', !!snakeOwner?.terms_accepted_at, JSON.stringify(snakeOwner));
  ok('owner_type (snake_case) is used', snakeOwner?.owner_type === 'business', snakeOwner?.owner_type);

  // Public sign-up cannot make an admin.
  r = await call('POST', '/api/auth/register', {
    email: 'sneaky@example.com', phone: '9826011111', password: 'Passw0rd1',
    first_name: 'Sneaky', last_name: 'Person', user_type: 'admin',
  });
  ok('register refuses user_type admin', r.status === 400 && !r.json.success, JSON.stringify(r.json));
  r = await call('POST', '/api/auth/register', {
    email: 'regular@example.com', phone: '9826022222', password: 'Passw0rd1',
    first_name: 'Reg', last_name: 'Ular', user_type: 'owner',
  });
  ok('register still allows user_type owner', r.status === 201 || r.status === 200, JSON.stringify(r.json));

  // otp/test-send hands the code back, so only an admin may call it.
  r = await call('POST', '/api/auth/otp/test-send', { phone: '9826033333' }, consumer.token);
  ok('otp/test-send is refused for a non-admin', r.status === 403, JSON.stringify(r.json));
  r = await call('POST', '/api/auth/otp/test-send', { phone: '9826033333' });
  ok('otp/test-send needs sign-in', r.status === 401, JSON.stringify(r.json));

  // An expired token can be renewed for a while, not forever.
  const jwt = require('jsonwebtoken');
  const nowSec = Math.floor(Date.now() / 1000);
  const stale = (days) => jwt.sign({ id: consumer.user.id, exp: nowSec - days * 86400 }, process.env.JWT_SECRET);
  r = await call('POST', '/api/auth/refresh-token', null, stale(1));
  ok('a token expired 1 day ago can be refreshed', r.status === 200 && !!r.json.data?.token, JSON.stringify(r.json));
  r = await call('POST', '/api/auth/refresh-token', null, stale(45));
  ok('a token expired 45 days ago cannot', r.status === 401 && r.json.error?.code === 'AUTH_TOKEN_EXPIRED', JSON.stringify(r.json));

  console.log(`\n${pass} passed, ${fail} failed`);
  await server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
