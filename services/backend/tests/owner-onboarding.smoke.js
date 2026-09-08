/**
 * End-to-end smoke test for the owner app's onboarding endpoints:
 * PUT /api/owners/me/profile, /me/kyc/draft and /me/kyc.
 *
 * Boots an in-memory MongoDB, mounts the real routers, and drives the exact
 * requests the owner app makes — including the camelCase -> snake_case
 * transform its API client applies on the way out.
 */
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  -> ' + extra : '')); }
};

/** Mirror of the app's caseTransform, so payloads here read like the app's. */
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
  app.use('/api/owners', require('../src/routes/ownerRoutes'));
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

  /** Sign a fresh owner in through the real OTP flow. */
  const signUpOwner = async (phone) => {
    let r = await call('POST', '/api/auth/otp/send', { identifier: phone });
    const code = r.json.data?.dev_code;
    r = await call('POST', '/api/auth/otp/verify', {
      identifier: phone, code, ownerType: 'individual', termsAccepted: true,
    });
    return r.json.data?.token;
  };

  // ------------------------------------------------------------- profile
  console.log('PUT /me/profile');
  const token = await signUpOwner('9826010001');
  ok('owner signed up', !!token);

  let r = await call('PUT', '/api/owners/me/profile', {
    legalName: 'Rajesh Kumar Sharma',
    dateOfBirth: '1988-04-12',
    email: 'rajesh@example.com',
    addressLine1: '14 Vijay Nagar',
    addressLine2: 'Scheme 54',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452010',
    country: 'IN',
    locationLat: 22.7196,
    locationLng: 75.8577,
    ownerType: 'individual',
  }, token);
  ok('profile saves', r.status === 200 && r.json.success, JSON.stringify(r.json));
  ok('returns { user, owner }', !!r.json.data?.user && !!r.json.data?.owner);
  ok('splits legal_name into first/last',
    r.json.data?.user?.first_name === 'Rajesh' && r.json.data?.user?.last_name === 'Kumar Sharma',
    JSON.stringify(r.json.data?.user));
  ok('owner stays on profile_setup, not completed',
    r.json.data?.user?.onboarding_step === 'profile_setup', r.json.data?.user?.onboarding_step);
  ok('kyc_status still not_started',
    r.json.data?.owner?.kyc_status === 'not_started', r.json.data?.owner?.kyc_status);

  r = await call('PUT', '/api/owners/me/profile', { city: 'Bhopal' }, token);
  ok('partial update keeps untouched fields',
    r.json.data?.user?.city === 'Bhopal' && r.json.data?.user?.first_name === 'Rajesh');

  r = await call('PUT', '/api/owners/me/profile', { legalName: 'X' });
  ok('profile needs auth', r.status === 401);

  // a business owner without a name is rejected
  const bizToken = await signUpOwner('9826010002');
  r = await call('PUT', '/api/owners/me/profile', { ownerType: 'business' }, bizToken);
  ok('business without a name is rejected', r.status === 400, JSON.stringify(r.json));
  r = await call('PUT', '/api/owners/me/profile', {
    ownerType: 'business', businessName: 'Sharma Realty', roleDesignation: 'Director',
    registrationId: 'U45201MP2019PTC012345',
  }, bizToken);
  ok('business with a name is accepted', r.status === 200, JSON.stringify(r.json));
  ok('business fields come back',
    r.json.data?.owner?.business_name === 'Sharma Realty'
    && r.json.data?.owner?.role_designation === 'Director');

  // --------------------------------------------------------------- draft
  console.log('\nPUT /me/kyc/draft');
  r = await call('PUT', '/api/owners/me/kyc/draft', {
    kycBank: {
      accountHolderName: 'Rajesh Kumar Sharma',
      accountNumber: '50100123456789',
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank',
    },
  }, token);
  ok('draft saves a partial payload', r.status === 200 && r.json.success, JSON.stringify(r.json));
  ok('status moves to draft', r.json.data?.owner?.kyc_status === 'draft', r.json.data?.owner?.kyc_status);
  ok('bank block is stored',
    r.json.data?.owner?.kyc_bank?.ifsc_code === 'HDFC0001234', JSON.stringify(r.json.data?.owner?.kyc_bank));

  r = await call('PUT', '/api/owners/me/kyc/draft', {
    kycPersonal: { fullName: 'Rajesh Kumar Sharma', dateOfBirth: '1988-04-12', phone: '9826010001' },
  }, token);
  ok('a second draft keeps the first block',
    !!r.json.data?.owner?.kyc_bank?.account_number && !!r.json.data?.owner?.kyc_personal?.full_name);

  // -------------------------------------------------------------- submit
  console.log('\nPUT /me/kyc');
  r = await call('PUT', '/api/owners/me/kyc', {
    kycPersonal: { fullName: 'Rajesh Kumar Sharma' },
  }, token);
  ok('incomplete KYC is rejected', r.status === 400, JSON.stringify(r.json));
  ok('says what is missing', /document|bank|IFSC/i.test(r.json.error?.message || ''), r.json.error?.message);

  r = await call('PUT', '/api/owners/me/kyc', {
    kycPersonal: {
      fullName: 'Rajesh Kumar Sharma', dateOfBirth: '1988-04-12',
      phone: '9826010001', email: 'rajesh@example.com',
    },
    kycIdentity: {
      documentType: 'aadhaar', documentNumber: '123456789012',
      frontImageUrl: '/uploads/front.jpg', backImageUrl: '/uploads/back.jpg',
      selfieImageUrl: '/uploads/selfie.jpg',
    },
    kycBank: {
      accountHolderName: 'Rajesh Kumar Sharma', accountNumber: '50100123456789',
      ifscCode: 'HDFC0001234', bankName: 'HDFC Bank',
    },
    kycAddressSameAsProfile: true,
    kycAddress: { proofDocumentUrl: '/uploads/proof.pdf' },
  }, token);
  ok('complete KYC submits', r.status === 200 && r.json.success, JSON.stringify(r.json));
  ok('status becomes submitted', r.json.data?.owner?.kyc_status === 'submitted', r.json.data?.owner?.kyc_status);
  ok('address is copied from the profile',
    r.json.data?.owner?.kyc_address?.city === 'Bhopal',
    JSON.stringify(r.json.data?.owner?.kyc_address));
  ok('the proof document survives the copy',
    r.json.data?.owner?.kyc_address?.proof_document_url === '/uploads/proof.pdf');
  ok('document type is mirrored for admin review',
    r.json.data?.owner?.kyc_identity?.document_type === 'aadhaar');

  r = await call('GET', '/api/auth/onboarding-status', null, token);
  ok('onboarding-status reflects the submission',
    r.json.data?.onboarding_step === 'kyc_submitted', JSON.stringify(r.json.data));

  r = await call('PUT', '/api/owners/me/kyc', { kycPersonal: { fullName: 'Rajesh' } }, token);
  ok('KYC cannot be submitted twice', r.status === 409, JSON.stringify(r.json));

  console.log(`\n${pass} passed, ${fail} failed`);
  await server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
