/**
 * Booking price for a stay of `durationHours` on `space`.
 *
 * An owner must set an hourly rate; the daily and monthly rates are optional
 * discount tiers (the owner app says so). Each tier the space actually has is
 * priced for the whole stay, rounding the unit up (a 25 h stay is 2 days, a
 * 31 day stay is 2 months), and the guest pays the cheapest one. That makes the
 * price never fall as a stay gets longer, and a tier that was left blank is
 * simply not considered instead of turning the total into NaN.
 *
 * The rate fields come in two sets on ParkingSpace (`hourly_rate` and
 * `price_per_hour`, ...) that are kept in sync by hand, so accept either.
 */
const HOURS_PER_DAY = 24;
const HOURS_PER_MONTH = 24 * 30;

const rate = (space, primary, fallback) => {
  const value = Number(space?.[primary] ?? space?.[fallback]);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const calculateBookingPrice = (space, durationHours) => {
  const hours = Number(durationHours);
  if (!Number.isFinite(hours) || hours <= 0) return 0;

  const hourly = rate(space, 'hourly_rate', 'price_per_hour');
  const daily = rate(space, 'daily_rate', 'price_per_day');
  const monthly = rate(space, 'monthly_rate', 'price_per_month');

  const options = [];
  if (hourly) options.push(hourly * hours);
  if (daily) options.push(daily * Math.ceil(hours / HOURS_PER_DAY));
  if (monthly) options.push(monthly * Math.ceil(hours / HOURS_PER_MONTH));

  if (!options.length) return 0;

  // A duration derived from two timestamps carries millisecond noise, so an
  // extension could price at 80.00325555555555. Money is rounded to paise.
  return Math.round(Math.min(...options) * 100) / 100;
};

module.exports = { calculateBookingPrice };
