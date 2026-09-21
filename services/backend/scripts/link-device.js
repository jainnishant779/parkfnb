#!/usr/bin/env node
/**
 * Pair a smart-barrier device to a parking space, from the command line.
 *
 * The owner app's pair screen creates the Device row but never sends a
 * parking_space_id, and nothing else in the app can set one. A device paired
 * that way is owned but attached to nothing, so the guest's Unlock button
 * answers 404 "No smart barrier device is linked to this parking space".
 * This script does the linking until that screen grows a space picker.
 *
 * It writes BOTH sides of the link, because the two read paths disagree about
 * which one is authoritative: unlockBarrier reads ParkingSpace.device_id
 * (a string) and falls back to Device.parking_space_id, while the ANPR camera
 * path reads only Device.parking_space_id.
 *
 * Usage:
 *   node scripts/link-device.js --list
 *   node scripts/link-device.js --device pb-001 --space A-1 --token my-secret
 *   node scripts/link-device.js --device pb-001 --space A-1 --unlink
 */

require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const arg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Run this from services/backend with a .env file.');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const Device = require('../src/models/Device');
  const ParkingSpace = require('../src/models/ParkingSpace');
  const Owner = require('../src/models/Owner');
  require('../src/models/Property');

  const spaces = await ParkingSpace.find({})
    .populate('property_id', 'property_name')
    .lean();

  if (flag('list') || !arg('device')) {
    console.log('\nSpaces you can link a barrier to:\n');
    for (const s of spaces) {
      const prop = s.property_id ? s.property_id.property_name : '(no property)';
      const linked = s.device_id ? `  <- ${s.device_id}` : '';
      console.log(`  ${String(s.space_number).padEnd(8)} ${prop}${linked}`);
      console.log(`           id: ${s._id}`);
    }
    console.log('\nThen:  node scripts/link-device.js --device pb-001 --space A-1 --token <your-secret>\n');
    await mongoose.disconnect();
    return;
  }

  const deviceId = arg('device');
  const spaceKey = arg('space');
  if (!spaceKey) {
    console.error('Missing --space. Pass a space number (A-1) or a space id. Use --list to see them.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Accept either a space number or a raw ObjectId, so you can copy either
  // one out of --list without thinking about which is which.
  const space = spaces.find(
    (s) => String(s.space_number) === spaceKey || String(s._id) === spaceKey
  );
  if (!space) {
    console.error(`No space matches "${spaceKey}". Run --list to see what exists.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const propName = space.property_id ? space.property_id.property_name : '(no property)';

  if (flag('unlink')) {
    await ParkingSpace.updateOne({ _id: space._id }, { $set: { device_id: null, has_smart_barrier: false } });
    await Device.updateOne({ device_id: deviceId }, { $set: { parking_space_id: null } });
    console.log(`\nUnlinked ${deviceId} from ${space.space_number} / ${propName}\n`);
    await mongoose.disconnect();
    return;
  }

  // Device.owner_id refs User, while ParkingSpace.owner_id refs Owner, so the
  // space's owner has to be resolved back to its user before it can be stored.
  const owner = await Owner.findById(space.owner_id).lean();
  if (!owner) {
    console.error(`Space ${space.space_number} has no owner record — cannot set device owner.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const token = arg('token');
  const update = {
    owner_id: owner.user_id,
    parking_space_id: space._id,
    device_type: 'barrier',
  };
  if (token) update.secret_token = token;

  const device = await Device.findOneAndUpdate(
    { device_id: deviceId },
    { $set: update, $setOnInsert: { device_id: deviceId, name: `Barrier ${space.space_number}` } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await ParkingSpace.updateOne(
    { _id: space._id },
    { $set: { device_id: deviceId, has_smart_barrier: true } }
  );

  console.log(`\n  device      ${device.device_id}`);
  console.log(`  space       ${space.space_number} / ${propName}`);
  console.log(`  secret      ${device.secret_token}`);
  console.log(`  status      ${device.status} (last seen ${device.last_seen_at || 'never'})`);
  console.log(`\n  Put this exact secret in firmware/parkbnb_esp32/config.h as CMD_TOKEN,`);
  console.log(`  or the barrier will answer "REJECTED: Bad token".\n`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
