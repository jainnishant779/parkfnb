#!/usr/bin/env node
/**
 * Promote a phone number to admin, creating the account if it does not exist.
 *
 *   node scripts/make-admin.js 9826012345
 *
 * There is no other way in: the admin panel signs in through the same OTP flow
 * as the apps and then checks user_type === 'admin', and nothing in the API
 * can grant that role — deliberately, since an endpoint that mints admins is
 * an endpoint someone can find.
 *
 * Reads MONGODB_URI from .env, so run it against whichever database you mean
 * to change. For the deployed database, export the Atlas URI first.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const phone = (process.argv[2] || '').replace(/\D/g, '').slice(-10);

if (phone.length !== 10) {
  console.error('Usage: node scripts/make-admin.js <10-digit-mobile>');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Check .env, or export it for a remote database.');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Show which database is about to change: running this against the wrong
  // one is easy and the mistake is invisible afterwards.
  const { host, name } = mongoose.connection;
  console.log(`Connected to ${host}/${name}`);

  let user = await User.findOne({ phone });

  if (user) {
    if (user.user_type === 'admin') {
      console.log(`${phone} is already an admin.`);
    } else {
      user.user_type = 'admin';
      user.onboarding_step = 'completed';
      await user.save();
      console.log(`${phone} promoted to admin (was ${user.user_type}).`);
    }
  } else {
    user = await User.create({
      phone,
      user_type: 'admin',
      auth_method: 'otp',
      onboarding_step: 'completed',
      is_verified: true,
    });
    console.log(`Created admin account for ${phone}.`);
  }

  console.log('\nSign in at the admin panel with this number. The one-time code');
  console.log('is printed to the API server log, not returned to the browser.');

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
