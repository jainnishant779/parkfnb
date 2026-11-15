/**
 * Repair image references that point at storage which no longer exists.
 *
 *   node scripts/fix-images.js            report only, changes nothing
 *   node scripts/fix-images.js --apply    clear dead paths, fill the demo space
 *
 * Why this is needed: uploads used to land on Render's local disk under
 * /uploads. That filesystem is wiped on every deploy, so those files are gone
 * while the database still points at them. Every one of those URLs is a 404,
 * which is why the apps show broken images rather than an empty state.
 *
 * Cloudinary is live now, so anything uploaded from here on survives. This
 * only cleans up what was left behind, and optionally gives the demo space a
 * real photo so the recordings do not look unfinished.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const ParkingSpace = require('../src/models/ParkingSpace');
const Property = require('../src/models/Property');
const User = require('../src/models/User');

const APPLY = process.argv.includes('--apply');

// Anything still served from the ephemeral disk. Cloudinary URLs are absolute
// and start with https://res.cloudinary.com, so they are left alone.
const isDead = (url) => typeof url === 'string'
  && (url.startsWith('/uploads/') || url.includes('/uploads/'))
  && !url.includes('res.cloudinary.com');

// Photos for the demo listing. Remote, so no server disk is involved.
const DEMO_SPACE_IMAGES = [
  'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=1200&q=80',
  'https://images.unsplash.com/photo-1470224114660-3f6686c562eb?w=1200&q=80',
];
const DEMO_PROPERTY_IMAGES = [
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=80',
];

const line = (t = '') => console.log(t);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 25000 });

  line();
  line(APPLY ? 'Repairing image references' : 'Dry run — nothing will be changed');
  line('='.repeat(64));
  line(`  ${uri.replace(/:[^:@]+@/, ':***@')}`);
  line();

  let deadFound = 0;
  let cleared = 0;

  // ---- parking spaces ----------------------------------------------------
  const spaces = await ParkingSpace.find({}).select('space_number space_images');
  for (const s of spaces) {
    const imgs = s.space_images || [];
    const alive = imgs.filter((u) => !isDead(u));
    const dead = imgs.length - alive.length;
    if (!dead) continue;

    deadFound += dead;
    line(`  space ${s.space_number}: ${dead} dead reference${dead > 1 ? 's' : ''}`);
    if (APPLY) {
      s.space_images = alive;
      await s.save();
      cleared += dead;
    }
  }

  // ---- properties --------------------------------------------------------
  const props = await Property.find({}).select('property_name property_images');
  for (const p of props) {
    const imgs = p.property_images || [];
    const alive = imgs.filter((u) => !isDead(u));
    const dead = imgs.length - alive.length;
    if (!dead) continue;

    deadFound += dead;
    line(`  property ${p.property_name}: ${dead} dead reference${dead > 1 ? 's' : ''}`);
    if (APPLY) {
      p.property_images = alive;
      await p.save();
      cleared += dead;
    }
  }

  // ---- profile photos ----------------------------------------------------
  const users = await User.find({ profile_image_url: { $nin: [null, ''] } })
    .select('email phone profile_image_url');
  for (const u of users) {
    if (!isDead(u.profile_image_url)) continue;
    deadFound += 1;
    line(`  user ${u.email || u.phone}: dead profile photo`);
    if (APPLY) {
      u.profile_image_url = null;
      await u.save();
      cleared += 1;
    }
  }

  line();
  line(`  dead references found: ${deadFound}`);
  if (APPLY) line(`  cleared:               ${cleared}`);

  // ---- give the demo listing real photos ---------------------------------
  const demoOwner = await User.findOne({ email: 'owner@parkfnb.com' }).select('_id');
  if (demoOwner) {
    const Owner = require('../src/models/Owner');
    const owner = await Owner.findOne({ user_id: demoOwner._id }).select('_id');

    if (owner) {
      const demoSpaces = await ParkingSpace.find({ owner_id: owner._id });
      const demoProps = await Property.find({ owner_id: owner._id });

      line();
      line(`  demo listing: ${demoSpaces.length} space(s), ${demoProps.length} property(ies)`);

      if (APPLY) {
        for (const s of demoSpaces) {
          s.space_images = DEMO_SPACE_IMAGES;
          await s.save();
        }
        for (const p of demoProps) {
          p.property_images = DEMO_PROPERTY_IMAGES;
          await p.save();
        }
        line('  demo photos set');
      }
    }
  } else {
    line();
    line('  no demo owner found — run seed-demo.js first');
  }

  line();
  if (!APPLY) {
    line('  Re-run with --apply to make these changes.');
    line();
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nFailed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
