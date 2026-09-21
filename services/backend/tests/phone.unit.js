/**
 * Unit test for phone-number normalisation. No DB, no server:
 *   node tests/phone.unit.js
 *
 * Regression guard for the bug where an unconditional /^(\+91|91|0)/ strip
 * also ate the first two digits of a plain 10-digit number starting with 91
 * (9123456789 -> 23456789), locking those subscribers out of both apps.
 */
const assert = require('assert');

// Mirrors normalizeIdentifier in src/controllers/otpController.js.
const normalize = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (value.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
      ? { identifier: value, channel: 'email' }
      : null;
  }
  let digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  digits = digits.replace(/^\+/, '');
  return /^[6-9]\d{9}$/.test(digits) ? { identifier: digits, channel: 'sms' } : null;
};

const phone = (raw) => { const r = normalize(raw); return r && r.channel === 'sms' ? r.identifier : null; };

const cases = [
  // [input, expected]
  ['9876543210', '9876543210'],
  ['+919876543210', '9876543210'],
  ['919876543210', '9876543210'],
  ['09876543210', '9876543210'],
  ['+91 98765 43210', '9876543210'],
  ['98765-43210', '9876543210'],
  ['(987) 654-3210', '9876543210'],
  // the regression: valid 10-digit numbers that begin with 91
  ['9123456789', '9123456789'],
  ['9112345678', '9112345678'],
  ['+919123456789', '9123456789'],
  ['919123456789', '9123456789'],
  // still rejected
  ['1234567890', null],   // must start 6-9
  ['98765', null],        // too short
  ['98765432100', null],  // 11 digits, no leading 0
  ['', null],
  [null, null],
  ['abcdefghij', null],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = phone(input);
  if (got === expected) console.log(`PASS  ${JSON.stringify(input)} -> ${got}`);
  else { failed++; console.log(`FAIL  ${JSON.stringify(input)} -> expected ${expected}, got ${got}`); }
}

// email side
const emails = [['a@b.co', 'a@b.co'], ['A@B.CO', 'a@b.co'], ['bad@', null], ['no-at-sign', null]];
for (const [input, expected] of emails) {
  const r = normalize(input);
  const got = r && r.channel === 'email' ? r.identifier : null;
  if (got === expected) console.log(`PASS  email ${JSON.stringify(input)} -> ${got}`);
  else { failed++; console.log(`FAIL  email ${JSON.stringify(input)} -> expected ${expected}, got ${got}`); }
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
