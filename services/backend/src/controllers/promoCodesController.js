/**
 * Promo Codes Controller
 * Handles promo code CRUD, validation, and usage tracking
 */

const PromoCode = require('../models/PromoCode');
const PromoCodeUsage = require('../models/PromoCodeUsage');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * @desc    Get all promo codes (admin only)
 * @route   GET /api/promo-codes
 * @access  Private/Admin
 */
exports.getAllPromoCodes = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Filter options
    const filter = {};

    if (req.query.is_active !== undefined) {
      filter.is_active = req.query.is_active === 'true';
    }

    if (req.query.promo_type) {
      filter.promo_type = req.query.promo_type;
    }

    // Get total count for pagination
    const total = await PromoCode.countDocuments(filter);

    // Get promo codes with pagination
    const promoCodes = await PromoCode.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    return success(res, {
      promo_codes: promoCodes
    }, paginationMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get promo code by code
 * @route   GET /api/promo-codes/:code
 * @access  Public
 */
exports.getPromoCodeByCode = async (req, res, next) => {
  try {
    const { code } = req.params;

    const promoCode = await PromoCode.findOne({
      code: code.toUpperCase()
    });

    if (!promoCode) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Promo code not found');
    }

    // Don't expose internal details to public, just basic info
    const publicInfo = {
      code: promoCode.code,
      promo_type: promoCode.promo_type,
      discount_value: promoCode.discount_value,
      max_discount_amount: promoCode.max_discount_amount,
      valid_from: promoCode.valid_from,
      valid_to: promoCode.valid_to,
      is_active: promoCode.is_active
    };

    return success(res, {
      promo_code: publicInfo
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Create promo code
 * @route   POST /api/promo-codes
 * @access  Private/Admin
 */
exports.createPromoCode = async (req, res, next) => {
  try {
    const {
      code,
      promo_type,
      discount_value,
      max_discount_amount,
      valid_from,
      valid_to,
      usage_limit_total
    } = req.body;

    // Check if promo code already exists
    const existingPromo = await PromoCode.findOne({
      code: code.toUpperCase()
    });

    if (existingPromo) {
      return error(res, errorCodes.BIZ_CONFLICT, 409, 'Promo code already exists');
    }

    // Validate dates
    const validFromDate = new Date(valid_from);
    const validToDate = new Date(valid_to);

    if (validToDate <= validFromDate) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Valid to date must be after valid from date');
    }

    // Validate discount value based on promo type
    if (promo_type === 'percentage' && discount_value > 100) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Percentage discount cannot exceed 100%');
    }

    if (discount_value <= 0) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Discount value must be greater than 0');
    }

    const promoCode = await PromoCode.create({
      code: code.toUpperCase(),
      promo_type,
      discount_value,
      max_discount_amount,
      valid_from: validFromDate,
      valid_to: validToDate,
      usage_limit_total,
      usage_count: 0,
      is_active: true
    });

    return success(res, {
      promo_code: promoCode
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Update promo code
 * @route   PUT /api/promo-codes/:id
 * @access  Private/Admin
 */
exports.updatePromoCode = async (req, res, next) => {
  try {
    const { id } = req.params;

    const promoCode = await PromoCode.findById(id);

    if (!promoCode) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Promo code not found');
    }

    const {
      promo_type,
      discount_value,
      max_discount_amount,
      valid_from,
      valid_to,
      usage_limit_total,
      is_active
    } = req.body;

    // Validate dates if provided
    if (valid_from && valid_to) {
      const validFromDate = new Date(valid_from);
      const validToDate = new Date(valid_to);

      if (validToDate <= validFromDate) {
        return error(res, errorCodes.REQ_VALIDATION, 400, 'Valid to date must be after valid from date');
      }
    }

    // Validate discount value if provided
    if (promo_type === 'percentage' && discount_value > 100) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Percentage discount cannot exceed 100%');
    }

    // Update fields
    if (promo_type !== undefined) promoCode.promo_type = promo_type;
    if (discount_value !== undefined) promoCode.discount_value = discount_value;
    if (max_discount_amount !== undefined) promoCode.max_discount_amount = max_discount_amount;
    if (valid_from !== undefined) promoCode.valid_from = new Date(valid_from);
    if (valid_to !== undefined) promoCode.valid_to = new Date(valid_to);
    if (usage_limit_total !== undefined) promoCode.usage_limit_total = usage_limit_total;
    if (is_active !== undefined) promoCode.is_active = is_active;

    await promoCode.save();

    return success(res, {
      promo_code: promoCode
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Delete promo code
 * @route   DELETE /api/promo-codes/:id
 * @access  Private/Admin
 */
exports.deletePromoCode = async (req, res, next) => {
  try {
    const { id } = req.params;

    const promoCode = await PromoCode.findById(id);

    if (!promoCode) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Promo code not found');
    }

    // Soft delete by setting is_active to false
    promoCode.is_active = false;
    await promoCode.save();

    return success(res, {
      deleted_code: promoCode.code
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Validate promo code
 * @route   POST /api/promo-codes/validate
 * @access  Private
 */
exports.validatePromoCode = async (req, res, next) => {
  try {
    const { code, booking_amount } = req.body;

    if (!code) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Promo code is required');
    }

    const promoCode = await PromoCode.findOne({
      code: code.toUpperCase()
    });

    if (!promoCode) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Invalid promo code');
    }

    // Check if promo code is active
    if (!promoCode.is_active) {
      return error(res, errorCodes.BIZ_CONFLICT, 400, 'Promo code is no longer active');
    }

    // Check if promo code is valid (date range)
    const now = new Date();
    if (now < promoCode.valid_from) {
      return error(res, errorCodes.BIZ_CONFLICT, 400, 'Promo code is not yet valid');
    }

    if (now > promoCode.valid_to) {
      return error(res, errorCodes.BIZ_CONFLICT, 400, 'Promo code has expired');
    }

    // Check usage limit
    if (promoCode.usage_limit_total && promoCode.usage_count >= promoCode.usage_limit_total) {
      return error(res, errorCodes.BIZ_CONFLICT, 400, 'Promo code usage limit reached');
    }

    // Calculate discount
    let discountAmount = 0;

    if (promoCode.promo_type === 'percentage') {
      discountAmount = (booking_amount * promoCode.discount_value) / 100;

      // Apply max discount cap if set
      if (promoCode.max_discount_amount && discountAmount > promoCode.max_discount_amount) {
        discountAmount = promoCode.max_discount_amount;
      }
    } else if (promoCode.promo_type === 'fixed_amount') {
      discountAmount = promoCode.discount_value;

      // Discount cannot exceed booking amount
      if (discountAmount > booking_amount) {
        discountAmount = booking_amount;
      }
    } else if (promoCode.promo_type === 'free_hours') {
      // For free hours, return the discount value (hours) separately
      // The booking controller will calculate the actual discount
      discountAmount = promoCode.discount_value;
    }

    return success(res, {
      valid: true,
      promo_code: {
        code: promoCode.code,
        promo_type: promoCode.promo_type,
        discount_value: promoCode.discount_value,
        discount_amount: discountAmount,
        max_discount_amount: promoCode.max_discount_amount
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Apply promo code to booking
 * @route   POST /api/promo-codes/apply
 * @access  Private
 */
exports.applyPromoCode = async (req, res, next) => {
  try {
    const { code, booking_id, discount_applied } = req.body;

    if (!code || !booking_id || discount_applied === undefined) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Code, booking_id, and discount_applied are required');
    }

    const promoCode = await PromoCode.findOne({
      code: code.toUpperCase()
    });

    if (!promoCode) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Invalid promo code');
    }

    // Check if promo code has already been used for this booking
    const existingUsage = await PromoCodeUsage.findOne({ booking_id });

    if (existingUsage) {
      return error(res, errorCodes.BIZ_CONFLICT, 409, 'Promo code already applied to this booking');
    }

    // Perform all validation checks again
    if (!promoCode.is_active) {
      return error(res, errorCodes.BIZ_CONFLICT, 400, 'Promo code is no longer active');
    }

    const now = new Date();
    if (now < promoCode.valid_from || now > promoCode.valid_to) {
      return error(res, errorCodes.BIZ_CONFLICT, 400, 'Promo code is not valid at this time');
    }

    if (promoCode.usage_limit_total && promoCode.usage_count >= promoCode.usage_limit_total) {
      return error(res, errorCodes.BIZ_CONFLICT, 400, 'Promo code usage limit reached');
    }

    // Create usage record
    const usage = await PromoCodeUsage.create({
      promo_code_id: promoCode._id,
      user_id: req.user._id,
      booking_id,
      discount_applied
    });

    // Increment usage count
    promoCode.usage_count += 1;
    await promoCode.save();

    return success(res, {
      usage,
      promo_code: {
        code: promoCode.code,
        remaining_uses: promoCode.usage_limit_total ?
          promoCode.usage_limit_total - promoCode.usage_count : null
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get promo code usage history
 * @route   GET /api/promo-codes/:id/usage
 * @access  Private/Admin
 */
exports.getPromoCodeUsage = async (req, res, next) => {
  try {
    const { id } = req.params;

    const promoCode = await PromoCode.findById(id);

    if (!promoCode) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Promo code not found');
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count
    const total = await PromoCodeUsage.countDocuments({ promo_code_id: id });

    // Get usage records with user and booking details
    const usageHistory = await PromoCodeUsage.find({ promo_code_id: id })
      .populate('user_id', 'first_name last_name email')
      .populate('booking_id', 'booking_number start_time end_time total_amount')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate total discount given
    const allUsage = await PromoCodeUsage.find({ promo_code_id: id });
    const totalDiscountGiven = allUsage.reduce((sum, usage) => sum + usage.discount_applied, 0);

    return success(res, {
      promo_code: {
        code: promoCode.code,
        usage_count: promoCode.usage_count,
        usage_limit_total: promoCode.usage_limit_total,
        total_discount_given: totalDiscountGiven
      },
      usage_history: usageHistory
    }, paginationMeta(page, limit, total));
  } catch (err) {
    next(err);
  }
};
