/**
 * Unit test for the booking price rule. No DB, no server:  node tests/pricing.unit.js
 */
const assert = require('assert');
const { calculateBookingPrice: price } = require('../src/utils/pricing');

const hourlyOnly = { hourly_rate: 40 };
const hourlyDaily = { hourly_rate: 40, daily_rate: 300 };
const allTiers = { hourly_rate: 40, daily_rate: 300, monthly_rate: 5000 };

const cases = [
  // [description, space, hours, expected]
  ['1 h at the hourly rate', hourlyDaily, 1, 40],
  ['2 h at the hourly rate', hourlyDaily, 2, 80],
  ['7.5 h at hourly equals the day rate', hourlyDaily, 7.5, 300],
  ['10 h is capped at the day rate', hourlyDaily, 10, 300],
  ['exactly 24 h costs one day, not 24 x hourly', hourlyDaily, 24, 300],
  ['25 h is 2 days', hourlyDaily, 25, 600],
  ['48 h is 2 days', hourlyDaily, 48, 600],
  ['hourly-only space: 24 h stays hourly', hourlyOnly, 24, 960],
  ['hourly-only space: 48 h no longer NaN', hourlyOnly, 48, 1920],
  ['hourly-only space: 31 days no longer NaN', hourlyOnly, 24 * 31, 40 * 24 * 31],
  ['30 days: monthly tier wins', allTiers, 24 * 30, 5000],
  ['31 days: 2 months vs 31 days', allTiers, 24 * 31, 9300],
  ['zero / negative / NaN durations are free', hourlyDaily, 0, 0],
  ['NaN duration', hourlyDaily, NaN, 0],
  ['no rates at all', {}, 5, 0],
  ['falls back to price_per_* fields', { price_per_hour: 25, price_per_day: 100 }, 6, 100],
];

let failed = 0;
for (const [name, space, hours, expected] of cases) {
  try {
    assert.strictEqual(price(space, hours), expected);
    console.log(`PASS  ${name}`);
  } catch {
    failed += 1;
    console.log(`FAIL  ${name}  expected ${expected}, got ${price(space, hours)}`);
  }
}

// The property that the old code broke: a longer stay never costs less.
let last = 0;
let monotonic = true;
for (let h = 1; h <= 24 * 65; h += 1) {
  const p = price(allTiers, h);
  if (p < last) { monotonic = false; console.log(`FAIL  price dropped at ${h} h (${last} -> ${p})`); break; }
  last = p;
}
if (monotonic) console.log('PASS  price never decreases as duration grows (1 h .. 65 days)');
else failed += 1;

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
