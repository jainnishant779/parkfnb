/**
 * Local end-to-end MVP flow test. Run against a locally started server.
 *   node e2e.tmp.js
 * Ignores OTP delivery (uses the test code) and the online payment gateway.
 */
const B = process.env.E2E_BASE || "http://localhost:5057";
const CODE = '123456';
const stamp = Date.now().toString().slice(-6);

let pass = 0, fail = 0;
const results = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; results.push(name); console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); }
  return cond;
};

async function call(method, path, { token, body } = {}) {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch {}
  return { s: r.status, j, d: j.data };
}
const iso = (minsFromNow) => new Date(Date.now() + minsFromNow * 60000).toISOString();
const err = (r) => `HTTP ${r.s} ${r.j?.error?.code || ''} ${r.j?.error?.message || ''}`.trim();

(async () => {
  console.log(`\n### base=${B}\n`);

  // ---------- 1. OWNER ONBOARDING ----------
  console.log('--- owner onboarding ---');
  const ownerPhone = `98${stamp}01`.slice(0, 10);
  await call('POST', '/api/auth/otp/send', { body: { identifier: ownerPhone } });
  const oAuth = await call('POST', '/api/auth/otp/verify', {
    body: { identifier: ownerPhone, code: CODE, role: 'owner', ownerType: 'individual', termsAccepted: true },
  });
  const oTok = oAuth.d?.token;
  ok('owner signs in via OTP', oAuth.s === 200 && !!oTok, err(oAuth));
  if (!oTok) return done();

  const oProf = await call('PUT', '/api/owners/me/profile', {
    token: oTok,
    body: {
      legal_name: 'E2E Owner', email: `e2eowner${stamp}@example.com`,
      address_line1: '1 Test Road', city: 'Indore', state: 'MP', pincode: '452001',
      owner_type: 'individual',
    },
  });
  ok('owner profile saves to server', oProf.s === 200, err(oProf));
  ok('owner profile returns the saved name',
    oProf.d?.user?.legal_name === 'E2E Owner' || oProf.d?.user?.first_name === 'E2E',
    JSON.stringify(oProf.d?.user?.legal_name || oProf.d?.user?.first_name));

  const ownerId = oAuth.d?.owner?.id || oProf.d?.owner?.id;
  ok('owner record exists', !!ownerId, String(ownerId));

  // ---------- 2. PROPERTY + SPACES ----------
  console.log('\n--- listing ---');
  const prop = await call('POST', '/api/properties', {
    token: oTok,
    body: {
      property_name: 'E2E Test Property', address: '1 Test Road', city: 'Indore', state: 'MP',
      postal_code: '452001', country: 'India', location_lat: 22.7196, location_lng: 75.8577,
    },
  });
  const propId = prop.d?.property?._id || prop.d?.property?.id;
  ok('owner creates property', (prop.s === 201 || prop.s === 200) && !!propId, err(prop));

  const mkSpace = async (label, mode) => {
    const r = await call('POST', `/api/parking-spaces/properties/${propId}/spaces`, {
      token: oTok,
      body: {
        space_number: label, space_type: 'covered', length_meters: 5, width_meters: 2.5,
        allowed_vehicle_types: ['car', 'suv'], price_per_hour: 40, price_per_day: 300,
        hourly_rate: 40, daily_rate: 300, booking_mode: mode, status: 'active',
      },
    });
    return { r, id: r.d?.space?._id || r.d?.space?.id };
  };
  const inst = await mkSpace('E2E-INSTANT', 'instant');
  ok('owner creates an instant-mode space', !!inst.id, err(inst.r));
  const req = await mkSpace('E2E-REQUEST', 'request');
  ok('owner creates a request-mode space', !!req.id, err(req.r));
  if (!inst.id) return done();

  // price fields kept in sync (the manual two-set sync noted in CLAUDE.md)
  const spaceGet = await call('GET', `/api/parking-spaces/${inst.id}`);
  const sp = spaceGet.d?.space;
  ok('price_per_hour and hourly_rate stay in sync on create',
    sp?.price_per_hour === 40 && sp?.hourly_rate === 40,
    `price_per_hour=${sp?.price_per_hour} hourly_rate=${sp?.hourly_rate}`);

  // ---------- 3. CONSUMER ONBOARDING ----------
  console.log('\n--- consumer onboarding ---');
  const userPhone = `97${stamp}02`.slice(0, 10);
  const uAuth = await call('POST', '/api/auth/otp/verify', {
    body: { identifier: userPhone, code: CODE, role: 'user', termsAccepted: true },
  });
  const uTok = uAuth.d?.token, uId = uAuth.d?.user?.id;
  ok('consumer signs in via OTP', uAuth.s === 200 && !!uTok, err(uAuth));
  if (!uTok) return done();

  const uProf = await call('PUT', '/api/users/me/profile', {
    token: uTok, body: { legalName: 'E2E Rider', notificationBooking: true },
  });
  ok('consumer profile saves (onboarding Continue)', uProf.s === 200, err(uProf));
  ok('consumer onboarding_step advances to completed',
    uProf.d?.user?.onboarding_step === 'completed', String(uProf.d?.user?.onboarding_step));

  const veh = await call('POST', `/api/vehicles/users/${uId}/vehicles`, {
    token: uTok,
    body: {
      license_plate: `MP09EE${stamp.slice(-4)}`, registration_number: `MP09EE${stamp.slice(-4)}`,
      vehicle_type: 'car', vehicle_size: 'medium', make: 'E2E', model: 'Car', is_default: true,
    },
  });
  const vehId = veh.d?.vehicle?._id || veh.d?.vehicle?.id;
  ok('consumer adds a vehicle', !!vehId, err(veh));

  // ---------- 4. DISCOVERY ----------
  console.log('\n--- discovery ---');
  const search = await call('GET', `/api/parking-spaces/search?lat=22.7196&lng=75.8577&radius=5`);
  const found = (search.d?.spaces || []).some(s => (s._id || s.id) === inst.id);
  ok('new space appears in consumer search', search.s === 200 && found, err(search));

  const badGeo = await call('GET', '/api/parking-spaces/search?lat=abc');
  ok('search rejects a non-numeric lat (was 200 + everything)', badGeo.s === 400, err(badGeo));

  // ---------- 5. PRICING ----------
  console.log('\n--- pricing ---');
  const q2 = await call('POST', '/api/bookings/quote', {
    token: uTok, body: { space_id: inst.id, start_time: iso(60), end_time: iso(180) },
  });
  ok('2h quote = 80 (hourly)', q2.d?.total_amount === 80, `got ${q2.d?.total_amount}`);
  const q24 = await call('POST', '/api/bookings/quote', {
    token: uTok, body: { space_id: inst.id, start_time: iso(60), end_time: iso(60 + 24 * 60) },
  });
  ok('24h quote = 300 (day rate, was 960)', q24.d?.total_amount === 300, `got ${q24.d?.total_amount}`);
  const q25 = await call('POST', '/api/bookings/quote', {
    token: uTok, body: { space_id: inst.id, start_time: iso(60), end_time: iso(60 + 25 * 60) },
  });
  ok('25h quote = 600 and never cheaper than 24h', q25.d?.total_amount === 600 && q25.d.total_amount >= q24.d.total_amount, `got ${q25.d?.total_amount}`);
  ok('quote currency is INR', q2.d?.currency === 'INR', String(q2.d?.currency));

  const badId = await call('POST', '/api/bookings/quote', { token: uTok, body: { space_id: 'zzz', start_time: iso(60), end_time: iso(120) } });
  ok('malformed space id on quote = 400 (was 500)', badId.s === 400, err(badId));

  // ---------- 6. INSTANT BOOKING ----------
  console.log('\n--- instant booking ---');
  const b1 = await call('POST', '/api/bookings', {
    token: uTok,
    body: { space_id: inst.id, vehicle_id: vehId, start_time: iso(5), end_time: iso(125), payment_method: 'cash' },
  });
  const b1Id = b1.d?.booking?._id || b1.d?.booking?.id;
  ok('instant-mode booking is CONFIRMED immediately (was pending)',
    b1.s === 201 && b1.d?.booking?.status === 'confirmed', `status=${b1.d?.booking?.status} ${err(b1)}`);
  ok('booking stores payment_method', b1.d?.booking?.payment_method === 'cash', String(b1.d?.booking?.payment_method));
  ok('booking currency is INR (was USD)', b1.d?.booking?.currency === 'INR', String(b1.d?.booking?.currency));
  ok('booking total = 80 for 2h', b1.d?.booking?.total_amount === 80, String(b1.d?.booking?.total_amount));

  const ownerList = await call('GET', `/api/bookings/owners/${ownerId}/bookings`, { token: oTok });
  const ownerSees = JSON.stringify(ownerList.d || ownerList.j).includes(b1Id);
  ok('owner sees the booking', ownerSees, err(ownerList));

  // ---------- 7. CHECK-IN / CHECK-OUT ----------
  console.log('\n--- check-in / check-out ---');
  const ci = await call('PUT', `/api/bookings/${b1Id}/checkin`, { token: oTok, body: {} });
  ok('owner checks the guest in', ci.s === 200 && ci.d?.booking?.status === 'active', `status=${ci.d?.booking?.status} ${err(ci)}`);
  ok('check_in_time persists (was written to a non-existent field)',
    !!ci.d?.booking?.check_in_time, String(ci.d?.booking?.check_in_time));

  const co = await call('PUT', `/api/bookings/${b1Id}/checkout`, { token: oTok, body: {} });
  ok('owner checks the guest out', co.s === 200 && co.d?.booking?.status === 'completed', `status=${co.d?.booking?.status} ${err(co)}`);
  ok('check_out_time persists', !!co.d?.booking?.check_out_time, String(co.d?.booking?.check_out_time));
  ok('cash booking settles to payment_status=paid on checkout',
    co.d?.booking?.payment_status === 'paid', String(co.d?.booking?.payment_status));

  // ---------- 8. OWNER EARNINGS ----------
  console.log('\n--- owner earnings ---');
  const stats = await call('GET', `/api/owners/${ownerId}/stats`, { token: oTok });
  ok('owner revenue counts the completed cash booking (was always 0)',
    stats.d?.stats?.total_revenue === 80, `total_revenue=${stats.d?.stats?.total_revenue}`);
  ok('owner stats report the completed booking',
    stats.d?.stats?.completed_bookings === 1, `completed=${stats.d?.stats?.completed_bookings}`);
  const earn = await call('GET', `/api/owners/${ownerId}/earnings`, { token: oTok });
  ok('owner earnings endpoint responds', earn.s === 200, err(earn));

  // ---------- 9. REQUEST MODE: approve / reject ----------
  console.log('\n--- request mode ---');
  const b2 = await call('POST', '/api/bookings', {
    token: uTok, body: { space_id: req.id, vehicle_id: vehId, start_time: iso(240), end_time: iso(360), payment_method: 'cash' },
  });
  const b2Id = b2.d?.booking?._id || b2.d?.booking?.id;
  ok('request-mode booking stays PENDING', b2.d?.booking?.status === 'pending', `status=${b2.d?.booking?.status} ${err(b2)}`);
  const ap = await call('PUT', `/api/bookings/${b2Id}/approve`, { token: oTok });
  ok('owner approves it', ap.s === 200 && ap.d?.booking?.status === 'confirmed', `status=${ap.d?.booking?.status} ${err(ap)}`);

  const b3 = await call('POST', '/api/bookings', {
    token: uTok, body: { space_id: req.id, vehicle_id: vehId, start_time: iso(500), end_time: iso(560), payment_method: 'cash' },
  });
  const b3Id = b3.d?.booking?._id || b3.d?.booking?.id;
  const rj = await call('PUT', `/api/bookings/${b3Id}/reject`, { token: oTok, body: { rejection_reason: 'e2e test' } });
  ok('owner rejects a request', rj.s === 200 && rj.d?.booking?.status === 'rejected', `status=${rj.d?.booking?.status} ${err(rj)}`);

  const reBook = await call('POST', '/api/bookings', {
    token: uTok, body: { space_id: req.id, vehicle_id: vehId, start_time: iso(500), end_time: iso(560), payment_method: 'cash' },
  });
  ok('a REJECTED booking no longer blocks its slot (was blocked forever)',
    reBook.s === 201, err(reBook));
  const reBookId = reBook.d?.booking?._id || reBook.d?.booking?.id;

  // ---------- 10. CONFLICTS + CANCEL ----------
  console.log('\n--- conflicts & cancel ---');
  const dup = await call('POST', '/api/bookings', {
    token: uTok, body: { space_id: req.id, vehicle_id: vehId, start_time: iso(500), end_time: iso(560), payment_method: 'cash' },
  });
  ok('double-booking the same slot = 409', dup.s === 409, err(dup));

  const can = await call('PUT', `/api/bookings/${reBookId}/cancel`, { token: uTok, body: { cancellation_reason: 'e2e' } });
  ok('consumer cancels', can.s === 200 && can.d?.booking?.status === 'cancelled', err(can));
  ok('cancelled_at persists (was a non-existent field)', !!can.d?.booking?.cancelled_at, String(can.d?.booking?.cancelled_at));
  ok('refund_amount is a number, not NaN', typeof can.d?.booking?.refund_amount === 'number', String(can.d?.booking?.refund_amount));

  const afterCancel = await call('POST', '/api/bookings', {
    token: uTok, body: { space_id: req.id, vehicle_id: vehId, start_time: iso(500), end_time: iso(560), payment_method: 'cash' },
  });
  ok('slot is free again after a cancel', afterCancel.s === 201, err(afterCancel));
  const acId = afterCancel.d?.booking?._id || afterCancel.d?.booking?.id;

  // ---------- 11. EXTEND ----------
  console.log('\n--- extend ---');
  // request-mode space, so it lands pending; extend needs confirmed/active
  await call('PUT', `/api/bookings/${acId}/approve`, { token: oTok });
  const before = await call('GET', `/api/bookings/${acId}`, { token: uTok });
  const beforeTotal = before.d?.booking?.total_amount;
  const ext = await call('PUT', `/api/bookings/${acId}/extend`, { token: uTok, body: { new_end_time: iso(620) } });
  ok('extend responds 200', ext.s === 200, err(ext));
  const after = await call('GET', `/api/bookings/${acId}`, { token: uTok });
  ok('extending a booking actually raises the price (was silently dropped)',
    after.d?.booking?.total_amount > beforeTotal,
    `${beforeTotal} -> ${after.d?.booking?.total_amount}`);

  // ---------- 12. AUTHORISATION ----------
  console.log('\n--- authorisation ---');
  const noTok = await call('GET', `/api/bookings/users/${uId}/bookings`);
  ok('no token = 401', noTok.s === 401, err(noTok));
  const crossOwner = await call('PUT', `/api/bookings/${b1Id}/approve`, { token: uTok });
  ok('consumer cannot approve a booking = 403', crossOwner.s === 403, err(crossOwner));
  const consumerProp = await call('POST', '/api/properties', { token: uTok, body: { property_name: 'nope' } });
  ok('consumer cannot create a property = 403', consumerProp.s === 403, err(consumerProp));

  done();

  function done() {
    console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
    if (fail) console.log('FAILED:\n - ' + results.join('\n - '));
    process.exit(fail ? 1 : 0);
  }
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
