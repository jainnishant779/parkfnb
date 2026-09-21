/**
 * Demo data for the 22 September presentation.
 *
 *   node scripts/seed-demo.js            create (idempotent)
 *   node scripts/seed-demo.js --reset    delete seeded rows, then create
 *   node scripts/seed-demo.js --clean    delete seeded rows and stop
 *
 * Every row is tagged so --reset can find it again. Mongoose schemas are
 * strict, so an extra `_demo` field would be silently dropped; instead the
 * seed is identified by its own @parkfnb.com accounts and the ids that hang
 * off them. Nothing created by hand or by the apps is touched, even when
 * pointed at the live database.
 *
 * What it builds, and why each piece is there:
 *
 *   admin@parkfnb.com          admin panel login
 *   owner-verified             KYC approved -> owns the demo space
 *     property -> 2 spaces -> device pb-001 (mapped to BARRIER_001)
 *   owner-pending              KYC submitted -> approve this LIVE on stage
 *   driver                     MH04DB6948, paid booking  -> ANPR ALLOW
 *   stranger                   MH12AB1234, no booking    -> ANPR DENY
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../src/models/User');
const Owner = require('../src/models/Owner');
const Property = require('../src/models/Property');
const ParkingSpace = require('../src/models/ParkingSpace');
const SpaceAvailability = require('../src/models/SpaceAvailability');
const UserVehicle = require('../src/models/UserVehicle');
const Device = require('../src/models/Device');
const Booking = require('../src/models/Booking');
const Payment = require('../src/models/Payment');

// The plate the ANPR demo image carries. Both vehicle fields are set to it,
// because the lookup queries license_plate OR registration_number.
const ALLOW_PLATE = process.env.DEMO_ALLOW_PLATE || 'MH04DB6948';
const DENY_PLATE = process.env.DEMO_DENY_PLATE || 'MH12AB1234';

const DEVICE_ID = process.env.DEMO_DEVICE_ID || 'pb-001';
const DEVICE_SECRET = process.env.DEMO_DEVICE_SECRET || 'change-me-to-a-long-random-string';

const PASSWORD = 'Demo@1234';

const args = process.argv.slice(2);
const wantReset = args.includes('--reset');
const wantClean = args.includes('--clean');

// The seeded accounts. Everything else is reached through their ids, so a
// row created by the apps is never in scope for deletion.
const SEED_EMAILS = [
  'owner@parkfnb.com',
  'newowner@parkfnb.com',
  'driver@parkfnb.com',
  'stranger@parkfnb.com',
];

function line(t = '') { console.log(t); }
function ok(label, value) { console.log(`  ${label.padEnd(26)}${value}`); }

async function clean() {
  line('Removing previously seeded rows...');

  const users = await User.find({ email: { $in: SEED_EMAILS } }).select('_id');
  const userIds = users.map((u) => u._id);

  if (!userIds.length) {
    line('  nothing to remove');
    line();
    return;
  }

  const owners = await Owner.find({ user_id: { $in: userIds } }).select('_id');
  const ownerIds = owners.map((o) => o._id);

  const props = await Property.find({ owner_id: { $in: ownerIds } }).select('_id');
  const propIds = props.map((p) => p._id);

  const spaces = await ParkingSpace.find({
    $or: [{ property_id: { $in: propIds } }, { owner_id: { $in: ownerIds } }],
  }).select('_id');
  const spaceIds = spaces.map((s) => s._id);

  const bookings = await Booking.find({ user_id: { $in: userIds } }).select('_id');
  const bookingIds = bookings.map((b) => b._id);

  const steps = [
    ['Payment', Payment, { booking_id: { $in: bookingIds } }],
    ['Booking', Booking, { _id: { $in: bookingIds } }],
    ['SpaceAvailability', SpaceAvailability, { space_id: { $in: spaceIds } }],
    ['Device', Device, { device_id: DEVICE_ID }],
    ['ParkingSpace', ParkingSpace, { _id: { $in: spaceIds } }],
    ['Property', Property, { _id: { $in: propIds } }],
    ['UserVehicle', UserVehicle, { user_id: { $in: userIds } }],
    ['Owner', Owner, { _id: { $in: ownerIds } }],
    ['User', User, { _id: { $in: userIds } }],
  ];

  let total = 0;
  for (const [name, Model, filter] of steps) {
    const { deletedCount } = await Model.deleteMany(filter);
    if (deletedCount) {
      total += deletedCount;
      ok(name, deletedCount);
    }
  }
  line(`  ${total} removed`);
  line();
}

async function seed() {
  const now = new Date();
  const hash = await bcrypt.hash(PASSWORD, 10);

  // ---- admin -------------------------------------------------------------
  // An admin may already exist from make-admin.js; reuse it rather than
  // creating a second one, but keep the password known for the demo.
  let admin = await User.findOne({ email: 'admin@parkfnb.com' });
  if (admin) {
    admin.password_hash = hash;
    admin.is_active = true;
    await admin.save();
  } else {
    admin = await User.create({
      email: 'admin@parkfnb.com',
      password_hash: hash,
      first_name: 'Admin',
      last_name: 'User',
      user_type: 'admin',
      is_email_verified: true,
      is_active: true,
    });
  }

  // ---- owner with verified KYC -------------------------------------------
  const ownerUser = await User.create({
    email: 'owner@parkfnb.com',
    phone: '9555000001',
    password_hash: hash,
    first_name: 'Rajesh',
    last_name: 'Sharma',
    user_type: 'owner',
    is_email_verified: true,
    is_phone_verified: true,
    is_active: true,
  });

  const owner = await Owner.create({
    user_id: ownerUser._id,
    owner_type: 'individual',
    kyc_status: 'verified',
    is_verified: true,
    kyc_verified_at: now,
    terms_accepted_at: now,
  });

  // ---- owner awaiting KYC — this is the one approved live on stage -------
  const pendingUser = await User.create({
    email: 'newowner@parkfnb.com',
    phone: '9555000002',
    password_hash: hash,
    first_name: 'Priya',
    last_name: 'Desai',
    user_type: 'owner',
    is_phone_verified: true,
    is_active: true,
  });

  const pendingOwner = await Owner.create({
    user_id: pendingUser._id,
    owner_type: 'individual',
    kyc_status: 'submitted',
    kyc_submitted_at: now,
    terms_accepted_at: now,
    kyc_personal: { fullName: 'Priya Desai', dateOfBirth: '1992-04-18' },
    kyc_identity: {
      documentType: 'aadhaar',
      documentNumber: 'XXXX-XXXX-4821',
      frontImageUrl: 'https://placehold.co/600x380?text=Aadhaar+Front',
      backImageUrl: 'https://placehold.co/600x380?text=Aadhaar+Back',
    },
    kyc_bank: {
      accountHolderName: 'Priya Desai',
      accountNumber: '50100234567890',
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank',
    },
    kyc_address: {
      addressLine1: '14, Sunrise Residency',
      city: 'Indore', state: 'Madhya Pradesh', pincode: '452001',
    },
  });

  // ---- property and spaces ----------------------------------------------
  const property = await Property.create({
    owner_id: owner._id,
    property_name: 'Sunrise Residency Parking',
    address: '14, Sunrise Residency, Vijay Nagar',
    city: 'Indore',
    state: 'Madhya Pradesh',
    postal_code: '452010',
    country: 'India',
    location_lat: 22.7533,
    location_lng: 75.8937,
    property_type: 'residential',
    status: 'active',
    is_verified: true,
  });

  // price_per_hour is what search filters on; hourly_rate is what the booking
  // price is computed from. They are synced by hand in three controllers, so
  // seed both to the same number or prices drift silently.
  const mkSpace = (n, extra = {}) => ({
    property_id: property._id,
    owner_id: owner._id,
    space_number: n,
    space_type: 'covered',
    length_meters: 5.0,
    width_meters: 2.5,
    height_meters: 2.2,
    allowed_vehicle_types: ['car', 'suv'],
    space_description: 'Covered bay with smart barrier access',
    price_per_hour: 40, price_per_day: 300, price_per_month: 4500,
    hourly_rate: 40, daily_rate: 300, monthly_rate: 4500,
    status: 'active',
    booking_mode: 'both',
    is_available: true,
    ...extra,
  });

  const spaceA = await ParkingSpace.create(mkSpace('A-01', {
    device_id: DEVICE_ID,
    has_smart_barrier: true,
  }));
  const spaceB = await ParkingSpace.create(mkSpace('A-02'));

  // Availability anchored to runtime — a literal date goes stale overnight
  // and is the classic morning-of-the-demo failure.
  for (const space of [spaceA, spaceB]) {
    for (let day = 0; day < 7; day += 1) {
      await SpaceAvailability.create({
          space_id: space._id,
        day_of_week: day,
        available_from: '00:00',
        available_to: '23:59',
        is_available: true,
      });
    }
  }

  // ---- barrier device ----------------------------------------------------
  // owner_id references User, not Owner — pairDevice passes req.user._id.
  const device = await Device.create({
    device_id: DEVICE_ID,
    owner_id: ownerUser._id,
    parking_space_id: spaceA._id,
    name: 'Sunrise A-01 Barrier',
    device_type: 'barrier',
    status: 'online',
    secret_token: DEVICE_SECRET,
    command_counter: 0,
    last_state: { state: 'secure', angle: 90, target: 90 },
    last_seen_at: now,
  });

  // ---- driver with a live paid booking -> ANPR ALLOW ---------------------
  const driver = await User.create({
    email: 'driver@parkfnb.com',
    phone: '9555000003',
    password_hash: hash,
    first_name: 'Amit',
    last_name: 'Verma',
    user_type: 'user',
    is_phone_verified: true,
    is_active: true,
  });

  const vehicle = await UserVehicle.create({
    user_id: driver._id,
    vehicle_type: 'car',
    vehicle_size: 'medium',
    registration_number: ALLOW_PLATE,
    license_plate: ALLOW_PLATE,
    make: 'Maruti', model: 'Swift',
    vehicle_make: 'Maruti', vehicle_model: 'Swift',
    vehicle_year: 2022,
    is_default: true,
    is_verified: true,
  });

  // Starts 15 min out, so unlockBarrier's 30-minute early window is already
  // open when the demo runs.
  const start = new Date(now.getTime() + 15 * 60 * 1000);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

  const booking = await Booking.create({
    booking_number: `PFB${Date.now().toString().slice(-8)}`,
    user_id: driver._id,
    owner_id: owner._id,
    space_id: spaceA._id,
    vehicle_id: vehicle._id,
    start_time: start,
    end_time: end,
    duration_hours: 3,
    base_price: 120,
    discount_amount: 0,
    total_amount: 120,
    currency: 'INR',
    status: 'confirmed',
    payment_status: 'paid',
  });

  // The Payment enums still carry the original US-market values — there is no
  // razorpay/upi option yet, so the closest valid pair is used here. Worth
  // fixing in the model before a pilot, not before the demo.
  await Payment.create({
    payment_number: `PAY${Date.now().toString().slice(-8)}`,
    booking_id: booking._id,
    user_id: driver._id,
    amount: 120,
    currency: 'INR',
    payment_method: 'credit_card',
    payment_provider: 'stripe',
    provider_transaction_id: `DEMO_${Date.now()}`,
    payment_status: 'succeeded',
    paid_at: now,
  });

  // A second booking in `pending` for the owner app's approve/reject screen.
  const laterStart = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  await Booking.create({
    booking_number: `PFB${(Date.now() + 1).toString().slice(-8)}`,
    user_id: driver._id,
    owner_id: owner._id,
    space_id: spaceB._id,
    vehicle_id: vehicle._id,
    start_time: laterStart,
    end_time: new Date(laterStart.getTime() + 2 * 60 * 60 * 1000),
    duration_hours: 2,
    base_price: 80,
    discount_amount: 0,
    total_amount: 80,
    currency: 'INR',
    status: 'pending',
    payment_status: 'pending',
  });

  // ---- stranger with no booking -> ANPR DENY -----------------------------
  const stranger = await User.create({
    email: 'stranger@parkfnb.com',
    phone: '9555000004',
    password_hash: hash,
    first_name: 'Unknown',
    last_name: 'Driver',
    user_type: 'user',
    is_active: true,
  });

  await UserVehicle.create({
    user_id: stranger._id,
    vehicle_type: 'car',
    vehicle_size: 'medium',
    registration_number: DENY_PLATE,
    license_plate: DENY_PLATE,
    make: 'Hyundai', model: 'i20',
    vehicle_make: 'Hyundai', vehicle_model: 'i20',
    is_default: true,
  });

  return { admin, ownerUser, pendingUser, pendingOwner, driver, spaceA,
    device, booking, vehicle };
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  const shown = uri.replace(/:[^:@]+@/, ':***@');
  line();
  line('ParkFNB demo seed');
  line('='.repeat(64));
  ok('database', shown);
  line();

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 25000 });

  if (wantClean || wantReset) await clean();
  if (wantClean) {
    await mongoose.disconnect();
    return;
  }

  const existing = await User.countDocuments({ email: { $in: SEED_EMAILS } });
  if (existing) {
    line('Demo rows already present. Run with --reset to rebuild them.');
    await mongoose.disconnect();
    return;
  }

  const r = await seed();

  line('Created');
  line('-'.repeat(64));
  ok('admin login', `admin@parkfnb.com / ${PASSWORD}`);
  ok('owner (verified)', `owner@parkfnb.com / ${PASSWORD}`);
  ok('owner (KYC pending)', `newowner@parkfnb.com  <- approve this live`);
  ok('driver', `driver@parkfnb.com / ${PASSWORD}`);
  line();
  ok('space', `${r.spaceA.space_number}  Rs.40/hr`);
  ok('device', `${r.device.device_id}  -> BARRIER_001`);
  line();
  ok('ALLOW plate', `${ALLOW_PLATE}  (paid booking, starts in 15 min)`);
  ok('DENY plate', `${DENY_PLATE}  (registered, no booking)`);
  ok('booking id', r.booking._id);
  line();
  line('Test it');
  line('-'.repeat(64));
  line('  curl -F "image=@demo_car.jpg" -F device_id=pb-001 \\');
  line('       localhost:8008/gate-event');
  line();
  line('OTP login on the apps: any phone above, code 123456');
  line();

  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('\nSeed failed:', err.message);
  if (err.errors) {
    for (const [field, e] of Object.entries(err.errors)) {
      console.error(`  ${field}: ${e.message}`);
    }
  }
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
