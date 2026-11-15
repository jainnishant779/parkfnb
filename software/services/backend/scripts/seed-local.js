/**
 * Wipe the working database and seed a realistic, self-consistent dataset for
 * manual testing of the owner -> consumer flow.
 *
 *   node scripts/seed-local.js                 # uses MONGODB_URI from .env
 *   SEED_LAT=22.72 SEED_LNG=75.90 node scripts/seed-local.js
 *
 * Refuses to run against a database whose name looks like production unless
 * SEED_FORCE=1 is set — this deletes everything.
 *
 * Everything is created through Mongoose models (not raw inserts) so the data
 * matches exactly what the API would have produced.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Owner = require('../src/models/Owner');
const Property = require('../src/models/Property');
const ParkingSpace = require('../src/models/ParkingSpace');
const UserVehicle = require('../src/models/UserVehicle');
const Booking = require('../src/models/Booking');

// Centre of the seeded world. Defaults to Vijay Nagar, Indore.
const LAT = Number(process.env.SEED_LAT || 22.723961);
const LNG = Number(process.env.SEED_LNG || 75.904889);

const PROTECTED = ['parkfnb', 'test', 'production', 'prod'];

const near = (dLat, dLng) => ({ lat: +(LAT + dLat).toFixed(6), lng: +(LNG + dLng).toFixed(6) });
const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000);
const bookingNo = () =>
  `BK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri);
  const dbName = mongoose.connection.name;

  if (PROTECTED.includes(dbName) && process.env.SEED_FORCE !== '1') {
    console.error(
      `\nRefusing to wipe "${dbName}" — that looks like real data.\n` +
      `Point MONGODB_URI at a scratch database, or set SEED_FORCE=1 if you really mean it.\n`,
    );
    process.exit(1);
  }

  console.log(`\nSeeding "${dbName}" around ${LAT}, ${LNG}\n`);

  // ---- wipe ----
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) {
    if (c.collectionName.startsWith('system.')) continue;
    await c.deleteMany({});
  }
  console.log(`wiped ${collections.length} collections`);

  // ---- owners ----
  const mkOwner = async ({ phone, name, email, ownerType, business }) => {
    const [first, ...rest] = name.split(' ');
    const user = await User.create({
      phone, email, first_name: first, last_name: rest.join(' '), legal_name: name,
      user_type: 'owner', auth_method: 'otp', onboarding_step: 'completed',
      is_verified: true, city: 'Indore', state: 'MP', postal_code: '452010', country: 'IN',
    });
    const owner = await Owner.create({
      user_id: user._id, owner_type: ownerType, business_name: business,
      is_verified: true, kyc_status: 'verified',
    });
    return { user, owner };
  };

  const ramesh = await mkOwner({
    phone: '9000011111', name: 'Ramesh Sharma', email: 'ramesh@example.com',
    ownerType: 'individual',
  });
  const orbit = await mkOwner({
    phone: '9000022222', name: 'Priya Malhotra', email: 'priya@example.com',
    ownerType: 'commercial_property', business: 'Orbit Mall Parking Pvt Ltd',
  });
  console.log('owners: 9000011111 (Ramesh, individual), 9000022222 (Priya, commercial)');

  // ---- properties + spaces ----
  const mkProperty = async (owner, name, address, d1, d2, spaces) => {
    const pos = near(d1, d2);
    const property = await Property.create({
      owner_id: owner.owner._id, property_name: name, address, city: 'Indore',
      state: 'MP', postal_code: '452010', country: 'IN',
      location_lat: pos.lat, location_lng: pos.lng, is_active: true,
    });
    const made = [];
    for (const s of spaces) {
      made.push(await ParkingSpace.create({
        property_id: property._id, owner_id: owner.owner._id,
        space_number: s.n, space_type: s.type,
        length_meters: 5, width_meters: 2.5, height_meters: s.height,
        allowed_vehicle_types: s.vehicles || ['car', 'suv'],
        price_per_hour: s.hr, price_per_day: s.day, price_per_month: s.month,
        hourly_rate: s.hr, daily_rate: s.day, monthly_rate: s.month,
        booking_mode: s.mode, status: 'active', is_available: true,
        has_ev_charging: !!s.ev,
      }));
    }
    console.log(`  ${name} (${pos.lat}, ${pos.lng}) -> ${made.map(m => m.space_number).join(', ')}`);
    return { property, spaces: made };
  };

  console.log('\nproperties:');
  const vijay = await mkProperty(ramesh, 'Vijay Nagar Secure Parking', '12 Scheme 54, Vijay Nagar', 0.0005, 0.0005, [
    { n: 'A-1', type: 'covered',  hr: 40, day: 300, month: 5000, mode: 'instant', height: 2.1 },
    { n: 'A-2', type: 'outdoor',  hr: 30, day: 220, mode: 'instant' },
    { n: 'A-3', type: 'covered',  hr: 50, day: 380, mode: 'instant', ev: true },
  ]);
  const satya = await mkProperty(ramesh, 'Satya Residency Driveway', 'Satya Residency, Scheme 78', 0.0035, -0.0025, [
    { n: 'D-1', type: 'driveway', hr: 25, day: 180, mode: 'instant', vehicles: ['car', 'motorcycle'] },
  ]);
  const mall = await mkProperty(orbit, 'Orbit Mall Basement', 'Orbit Mall, AB Road', -0.002, 0.0015, [
    { n: 'B-11', type: 'garage', hr: 60, day: 450, month: 8000, mode: 'request', height: 2.0 },
    { n: 'B-12', type: 'garage', hr: 60, day: 450, mode: 'request', height: 2.0 },
  ]);

  // ---- consumers ----
  const mkRider = async ({ phone, name, plate, vtype }) => {
    const [first, ...rest] = name.split(' ');
    const user = await User.create({
      phone, first_name: first, last_name: rest.join(' '), legal_name: name,
      user_type: 'user', auth_method: 'otp', onboarding_step: 'completed', is_verified: true,
    });
    const vehicle = await UserVehicle.create({
      user_id: user._id, license_plate: plate, registration_number: plate,
      vehicle_type: vtype, vehicle_size: 'medium',
      // The schema carries both pairs; make/model are the required ones.
      make: 'Maruti', model: vtype === 'suv' ? 'Brezza' : 'Swift',
      vehicle_make: 'Maruti', vehicle_model: vtype === 'suv' ? 'Brezza' : 'Swift',
      is_default: true,
    });
    return { user, vehicle };
  };

  const amit = await mkRider({ phone: '9000033333', name: 'Amit Verma', plate: 'MP09AB1234', vtype: 'car' });
  const neha = await mkRider({ phone: '9000044444', name: 'Neha Joshi', plate: 'MP09CD5678', vtype: 'suv' });
  console.log('\nriders: 9000033333 (Amit, MP09AB1234), 9000044444 (Neha, MP09CD5678)');

  // ---- bookings across every state the apps render ----
  const mkBooking = async (rider, space, { startH, endH, status, payment, method = 'cash', checkedIn, checkedOut, reason }) => {
    const start = hoursFromNow(startH);
    const end = hoursFromNow(endH);
    const hours = (end - start) / 3600000;
    const total = space.hourly_rate * hours <= (space.daily_rate || Infinity)
      ? Math.round(space.hourly_rate * hours * 100) / 100
      : space.daily_rate;
    return Booking.create({
      booking_number: bookingNo(),
      user_id: rider.user._id, owner_id: space.owner_id, space_id: space._id,
      vehicle_id: rider.vehicle._id,
      start_time: start, end_time: end, duration_hours: hours,
      base_price: total, discount_amount: 0, total_amount: total, currency: 'INR',
      status, payment_status: payment, payment_method: method,
      check_in_time: checkedIn ? start : undefined,
      check_out_time: checkedOut ? end : undefined,
      cancellation_reason: reason,
      cancelled_at: status === 'cancelled' ? new Date() : undefined,
    });
  };

  console.log('\nbookings:');
  // Ramesh gets a full spread so his dashboard has something in every tab
  await mkBooking(amit, mall.spaces[0],  { startH: 3,   endH: 6,   status: 'pending',   payment: 'pending' });
  await mkBooking(neha, mall.spaces[1],  { startH: 5,   endH: 8,   status: 'pending',   payment: 'pending' });
  await mkBooking(amit, vijay.spaces[0], { startH: 26,  endH: 30,  status: 'confirmed', payment: 'pending' });
  await mkBooking(neha, vijay.spaces[1], { startH: 50,  endH: 54,  status: 'confirmed', payment: 'pending' });
  await mkBooking(amit, vijay.spaces[2], { startH: -1,  endH: 3,   status: 'active',    payment: 'pending', checkedIn: true });
  await mkBooking(neha, vijay.spaces[0], { startH: -28, endH: -24, status: 'completed', payment: 'paid', checkedIn: true, checkedOut: true });
  await mkBooking(amit, vijay.spaces[1], { startH: -52, endH: -48, status: 'completed', payment: 'paid', checkedIn: true, checkedOut: true });
  await mkBooking(neha, satya.spaces[0], { startH: -76, endH: -72, status: 'completed', payment: 'paid', checkedIn: true, checkedOut: true });
  await mkBooking(amit, satya.spaces[0], { startH: 100, endH: 104, status: 'cancelled', payment: 'failed', reason: 'Plans changed' });
  await mkBooking(neha, mall.spaces[0],  { startH: 120, endH: 124, status: 'rejected',  payment: 'failed' });

  const counts = {};
  for (const s of ['pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected']) {
    counts[s] = await Booking.countDocuments({ status: s });
  }
  console.log(' ', JSON.stringify(counts));

  const revenue = await Booking.aggregate([
    { $match: { payment_status: 'paid' } },
    { $group: { _id: '$owner_id', total: { $sum: '$total_amount' } } },
  ]);
  console.log('  paid revenue by owner:', JSON.stringify(revenue.map(r => r.total)));

  console.log(`
done. sign in with code 123456:

  OWNER APP
    9000011111  Ramesh Sharma     3 properties' worth of spaces, bookings in every state
    9000022222  Priya Malhotra    Orbit Mall, 2 request-mode spaces with pending requests

  CONSUMER APP
    9000033333  Amit Verma        MP09AB1234, has upcoming + active + past bookings
    9000044444  Neha Joshi        MP09CD5678
`);

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
