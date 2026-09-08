/**
 * OTP Authentication Controller
 *
 * Phone-first sign-in used by both mobile apps. One identifier (phone or email)
 * gets a short-lived numeric code; verifying it either signs the user in or
 * creates the account, so there is no separate "register" step.
 *
 * Delivery is pluggable — see sendCode() at the bottom. Until an SMS provider
 * is wired up the code is logged server-side and, outside production, returned
 * in the response so the apps can be exercised end to end.
 */

const User = require('../models/User');
const Owner = require('../models/Owner');
const OtpCode = require('../models/OtpCode');
const generateToken = require('../utils/generateToken');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

const CODE_LENGTH = 6;
const TTL_SECONDS = 5 * 60;     // code is valid for 5 minutes
const MAX_ATTEMPTS = 5;         // wrong guesses before the code is burned
const MAX_SENDS = 5;            // codes per identifier inside RESEND_WINDOW
const RESEND_WINDOW_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;

const isProd = () => process.env.NODE_ENV === 'production';

/**
 * Whether to return the OTP in the API response.
 *
 * This has to be opted into explicitly rather than inferred from NODE_ENV.
 * Managed hosts do not always set NODE_ENV, and if it were ever missing or
 * set to something like 'staging', an inferred check would fail open and hand
 * anyone the login code for any phone number they asked about.
 */
const exposeDevCode = () =>
  !isProd() && process.env.ALLOW_DEV_OTP === 'true';

/**
 * Accepts a 10-digit Indian mobile number, optionally with +91 / 0 prefix,
 * or an email address. Returns the normalised value and its channel.
 */
const normalizeIdentifier = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;

  if (value.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
      ? { identifier: value, channel: 'email' }
      : null;
  }

  const digits = value.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
  return /^[6-9]\d{9}$/.test(digits)
    ? { identifier: digits, channel: 'sms' }
    : null;
};

const randomCode = () => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
};

/**
 * Shapes a User document the way both apps' AuthUser type expects.
 * caseTransform on the client turns these into camelCase.
 */
const publicUser = (user) => ({
  id: user._id,
  email: user.email || undefined,
  phone: user.phone || undefined,
  first_name: user.first_name || '',
  last_name: user.last_name || '',
  legal_name: user.legal_name || undefined,
  profile_picture_url: user.profile_picture_url || undefined,
  user_type: user.user_type,
  auth_method: user.auth_method,
  onboarding_step: user.onboarding_step,
  is_verified: user.is_verified,
  alternate_phone: user.alternate_phone || undefined,
  date_of_birth: user.date_of_birth || undefined,
  address_line1: user.address_line1 || undefined,
  address_line2: user.address_line2 || undefined,
  city: user.city || undefined,
  state: user.state || undefined,
  postal_code: user.postal_code || undefined,
  created_at: user.created_at
});

const publicOwner = (owner) => (owner ? {
  id: owner._id,
  user_id: owner.user_id,
  owner_type: owner.owner_type,
  business_name: owner.business_name || undefined,
  role_designation: owner.role_designation || undefined,
  registration_id: owner.registration_id || undefined,
  land_label: owner.land_label || undefined,
  is_verified: owner.is_verified,
  kyc_status: owner.kyc_status,
  kyc_rejection_reason: owner.kyc_rejection_reason || undefined,
  kyc_personal: owner.kyc_personal || undefined,
  kyc_identity: owner.kyc_identity || undefined,
  kyc_address: owner.kyc_address || undefined,
  kyc_bank: owner.kyc_bank || undefined,
  created_at: owner.created_at
} : null);

/**
 * Hand the code to the user. Swap the body of this function for an SMS/email
 * provider call — nothing else in this file needs to change.
 */
const sendCode = async (identifier, channel, code) => {
  console.log(`[otp] ${channel} -> ${identifier} : ${code} (valid ${TTL_SECONDS}s)`);
  return true;
};

/**
 * Create and deliver a code. Shared by /otp/send and /otp/resend.
 */
const issueCode = async (res, rawIdentifier, rawChannel, { isResend }) => {
  const parsed = normalizeIdentifier(rawIdentifier);
  if (!parsed) {
    return error(res, errorCodes.REQ_INVALID_FORMAT, 400,
      'Enter a valid 10-digit mobile number or email address');
  }

  const { identifier } = parsed;
  const channel = rawChannel === 'email' || rawChannel === 'sms' ? rawChannel : parsed.channel;

  const latest = await OtpCode.findOne({ identifier }).sort({ created_at: -1 });
  const now = Date.now();

  if (latest && !latest.consumed_at) {
    const age = now - new Date(latest.created_at).getTime();

    if (age < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - age) / 1000);
      return error(res, errorCodes.RATE_LIMIT_EXCEEDED, 429,
        `Please wait ${wait}s before requesting another code`);
    }

    if (age < RESEND_WINDOW_MS && latest.sends >= MAX_SENDS) {
      return error(res, errorCodes.RATE_LIMIT_EXCEEDED, 429,
        'Too many codes requested. Try again in a few minutes.');
    }
  }

  const withinWindow = latest &&
    (now - new Date(latest.created_at).getTime()) < RESEND_WINDOW_MS;

  const code = randomCode();
  await OtpCode.create({
    identifier,
    code_hash: await OtpCode.hashCode(code),
    channel,
    sends: withinWindow ? latest.sends + 1 : 1,
    expires_at: new Date(now + TTL_SECONDS * 1000)
  });

  await sendCode(identifier, channel, code);

  const payload = {
    message: isResend ? 'A new code has been sent' : `Code sent via ${channel}`,
    channel,
    expires_in: TTL_SECONDS
  };
  // Without an SMS provider there is no other way to read the code. Gated on
  // an explicit flag, never on NODE_ENV alone — see exposeDevCode above.
  if (exposeDevCode()) payload.dev_code = code;

  return success(res, payload);
};

/**
 * @desc    Send a sign-in code
 * @route   POST /api/auth/otp/send
 * @access  Public
 */
exports.sendOtp = async (req, res) => {
  try {
    const { identifier, channel } = req.body || {};
    return await issueCode(res, identifier, channel, { isResend: false });
  } catch (err) {
    console.error('Send OTP error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not send the code');
  }
};

/**
 * @desc    Send a fresh code, invalidating the previous one
 * @route   POST /api/auth/otp/resend
 * @access  Public
 */
exports.resendOtp = async (req, res) => {
  try {
    const { identifier, channel } = req.body || {};
    const parsed = normalizeIdentifier(identifier);
    if (parsed) {
      // Burn any live code so only the newest one can be used.
      await OtpCode.updateMany(
        { identifier: parsed.identifier, consumed_at: null },
        { $set: { consumed_at: new Date() } }
      );
    }
    return await issueCode(res, identifier, channel, { isResend: true });
  } catch (err) {
    console.error('Resend OTP error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not resend the code');
  }
};

/**
 * @desc    Verify a code — signs in, or creates the account on first use
 * @route   POST /api/auth/otp/verify
 * @access  Public
 *
 * body: { identifier, code, role?, ownerType?, termsAccepted? }
 *   role      'user' (consumer app) — omitted by the owner app
 *   ownerType present  => an Owner record is created alongside the User
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { identifier: rawIdentifier, code, role, ownerType, termsAccepted } = req.body || {};

    const parsed = normalizeIdentifier(rawIdentifier);
    if (!parsed) {
      return error(res, errorCodes.REQ_INVALID_FORMAT, 400,
        'Enter a valid 10-digit mobile number or email address');
    }
    if (!code || !/^\d{4,8}$/.test(String(code).trim())) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Enter the code you received');
    }

    const { identifier, channel } = parsed;

    const otp = await OtpCode.findOne({ identifier, consumed_at: null })
      .sort({ created_at: -1 })
      .select('+code_hash');

    if (!otp) {
      return error(res, errorCodes.AUTH_INVALID_CREDENTIALS, 400,
        'That code has expired. Request a new one.');
    }
    if (otp.expires_at.getTime() < Date.now()) {
      return error(res, errorCodes.AUTH_INVALID_CREDENTIALS, 400,
        'That code has expired. Request a new one.');
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      otp.consumed_at = new Date();
      await otp.save();
      return error(res, errorCodes.AUTH_INVALID_CREDENTIALS, 429,
        'Too many incorrect attempts. Request a new code.');
    }

    if (!(await otp.matches(String(code).trim()))) {
      otp.attempts += 1;
      await otp.save();
      const left = MAX_ATTEMPTS - otp.attempts;
      return error(res, errorCodes.AUTH_INVALID_CREDENTIALS, 400,
        left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`
                 : 'Incorrect code. Request a new one.');
    }

    // Code is good — retire it so it cannot be replayed.
    otp.consumed_at = new Date();
    await otp.save();

    const isEmail = channel === 'email';
    const lookup = isEmail ? { email: identifier } : { phone: identifier };

    let user = await User.findOne(lookup);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await User.create({
        ...lookup,
        user_type: ownerType ? 'owner' : (role === 'owner' ? 'owner' : 'user'),
        auth_method: 'otp',
        onboarding_step: 'profile_setup',
        is_verified: true
      });
    } else {
      // A verified code proves control of the identifier.
      if (!user.is_verified) user.is_verified = true;
      user.last_login = new Date();
      await user.save();
    }

    if (!user.is_active) {
      return error(res, errorCodes.AUTH_ACCOUNT_LOCKED, 403,
        'This account is inactive. Contact support.');
    }

    // The owner app signs in with role 'owner' and only learns the owner
    // *type* later, in its onboarding wizard — so either signal means this
    // account needs an Owner record.
    let owner = await Owner.findOne({ user_id: user._id });
    if ((ownerType || role === 'owner') && !owner) {
      owner = await Owner.create({
        user_id: user._id,
        owner_type: ownerType || 'individual',
        kyc_status: 'not_started',
        terms_accepted_at: termsAccepted ? new Date() : undefined
      });
      if (user.user_type !== 'owner') {
        user.user_type = 'owner';
        await user.save();
      }
    }

    return success(res, {
      user: publicUser(user),
      owner: publicOwner(owner),
      token: generateToken(user._id),
      is_new_user: isNewUser
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not verify the code');
  }
};

/**
 * @desc    Where the owner app should send the user next
 * @route   GET /api/auth/onboarding-status
 * @access  Private
 */
exports.getOnboardingStatus = async (req, res) => {
  try {
    const user = req.user;
    const owner = await Owner.findOne({ user_id: user._id });
    const kycStatus = owner ? owner.kyc_status : 'not_started';

    // Owners must clear KYC; consumers are done once their profile is filled.
    let nextScreen = 'MainTabs';
    if (user.onboarding_step === 'auth_complete' || user.onboarding_step === 'profile_setup') {
      nextScreen = 'ProfileSetup';
    } else if (user.user_type === 'owner' &&
               ['not_started', 'draft', 'rejected'].includes(kycStatus)) {
      nextScreen = 'KycIntro';
    }

    return success(res, {
      onboarding_step: user.onboarding_step,
      kyc_status: kycStatus,
      is_onboarding_complete: user.onboarding_step === 'completed',
      next_screen: nextScreen
    });
  } catch (err) {
    console.error('Onboarding status error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not load onboarding status');
  }
};

// Reused by authController.getMe so both routes return the same shape.
exports.publicUser = publicUser;
exports.publicOwner = publicOwner;
