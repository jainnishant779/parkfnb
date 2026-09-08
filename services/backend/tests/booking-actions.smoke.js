/**
 * End-to-end smoke test for the owner's decisions on a booking:
 * approve, reject and no-show, plus the quote that prices them.
 *
 * Boots an in-memory MongoDB, mounts the real routers, and drives the exact
 * requests the two apps make — including the camelCase -> snake_case
 * transform their API clients apply on the way out.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');

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
  app.use('/api/bookings', require('../src/routes/bookingRoutes'));
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

  const signIn = async (phone, role) => {
    let r = await call('POST', '/api/auth/otp/send', { identifier: phone });
    r = await call('POST', '/api/auth/otp/verify', {
      identifier: phone, code: r.json.data.dev_code, role,
    });
    return r.json.data;
  };

  const owner = await signIn('9826010101', 'owner');
  const renter = await signIn('9826020202', 'user');
  const stranger = await signIn('9826030303', 'user');

  // Seed the objects a booking needs. Going through the models directly keeps
  // this test about the owner actions rather than the listing wizard.
  const Property = require('../src/models/Property');
  const ParkingSpace = require('../src/models/ParkingSpace');
  const UserVehicle = require('../src/models/UserVehicle');
  const Booking = require('../src/models/Booking');

  const property = await Property.create({
    owner_id: owner.owner.id, property_name: 'Vijay Nagar Parking',
    address: '14 Scheme 54', city: 'Indore', state: 'Madhya Pradesh',
    postal_code: '452010', country: 'IN', location_lat: 22.7196, location_lng: 75.8577,
  });
  const space = await ParkingSpace.create({
    property_id: property._id, owner_id: owner.owner.id, space_number: 'A1',
    space_type: 'covered', length_meters: 5.5, width_meters: 2.6,
    // Both price fields: search filters on one, booking prices off the other.
    hourly_rate: 50, price_per_hour: 50, daily_rate: 400,
    booking_mode: 'request', is_available: true,
  });
  const vehicle = await UserVehicle.create({
    user_id: renter.user.id, vehicle_type: 'car', vehicle_size: 'medium',
    registration_number: 'MP09AB1234', license_plate: 'MP09AB1234',
    make: 'Maruti', model: 'Swift',
  });

  const hoursFromNow = (h) => new Date(Date.now() + h * 3600e3);

  const makeBooking = async (startH = 1, endH = 3) => {
    const r = await call('POST', '/api/bookings', {
      space_id: space._id.toString(),
      vehicle_id: vehicle._id.toString(),
      start_time: hoursFromNow(startH).toISOString(),
      end_time: hoursFromNow(endH).toISOString(),
    }, renter.token);
    return r;
  };

  // ------------------------------------------------------------- quote
  console.log('POST /bookings/quote');
  let r = await call('POST', '/api/bookings/quote', {
    space_id: space._id.toString(),
    start_time: hoursFromNow(1).toISOString(),
    end_time: hoursFromNow(3).toISOString(),
  }, renter.token);
  ok('quotes a two-hour booking', r.status === 200, JSON.stringify(r.json));
  ok('at the space\'s hourly rate', r.json.data?.total_amount === 100, String(r.json.data?.total_amount));
  ok('with no invented fee or tax',
    r.json.data?.service_fee === 0 && r.json.data?.tax === 0);

  // -------------------------------------------------------- the booking
  console.log('\nPOST /bookings');
  r = await makeBooking();
  ok('an unverified vehicle can still book', r.status === 201, JSON.stringify(r.json).slice(0, 160));
  const booking = r.json.data?.booking || r.json.data;
  const bookingId = booking?._id || booking?.id;
  ok('starts pending', booking?.status === 'pending', booking?.status);
  ok('charges the quoted amount', booking?.total_amount === 100, String(booking?.total_amount));

  // ------------------------------------------------------------ approve
  console.log('\nPUT /bookings/:id/approve');
  r = await call('PUT', `/api/bookings/${bookingId}/approve`, {}, stranger.token);
  ok('a stranger cannot approve it', r.status === 403, JSON.stringify(r.json));

  r = await call('PUT', `/api/bookings/${bookingId}/approve`, {}, renter.token);
  ok('the renter cannot approve their own', r.status === 403);

  r = await call('PUT', `/api/bookings/${bookingId}/approve`, {}, owner.token);
  ok('the owner can approve', r.status === 200, JSON.stringify(r.json).slice(0, 160));
  ok('status becomes confirmed', r.json.data?.booking?.status === 'confirmed',
    r.json.data?.booking?.status);
  ok('the property comes back named',
    r.json.data?.booking?.space_id?.property_id?.property_name === 'Vijay Nagar Parking',
    JSON.stringify(r.json.data?.booking?.space_id?.property_id));

  r = await call('PUT', `/api/bookings/${bookingId}/approve`, {}, owner.token);
  ok('approving twice is harmless', r.status === 200);

  r = await call('PUT', `/api/bookings/${bookingId}/reject`, {}, owner.token);
  ok('a confirmed booking cannot be rejected', r.status === 400, JSON.stringify(r.json));

  // ------------------------------------------------------------- reject
  console.log('\nPUT /bookings/:id/reject');
  r = await makeBooking(5, 7);
  const second = r.json.data?.booking || r.json.data;
  const secondId = second?._id || second?.id;

  r = await call('PUT', `/api/bookings/${secondId}/reject`, {
    rejectionReason: 'That bay is blocked this week',
  }, owner.token);
  ok('the owner can reject', r.status === 200, JSON.stringify(r.json).slice(0, 160));
  ok('status becomes rejected', r.json.data?.booking?.status === 'rejected',
    r.json.data?.booking?.status);
  ok('the reason is kept',
    r.json.data?.booking?.rejection_reason === 'That bay is blocked this week');
  ok('payment is marked failed, not left pending',
    r.json.data?.booking?.payment_status === 'failed',
    r.json.data?.booking?.payment_status);

  // ------------------------------------------------------------ no-show
  console.log('\nPUT /bookings/:id/noshow');
  r = await makeBooking(9, 11);
  const third = r.json.data?.booking || r.json.data;
  const thirdId = third?._id || third?.id;

  r = await call('PUT', `/api/bookings/${thirdId}/noshow`, {}, owner.token);
  ok('a pending booking is not a no-show', r.status === 400, JSON.stringify(r.json));

  await call('PUT', `/api/bookings/${thirdId}/approve`, {}, owner.token);
  r = await call('PUT', `/api/bookings/${thirdId}/noshow`, {}, owner.token);
  ok('a booking that has not started is not a no-show', r.status === 400, JSON.stringify(r.json));

  // Move it into the past so the renter is genuinely late.
  await Booking.findByIdAndUpdate(thirdId, {
    start_time: hoursFromNow(-2), end_time: hoursFromNow(-1),
  });
  r = await call('PUT', `/api/bookings/${thirdId}/noshow`, {}, owner.token);
  ok('a late renter can be marked a no-show', r.status === 200, JSON.stringify(r.json).slice(0, 160));
  ok('status becomes no_show', r.json.data?.booking?.status === 'no_show',
    r.json.data?.booking?.status);

  r = await call('PUT', `/api/bookings/${thirdId}/noshow`, {}, owner.token);
  ok('marking twice is harmless', r.status === 200);

  // ------------------------------------------------------------- guards
  console.log('\nGUARDS');
  r = await call('PUT', `/api/bookings/${bookingId}/approve`);
  ok('approve needs auth', r.status === 401);
  r = await call('PUT', '/api/bookings/notanid/approve', {}, owner.token);
  ok('a malformed id is rejected', r.status === 400, String(r.status));
  r = await call('PUT', `/api/bookings/${new mongoose.Types.ObjectId()}/approve`, {}, owner.token);
  ok('an unknown booking is 404', r.status === 404);

  console.log(`\n${pass} passed, ${fail} failed`);
  await server.close();
  await mongoose.disconnect();
  await mongo.stop();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
