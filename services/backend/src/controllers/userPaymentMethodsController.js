/**
 * User Payment Methods Controller
 * Handles payment method management with tokenization
 */

const UserPaymentMethod = require('../models/UserPaymentMethod');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * @desc    Get all payment methods for a user
 * @route   GET /api/users/:userId/payment-methods
 * @access  Private/Owner
 */
exports.getPaymentMethods = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Authorization check: Only the user themselves or admin can view
    if (req.user._id.toString() !== userId && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view payment methods');
    }

    const paymentMethods = await UserPaymentMethod.find({ user_id: userId })
      .sort({ is_default: -1, created_at: -1 });

    return success(res, { payment_methods: paymentMethods, total: paymentMethods.length }, null, 200);
  } catch (err) {
    console.error('Get payment methods error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching payment methods');
  }
};

/**
 * @desc    Get payment method by ID
 * @route   GET /api/payment-methods/:id
 * @access  Private/Owner
 */
exports.getPaymentMethodById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const paymentMethod = await UserPaymentMethod.findById(id);

    if (!paymentMethod) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Payment method not found');
    }

    // Authorization check: Only the payment method owner or admin can view
    if (paymentMethod.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view this payment method');
    }

    return success(res, { payment_method: paymentMethod }, null, 200);
  } catch (err) {
    console.error('Get payment method by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching payment method');
  }
};

/**
 * @desc    Add new payment method
 * @route   POST /api/users/:userId/payment-methods
 * @access  Private
 */
exports.addPaymentMethod = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { payment_type, provider, provider_payment_method_id, card_last4, card_brand, is_default } = req.body;

    // Authorization check: Only the user themselves can add payment methods
    if (req.user._id.toString() !== userId) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to add payment methods for this user');
    }

    // Validate payment_type
    const validPaymentTypes = ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay', 'bank_transfer'];
    if (!validPaymentTypes.includes(payment_type)) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid payment type');
    }

    // Validate provider
    const validProviders = ['stripe', 'paypal', 'square', 'braintree'];
    if (!validProviders.includes(provider)) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid provider');
    }

    // Validate card_brand if provided
    if (card_brand) {
      const validCardBrands = ['visa', 'mastercard', 'amex', 'discover', 'diners', 'jcb', 'unionpay'];
      if (!validCardBrands.includes(card_brand)) {
        return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid card brand');
      }
    }

    // If no provider_payment_method_id provided, simulate tokenization
    const paymentMethodId = provider_payment_method_id || `${provider}_pm_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // If setting as default, unset other defaults
    if (is_default) {
      await UserPaymentMethod.updateMany(
        { user_id: userId, is_default: true },
        { is_default: false }
      );
    }

    // Check if this is the first payment method for the user
    const existingMethodsCount = await UserPaymentMethod.countDocuments({ user_id: userId });
    const shouldBeDefault = existingMethodsCount === 0 ? true : (is_default || false);

    const paymentMethod = await UserPaymentMethod.create({
      user_id: userId,
      payment_type,
      provider,
      provider_payment_method_id: paymentMethodId,
      card_last4: card_last4 || null,
      card_brand: card_brand || null,
      is_default: shouldBeDefault
    });

    return success(res, { payment_method: paymentMethod }, null, 201);
  } catch (err) {
    console.error('Add payment method error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error adding payment method');
  }
};

/**
 * @desc    Update payment method
 * @route   PUT /api/payment-methods/:id
 * @access  Private/Owner
 */
exports.updatePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { card_last4, card_brand, is_default } = req.body;

    const paymentMethod = await UserPaymentMethod.findById(id);

    if (!paymentMethod) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Payment method not found');
    }

    // Authorization check: Only the payment method owner can update
    if (paymentMethod.user_id.toString() !== req.user._id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to update this payment method');
    }

    // Update allowed fields
    if (card_last4) {
      paymentMethod.card_last4 = card_last4;
    }

    if (card_brand) {
      const validCardBrands = ['visa', 'mastercard', 'amex', 'discover', 'diners', 'jcb', 'unionpay'];
      if (!validCardBrands.includes(card_brand)) {
        return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid card brand');
      }
      paymentMethod.card_brand = card_brand;
    }

    // If setting as default, use setDefaultPaymentMethod logic
    if (is_default !== undefined && is_default === true) {
      // Unset other defaults
      await UserPaymentMethod.updateMany(
        { user_id: paymentMethod.user_id, _id: { $ne: id }, is_default: true },
        { is_default: false }
      );
      paymentMethod.is_default = true;
    }

    await paymentMethod.save();

    return success(res, { payment_method: paymentMethod }, null, 200);
  } catch (err) {
    console.error('Update payment method error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating payment method');
  }
};

/**
 * @desc    Delete payment method
 * @route   DELETE /api/payment-methods/:id
 * @access  Private/Owner
 */
exports.deletePaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;

    const paymentMethod = await UserPaymentMethod.findById(id);

    if (!paymentMethod) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Payment method not found');
    }

    // Authorization check: Only the payment method owner can delete
    if (paymentMethod.user_id.toString() !== req.user._id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to delete this payment method');
    }

    const wasDefault = paymentMethod.is_default;
    const userId = paymentMethod.user_id;

    await UserPaymentMethod.findByIdAndDelete(id);

    // If deleted payment method was default, set another one as default
    if (wasDefault) {
      const nextPaymentMethod = await UserPaymentMethod.findOne({ user_id: userId })
        .sort({ created_at: -1 });
      
      if (nextPaymentMethod) {
        nextPaymentMethod.is_default = true;
        await nextPaymentMethod.save();
      }
    }

    return success(res, { message: 'Payment method deleted successfully' }, null, 200);
  } catch (err) {
    console.error('Delete payment method error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error deleting payment method');
  }
};

/**
 * @desc    Set default payment method
 * @route   PUT /api/payment-methods/:id/set-default
 * @access  Private/Owner
 */
exports.setDefaultPaymentMethod = async (req, res, next) => {
  try {
    const { id } = req.params;

    const paymentMethod = await UserPaymentMethod.findById(id);

    if (!paymentMethod) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Payment method not found');
    }

    // Authorization check: Only the payment method owner can set default
    if (paymentMethod.user_id.toString() !== req.user._id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to modify this payment method');
    }

    // If already default, no action needed
    if (paymentMethod.is_default) {
      return success(res, { payment_method: paymentMethod, message: 'Payment method is already the default' }, null, 200);
    }

    // Unset all other defaults for this user
    await UserPaymentMethod.updateMany(
      { user_id: paymentMethod.user_id, is_default: true },
      { is_default: false }
    );

    // Set this as default
    paymentMethod.is_default = true;
    await paymentMethod.save();

    return success(res, { payment_method: paymentMethod, message: 'Default payment method updated' }, null, 200);
  } catch (err) {
    console.error('Set default payment method error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error setting default payment method');
  }
};
