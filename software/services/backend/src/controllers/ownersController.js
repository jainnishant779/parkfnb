/**
 * Owners Controller
 * Handles owner registration, KYC verification, and earnings management
 */

const Owner = require('../models/Owner');
const User = require('../models/User');
const Booking = require('../models/Booking');
const ParkingSpace = require('../models/ParkingSpace');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * @desc    Register as owner (upgrade from user)
 * @route   POST /api/owners/register
 * @access  Private
 */
exports.registerOwner = async (req, res, next) => {
  try {
    const {
      owner_type = 'individual',
      business_name,
      payout_bank_account,
      payout_method = 'bank_transfer'
    } = req.body;

    // Check if user exists
    const user = await User.findById(req.user._id);
    if (!user) {
      return error(res, errorCodes.NOT_FOUND, 404, 'User not found');
    }

    // Check if user is already an owner
    const existingOwner = await Owner.findOne({ user_id: req.user._id });
    if (existingOwner) {
      return error(res, errorCodes.BIZ_CONFLICT, 409, 'User is already registered as an owner');
    }

    // Validate business name for non-individual types
    if ((owner_type === 'business' || owner_type === 'property_manager') && !business_name) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Business name is required for business/property manager types');
    }

    // Create owner profile
    const owner = await Owner.create({
      user_id: req.user._id,
      owner_type,
      business_name,
      payout_bank_account,
      payout_method,
      total_earnings: 0,
      average_rating: 0,
      is_verified: false
    });

    // Update user type to owner
    user.user_type = 'owner';
    await user.save();

    return success(res, { owner }, null, 201);
  } catch (err) {
    console.error('Register owner error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error registering as owner');
  }
};

/**
 * @desc    Get owner profile
 * @route   GET /api/owners/:id
 * @access  Private/Owner or Admin
 */
exports.getOwnerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get owner profile
    const owner = await Owner.findById(id).populate('user_id', 'email first_name last_name phone_number');

    if (!owner) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Owner not found');
    }

    // Check authorization - user must be the owner or admin
    if (owner.user_id._id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view this owner profile');
    }

    return success(res, { owner });
  } catch (err) {
    console.error('Get owner by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching owner profile');
  }
};

/**
 * @desc    Update owner profile
 * @route   PUT /api/owners/:id
 * @access  Private/Owner
 */
exports.updateOwner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      owner_type,
      business_name,
      payout_bank_account,
      payout_method
    } = req.body;

    // Get owner profile
    const owner = await Owner.findById(id);

    if (!owner) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Owner not found');
    }

    // Check authorization - user must be the owner or admin
    if (owner.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to update this owner profile');
    }

    // Validate business name for non-individual types
    if ((owner_type === 'business' || owner_type === 'property_manager') && !business_name && !owner.business_name) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Business name is required for business/property manager types');
    }

    // Update fields
    if (owner_type) owner.owner_type = owner_type;
    if (business_name) owner.business_name = business_name;
    if (payout_bank_account) owner.payout_bank_account = payout_bank_account;
    if (payout_method) owner.payout_method = payout_method;

    await owner.save();

    return success(res, { owner });
  } catch (err) {
    console.error('Update owner error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating owner profile');
  }
};

/**
 * @desc    Submit KYC documents
 * @route   POST /api/owners/:id/kyc
 * @access  Private/Owner
 */
exports.submitKYC = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { kyc_document_type, kyc_document_number } = req.body;

    // Get owner profile
    const owner = await Owner.findById(id);

    if (!owner) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Owner not found');
    }

    // Check authorization - user must be the owner
    if (owner.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to submit KYC for this owner');
    }

    // Validate KYC data
    if (!kyc_document_type || !kyc_document_number) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'KYC document type and number are required');
    }

    // In a real application, this would store KYC documents and trigger verification
    // For now, we'll just store basic info
    owner.kyc_document_type = kyc_document_type;
    owner.kyc_document_number = kyc_document_number;
    owner.kyc_submitted_at = new Date();
    owner.is_verified = false; // Reset verification status on new submission

    await owner.save();

    return success(res, {
      message: 'KYC documents submitted successfully',
      owner
    });
  } catch (err) {
    console.error('Submit KYC error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error submitting KYC documents');
  }
};

/**
 * @desc    Verify KYC (admin only)
 * @route   PUT /api/owners/:id/verify-kyc
 * @access  Private/Admin
 */
exports.verifyKYC = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_verified, verification_notes } = req.body;

    // Admin check
    if (req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only admins can verify KYC');
    }

    // Get owner profile
    const owner = await Owner.findById(id);

    if (!owner) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Owner not found');
    }

    const approved = is_verified !== undefined ? is_verified : true;

    // kyc_status is the field the owner app and /onboarding-status read.
    // Setting only is_verified left an approved owner still seeing "KYC under
    // review", indistinguishable from one nobody had looked at yet.
    owner.is_verified = approved;
    owner.kyc_status = approved ? 'verified' : 'rejected';
    owner.kyc_verification_notes = verification_notes || '';

    if (approved) {
      owner.kyc_verified_at = new Date();
      owner.kyc_rejection_reason = undefined;
    } else {
      // The app renders this to tell the owner what to fix; without it a
      // rejection is a dead end.
      owner.kyc_rejection_reason = verification_notes || 'Please resubmit your documents';
      owner.kyc_verified_at = undefined;
    }

    await owner.save();

    // Move the user's onboarding step in step with the decision, so the app
    // routes them to the dashboard rather than back into the wizard.
    const user = await User.findById(owner.user_id);
    if (user) {
      if (approved) {
        user.onboarding_step = 'completed';
      } else if (user.onboarding_step === 'kyc_submitted') {
        user.onboarding_step = 'profile_setup';
      }
      await user.save();
    }

    const { publicOwner } = require('./otpController');
    return success(res, {
      message: `Owner KYC ${approved ? 'verified' : 'rejected'} successfully`,
      owner: publicOwner(owner)
    });
  } catch (err) {
    console.error('Verify KYC error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error verifying KYC');
  }
};

/**
 * @desc    Get owner earnings summary
 * @route   GET /api/owners/:id/earnings
 * @access  Private/Owner
 */
exports.getEarnings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;

    // Get owner profile
    const owner = await Owner.findById(id);

    if (!owner) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Owner not found');
    }

    // Check authorization - user must be the owner or admin
    if (owner.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view earnings for this owner');
    }

    // Build date filter
    const dateFilter = {};
    if (start_date) {
      dateFilter.$gte = new Date(start_date);
    }
    if (end_date) {
      dateFilter.$lte = new Date(end_date);
    }

    // Build booking filter
    const bookingFilter = {
      owner_id: id,
      payment_status: 'paid'
    };

    if (Object.keys(dateFilter).length > 0) {
      bookingFilter.created_at = dateFilter;
    }

    // Get earnings data
    const bookings = await Booking.find(bookingFilter)
      .select('total_amount created_at booking_number status')
      .sort({ created_at: -1 });

    // Calculate totals
    const total_earnings = bookings.reduce((sum, booking) => sum + booking.total_amount, 0);
    const total_bookings = bookings.length;

    // Calculate average booking value
    const average_booking_value = total_bookings > 0 ? total_earnings / total_bookings : 0;

    // Get pending earnings (confirmed but not yet paid)
    const pendingBookings = await Booking.find({
      owner_id: id,
      payment_status: 'pending',
      status: { $in: ['confirmed', 'active'] }
    });

    const pending_earnings = pendingBookings.reduce((sum, booking) => sum + booking.total_amount, 0);

    const earnings_summary = {
      total_earnings: Math.round(total_earnings * 100) / 100,
      pending_earnings: Math.round(pending_earnings * 100) / 100,
      total_bookings,
      average_booking_value: Math.round(average_booking_value * 100) / 100,
      earnings_breakdown: bookings.map(b => ({
        booking_number: b.booking_number,
        amount: b.total_amount,
        status: b.status,
        date: b.created_at
      }))
    };

    return success(res, { earnings_summary });
  } catch (err) {
    console.error('Get earnings error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching earnings');
  }
};

/**
 * @desc    Get owner statistics
 * @route   GET /api/owners/:id/stats
 * @access  Private/Owner
 */
exports.getOwnerStats = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get owner profile
    const owner = await Owner.findById(id);

    if (!owner) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Owner not found');
    }

    // Check authorization - user must be the owner or admin
    if (owner.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view stats for this owner');
    }

    // Get parking spaces count
    const total_spaces = await ParkingSpace.countDocuments({ owner_id: id });
    const active_spaces = await ParkingSpace.countDocuments({ owner_id: id, is_available: true });

    // Get bookings stats
    const total_bookings = await Booking.countDocuments({ owner_id: id });
    const active_bookings = await Booking.countDocuments({
      owner_id: id,
      status: 'active'
    });
    const completed_bookings = await Booking.countDocuments({
      owner_id: id,
      status: 'completed'
    });
    const cancelled_bookings = await Booking.countDocuments({
      owner_id: id,
      status: 'cancelled'
    });

    // Get revenue stats
    const paidBookings = await Booking.find({
      owner_id: id,
      payment_status: 'paid'
    }).select('total_amount');

    const total_revenue = paidBookings.reduce((sum, booking) => sum + booking.total_amount, 0);

    // Calculate occupancy rate (completed bookings / total bookings)
    const occupancy_rate = total_bookings > 0 ? (completed_bookings / total_bookings) * 100 : 0;

    // Get this month's stats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthly_bookings = await Booking.countDocuments({
      owner_id: id,
      created_at: { $gte: startOfMonth }
    });

    const monthlyPaidBookings = await Booking.find({
      owner_id: id,
      payment_status: 'paid',
      created_at: { $gte: startOfMonth }
    }).select('total_amount');

    const monthly_revenue = monthlyPaidBookings.reduce((sum, booking) => sum + booking.total_amount, 0);

    const stats = {
      // Space stats
      total_spaces,
      active_spaces,
      inactive_spaces: total_spaces - active_spaces,

      // Booking stats
      total_bookings,
      active_bookings,
      completed_bookings,
      cancelled_bookings,

      // Revenue stats
      total_revenue: Math.round(total_revenue * 100) / 100,
      monthly_revenue: Math.round(monthly_revenue * 100) / 100,
      monthly_bookings,

      // Performance metrics
      average_rating: owner.average_rating,
      occupancy_rate: Math.round(occupancy_rate * 100) / 100,

      // Verification status
      is_verified: owner.is_verified
    };

    return success(res, { stats });
  } catch (err) {
    console.error('Get owner stats error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching owner stats');
  }
};

/**
 * @desc    Get all owners (admin only)
 * @route   GET /api/owners
 * @access  Private/Admin
 */
exports.getAllOwners = async (req, res, next) => {
  try {
    // Admin check
    if (req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only admins can view all owners');
    }

    const { page = 1, limit = 20, is_verified, owner_type, search } = req.query;
    const validPage = Math.max(1, parseInt(page));
    const validLimit = Math.min(100, Math.max(1, parseInt(limit)));

    // Build filter
    const filter = {};

    // Filter by verification status
    if (is_verified !== undefined) {
      filter.is_verified = is_verified === 'true';
    }

    // Filter by owner type
    if (owner_type) {
      filter.owner_type = owner_type;
    }

    // Get total count
    const total = await Owner.countDocuments(filter);

    // Get owners with pagination
    let query = Owner.find(filter)
      .populate('user_id', 'email first_name last_name phone_number')
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    const owners = await query;

    // If search query provided, filter by name/email
    let filteredOwners = owners;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredOwners = owners.filter(owner => {
        const user = owner.user_id;
        const businessName = owner.business_name ? owner.business_name.toLowerCase() : '';
        const firstName = user.first_name ? user.first_name.toLowerCase() : '';
        const lastName = user.last_name ? user.last_name.toLowerCase() : '';
        const email = user.email ? user.email.toLowerCase() : '';

        return businessName.includes(searchLower) ||
               firstName.includes(searchLower) ||
               lastName.includes(searchLower) ||
               email.includes(searchLower);
      });
    }

    const meta = paginationMeta(validPage, validLimit, total);

    return success(res, { owners: filteredOwners }, meta);
  } catch (err) {
    console.error('Get all owners error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching owners');
  }
};

/* -------------------------------------------------------------------------
 * The owner app's onboarding wizard: /me/profile, /me/kyc, /me/kyc/draft.
 *
 * The app sends camelCase; caseTransform on the wire turns it into the
 * snake_case below. Profile data is split across two documents — the person
 * lives on User, the business/land details on Owner — so the profile endpoint
 * returns { user, owner } and the app writes both back into its auth context.
 * ---------------------------------------------------------------------- */

/** The Owner row for the signed-in user, created on demand. */
const ownerForUser = async (user) => {
  let owner = await Owner.findOne({ user_id: user._id });
  if (!owner) {
    owner = await Owner.create({ user_id: user._id, owner_type: 'individual' });
  }
  return owner;
};

/**
 * @desc    Update the signed-in owner's profile (User + Owner records)
 * @route   PUT /api/owners/me/profile
 * @access  Private
 */
exports.updateMyOwnerProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return error(res, errorCodes.USER_NOT_FOUND, 404, 'User not found');
    }

    const b = req.body || {};

    // ---- the person -----------------------------------------------------
    if (b.legal_name !== undefined) {
      user.legal_name = b.legal_name;
      // The app collects one "full name"; split it for the first/last pair
      // the rest of the API returns.
      const parts = String(b.legal_name).trim().split(/\s+/);
      if (parts[0]) {
        user.first_name = parts[0];
        user.last_name = parts.slice(1).join(' ');
      }
    }
    const userFields = [
      'first_name', 'last_name', 'email', 'alternate_phone', 'date_of_birth',
      'address_line1', 'address_line2', 'city', 'state', 'postal_code',
      'country', 'location_lat', 'location_lng', 'profile_picture_url'
    ];
    for (const f of userFields) {
      if (b[f] !== undefined) user[f] = b[f];
    }
    // This one screen calls the postal code "pincode".
    if (b.pincode !== undefined) user.postal_code = b.pincode;

    user.user_type = 'owner';
    // KYC is still ahead of them, so the profile only clears the auth step.
    if (user.onboarding_step === 'auth_complete') user.onboarding_step = 'profile_setup';

    // ---- the business / the land ----------------------------------------
    const owner = await ownerForUser(user);
    const ownerFields = [
      'owner_type', 'business_name', 'role_designation', 'registration_id',
      'land_label', 'landmark'
    ];
    for (const f of ownerFields) {
      if (b[f] !== undefined) owner[f] = b[f];
    }
    if (b.terms_accepted && !owner.terms_accepted_at) {
      owner.terms_accepted_at = new Date();
    }

    if ((owner.owner_type === 'business' || owner.owner_type === 'property_manager')
        && !owner.business_name) {
      return error(res, errorCodes.REQ_VALIDATION, 400,
        'Business name is required for business/property manager accounts');
    }

    await user.save();
    await owner.save();

    const { publicUser, publicOwner } = require('./otpController');
    return success(res, { user: publicUser(user), owner: publicOwner(owner) });
  } catch (err) {
    console.error('Update owner profile error:', err);
    if (err.code === 11000) {
      return error(res, errorCodes.REQ_DUPLICATE, 409, 'That email is already in use');
    }
    return error(res, errorCodes.SRV_INTERNAL, 500, 'Could not update profile');
  }
};

/** Copy whichever KYC blocks the body carries onto the Owner document. */
const applyKycBlocks = (owner, b) => {
  if (b.kyc_personal !== undefined) owner.kyc_personal = b.kyc_personal;
  if (b.kyc_identity !== undefined) {
    owner.kyc_identity = b.kyc_identity;
    // Mirrored onto their own columns so admin review can query them.
    if (b.kyc_identity && b.kyc_identity.document_type) {
      owner.kyc_document_type = b.kyc_identity.document_type;
    }
    if (b.kyc_identity && b.kyc_identity.document_number) {
      owner.kyc_document_number = b.kyc_identity.document_number;
    }
  }
  if (b.kyc_bank !== undefined) {
    owner.kyc_bank = b.kyc_bank;
    if (b.kyc_bank && b.kyc_bank.account_number) {
      owner.payout_bank_account = b.kyc_bank.account_number;
    }
  }
  if (b.kyc_address !== undefined) owner.kyc_address = b.kyc_address;
};

/**
 * @desc    Save a partial KYC draft — no validation, nothing is submitted
 * @route   PUT /api/owners/me/kyc/draft
 * @access  Private
 */
exports.saveMyKycDraft = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return error(res, errorCodes.USER_NOT_FOUND, 404, 'User not found');
    }

    const owner = await ownerForUser(user);
    applyKycBlocks(owner, req.body || {});

    // A draft never walks back a decision that has already been made.
    if (owner.kyc_status === 'not_started' || owner.kyc_status === 'rejected') {
      owner.kyc_status = 'draft';
    }
    await owner.save();

    const { publicOwner } = require('./otpController');
    return success(res, { owner: publicOwner(owner), message: 'Draft saved' });
  } catch (err) {
    console.error('Save KYC draft error:', err);
    return error(res, errorCodes.SRV_INTERNAL, 500, 'Could not save draft');
  }
};

/**
 * @desc    Submit KYC for review
 * @route   PUT /api/owners/me/kyc
 * @access  Private
 */
exports.submitMyKyc = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return error(res, errorCodes.USER_NOT_FOUND, 404, 'User not found');
    }

    const owner = await ownerForUser(user);
    if (owner.kyc_status === 'submitted' || owner.kyc_status === 'verified') {
      return error(res, errorCodes.BIZ_CONFLICT, 409,
        'Your KYC has already been submitted');
    }

    const b = req.body || {};
    applyKycBlocks(owner, b);

    // When the app says the address matches the profile, build the block from
    // User rather than trusting the client to resend it.
    if (b.kyc_address_same_as_profile) {
      owner.kyc_address = {
        address_line1: user.address_line1,
        address_line2: user.address_line2,
        city: user.city,
        state: user.state,
        postal_code: user.postal_code,
        country: user.country || 'IN',
        proof_document_url: (b.kyc_address || {}).proof_document_url
      };
    }

    const missing = [];
    const person = owner.kyc_personal || {};
    const identity = owner.kyc_identity || {};
    const bank = owner.kyc_bank || {};
    if (!person.full_name) missing.push('full name');
    if (!identity.document_type) missing.push('document type');
    if (!identity.document_number) missing.push('document number');
    if (!identity.front_image_url) missing.push('document front image');
    if (!bank.account_number) missing.push('bank account number');
    if (!bank.ifsc_code) missing.push('IFSC code');
    if (missing.length) {
      return error(res, errorCodes.REQ_VALIDATION, 400,
        'Please complete: ' + missing.join(', '));
    }

    owner.kyc_status = 'submitted';
    owner.kyc_submitted_at = new Date();
    owner.kyc_rejection_reason = undefined;
    await owner.save();

    // The owner app reads onboarding_step to pick its launch stack.
    if (user.onboarding_step !== 'completed') {
      user.onboarding_step = 'kyc_submitted';
      await user.save();
    }

    const { publicOwner } = require('./otpController');
    return success(res, {
      owner: publicOwner(owner),
      message: 'KYC submitted. We will review it shortly.'
    });
  } catch (err) {
    console.error('Submit KYC error:', err);
    return error(res, errorCodes.SRV_INTERNAL, 500, 'Could not submit KYC');
  }
};
