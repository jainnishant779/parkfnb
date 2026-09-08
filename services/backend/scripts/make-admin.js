#!/usr/bin/env node
/**
 * Create or promote an admin account.
 *
 *   node scripts/make-admin.js admin@parkfnb.com "a-strong-password"
 *   node scripts/make-admin.js admin@parkfnb.com "a-strong-password" "mongodb+srv://..."
 *
 * Admins sign in with an email and password rather than an OTP: the code goes
 * to the server log, and making someone read a deploy log to reach a dashboard
 * is not a login flow.
 *
 * No API endpoint grants this role, deliberately — an endpoint that mints
 * admins is an endpoint someone can find.
 */

const path = require('path');

// An explicit URI (argument or environment) wins over .env. Without this the
// script could quietly act on the local database while the operator believed
// they were pointing it at Atlas, report success, and leave the panel
// rejecting the login for no visible reason.
const [, , emailArg, passwordArg, uriArg] = process.argv;

if (uriArg) {
  process.env.MONGODB_URI = uriArg;
}
if (!process.env.MONGODB_URI) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../src/models/User');

const usage = () => {
  console.error('Usage: node scripts/make-admin.js <email> <password> [mongodb-uri]');
  console.error('');
  console.error('  Local:  node scripts/make-admin.js admin@parkfnb.com "secret1234"');
  console.error('  Atlas:  node scripts/make-admin.js admin@parkfnb.com "secret1234" "mongodb+srv://..."');
  console.error('');
  console.error('Quote both arguments. Windows cmd cuts an unquoted URI at the');
  console.error('first &, and Atlas strings carry one in ?retryWrites=true&w=majority.');
  process.exit(1);
};

const email = (emailArg || '').trim().toLowerCase();
const password = passwordArg || '';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) usage();

// Eight is the floor the API's own password validator enforces; anything
// shorter would be accepted here and then rejected at every reset.
if (password.length < 8) {
  console.error('The password must be at least 8 characters.');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('No database. Pass the URI as the third argument, or set MONGODB_URI.');
  process.exit(1);
}

(async () => {
  // Atlas can take a few seconds to elect a primary from a cold client; the
  // driver's 30s default makes a wrong connection string look like a hang.
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  // Name the database before changing it: running this against the wrong one
  // is easy, and the mistake is invisible afterwards.
  const { host, name } = mongoose.connection;
  console.log(`Connected to ${host}/${name}`);

  // An Atlas URI without a path selects 'test'. The admin lands there, the
  // script reports success, and the API — pointed at a different database —
  // then refuses the login with nothing to explain it.
  if (name === 'test') {
    console.error('');
    console.error("Refusing to write to the 'test' database.");
    console.error('The connection string has no database name. Add /parkfnb before');
    console.error('the query string:  ...mongodb.net/parkfnb?retryWrites=true...');
    await mongoose.disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user = await User.findOne({ email });

  if (user) {
    const wasAdmin = user.user_type === 'admin';
    user.user_type = 'admin';
    user.password_hash = passwordHash;
    user.onboarding_step = 'completed';
    user.is_verified = true;
    user.is_active = true;
    await user.save();
    console.log(wasAdmin
      ? `Password reset for existing admin ${email}.`
      : `${email} promoted to admin and given a password.`);
  } else {
    user = await User.create({
      email,
      user_type: 'admin',
      password_hash: passwordHash,
      auth_method: 'password',
      first_name: 'Admin',
      onboarding_step: 'completed',
      is_verified: true,
    });
    console.log(`Created admin account for ${email}.`);
  }

  console.log('\nSign in at the admin panel with this email and password.');

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
