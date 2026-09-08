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

  console.log(`\n${pass} passed, ${fail} failed`);
  await server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
