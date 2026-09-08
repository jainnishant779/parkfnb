/**
 * Payments Controller
 * Handles payment processing and gateway integration
 */

const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * @desc    Get all payments (admin only)
 * @route   GET /api/payments
 * @access  Private/Admin
 */
exports.getAllPayments = async (req, res, next) => {
  try {
    // Admin check
    if (req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only admins can view all payments');
    }

    const {
      page = 1,
      limit = 20,
      payment_status,
      payment_provider,
      payment_method,
      user_id
    } = req.query;

    const validPage = Math.max(1, parseInt(page));
    const validLimit = Math.min(100, Math.max(1, parseInt(limit)));

    // Build filter
    const filter = {};

    if (payment_status) {
      filter.payment_status = payment_status;
    }

    if (payment_provider) {
      filter.payment_provider = payment_provider;
    }

    if (payment_method) {
      filter.payment_method = payment_method;
    }

    if (user_id) {
      filter.user_id = user_id;
    }

    // Get total count
    const total = await Payment.countDocuments(filter);

    // Get payments with pagination
    const payments = await Payment.find(filter)
      .populate('user_id', 'email first_name last_name')
      .populate('booking_id', 'booking_number space_id start_time end_time')
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    const meta = paginationMeta(validPage, validLimit, total);

    return success(res, { payments }, meta);
  } catch (err) {
    console.error('Get all payments error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching payments');
  }
};

/**
 * @desc    Get payment by ID
 * @route   GET /api/payments/:id
 * @access  Private/Owner or Admin
 */
exports.getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id)
      .populate('user_id', 'email first_name last_name phone')
      .populate({
        path: 'booking_id',
        select: 'booking_number space_id owner_id start_time end_time total_amount',
        populate: {
          path: 'space_id',
          select: 'space_number property_id'
        }
      });

    if (!payment) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Payment not found');
    }

    // Check authorization - user must be the payment owner, booking owner, or admin
    const isPaymentOwner = payment.user_id._id.toString() === req.user._id.toString();

    let isBookingOwner = false;
    if (payment.booking_id && payment.booking_id.owner_id) {
      const booking = await Booking.findById(payment.booking_id._id).populate('owner_id', 'user_id');
      if (booking && booking.owner_id && booking.owner_id.user_id) {
        isBookingOwner = booking.owner_id.user_id.toString() === req.user._id.toString();
      }
    }

    if (!isPaymentOwner && !isBookingOwner && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view this payment');
    }

    return success(res, { payment });
  } catch (err) {
    console.error('Get payment by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching payment');
  }
};

/**
 * @desc    Get payments for a booking
 * @route   GET /api/bookings/:bookingId/payments
 * @access  Private/Owner
 */
exports.getBookingPayments = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    // Check if booking exists
    const booking = await Booking.findById(bookingId).populate('owner_id', 'user_id');

    if (!booking) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Booking not found');
    }

    // Check authorization - user must be the booking user or owner or admin
    const isBookingUser = booking.user_id.toString() === req.user._id.toString();

    let isBookingOwner = false;
    if (booking.owner_id && booking.owner_id.user_id) {
      isBookingOwner = booking.owner_id.user_id.toString() === req.user._id.toString();
    }

    if (!isBookingUser && !isBookingOwner && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view payments for this booking');
    }

    // Get all payments for this booking
    const payments = await Payment.find({ booking_id: bookingId })
      .populate('user_id', 'email first_name last_name')
      .sort({ created_at: -1 });

    return success(res, { payments, booking_number: booking.booking_number });
  } catch (err) {
    console.error('Get booking payments error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching booking payments');
  }
};

/**
 * @desc    Process payment
 * @route   POST /api/payments
 * @access  Private
 */
exports.processPayment = async (req, res, next) => {
  try {
    const {
      booking_id,
      amount,
      currency = 'USD',
      payment_method,
      payment_provider = 'stripe',
      payment_token
    } = req.body;

    // Validate required fields
    if (!booking_id || !amount || !payment_method) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Booking ID, amount, and payment method are required');
    }

    // Get booking
    const booking = await Booking.findById(booking_id);

    if (!booking) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Booking not found');
    }

    // Check authorization - user must be the booking owner
    if (booking.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to make payment for this booking');
    }

    // Check if booking is already paid
    if (booking.payment_status === 'paid') {
      return error(res, errorCodes.BIZ_CONFLICT, 409, 'Booking is already paid');
    }

    // Validate amount matches booking total
    if (amount !== booking.total_amount) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Payment amount does not match booking total');
    }

    // Generate payment number
    const paymentNumber = generatePaymentNumber();

    // Simulate payment processing (in real app, integrate with payment gateway)
    // For now, we'll create a mock transaction ID
    const providerTransactionId = `${payment_provider.toUpperCase()}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Simulate payment gateway response
    const paymentSuccess = Math.random() > 0.1; // 90% success rate for testing

    const paymentStatus = paymentSuccess ? 'succeeded' : 'failed';
    const paidAt = paymentSuccess ? new Date() : null;

    // Create payment record
    const payment = await Payment.create({
      payment_number: paymentNumber,
      user_id: req.user._id,
      booking_id,
      amount,
      currency,
      payment_method,
      payment_provider,
      provider_transaction_id: providerTransactionId,
      payment_status: paymentStatus,
      paid_at: paidAt
    });

    // Update booking payment status if successful
    if (paymentSuccess) {
      booking.payment_status = 'paid';
      booking.status = 'confirmed';
      await booking.save();
    }

    return success(res, {
      payment,
      message: paymentSuccess ? 'Payment processed successfully' : 'Payment failed'
    }, null, paymentSuccess ? 201 : 200);
  } catch (err) {
    console.error('Process payment error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error processing payment');
  }
};

/**
 * @desc    Verify payment
 * @route   PUT /api/payments/:id/verify
 * @access  Private
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { provider_transaction_id } = req.body;

    // Get payment
    const payment = await Payment.findById(id);

    if (!payment) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Payment not found');
    }

    // Check authorization - user must be the payment owner or admin
    if (payment.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to verify this payment');
    }

    // Check if payment is already verified/succeeded
    if (payment.payment_status === 'succeeded') {
      return success(res, {
        payment,
        message: 'Payment is already verified',
        verified: true
      });
    }

    // Simulate verification with payment gateway
    // In real app, call payment provider API to verify transaction
    const isVerified = payment.provider_transaction_id === provider_transaction_id;

    if (isVerified) {
      payment.payment_status = 'succeeded';
      payment.paid_at = new Date();
      await payment.save();

      // Update booking
      const booking = await Booking.findById(payment.booking_id);
      if (booking) {
        booking.payment_status = 'paid';
        booking.status = 'confirmed';
        await booking.save();
      }

      return success(res, {
        payment,
        message: 'Payment verified successfully',
        verified: true
      });
    } else {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Payment verification failed - transaction ID mismatch');
    }
  } catch (err) {
    console.error('Verify payment error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error verifying payment');
  }
};

/**
 * @desc    Payment webhook (gateway callback)
 * @route   POST /api/payments/webhook
 * @access  Public (but verified)
 */
exports.paymentWebhook = async (req, res, next) => {
  try {
    const {
      event_type,
      transaction_id,
      payment_status,
      amount,
      currency
    } = req.body;

    // In real app, verify webhook signature from payment provider
    // For now, we'll just process the webhook

    // Find payment by provider transaction ID
    const payment = await Payment.findOne({
      provider_transaction_id: transaction_id
    });

    if (!payment) {
      console.log(`Webhook received for unknown transaction: ${transaction_id}`);
      // Still return 200 to acknowledge webhook
      return res.status(200).json({ received: true });
    }

    // Update payment status based on webhook event
    let updatedStatus = payment.payment_status;

    switch (event_type) {
      case 'payment.succeeded':
      case 'charge.succeeded':
        updatedStatus = 'succeeded';
        payment.paid_at = new Date();
        break;
      case 'payment.failed':
      case 'charge.failed':
        updatedStatus = 'failed';
        break;
      case 'payment.refunded':
      case 'charge.refunded':
        updatedStatus = 'refunded';
        break;
      default:
        console.log(`Unknown webhook event type: ${event_type}`);
    }

    // Update payment
    payment.payment_status = updatedStatus;
    await payment.save();

    // Update booking if payment succeeded
    if (updatedStatus === 'succeeded') {
      const booking = await Booking.findById(payment.booking_id);
      if (booking) {
        booking.payment_status = 'paid';
        booking.status = 'confirmed';
        await booking.save();
      }
    }

    // Acknowledge webhook
    return res.status(200).json({
      received: true,
      payment_id: payment._id,
      status: updatedStatus
    });
  } catch (err) {
    console.error('Payment webhook error:', err);
    // Still acknowledge webhook to prevent retries
    return res.status(200).json({ received: true, error: 'Processing error' });
  }
};

/**
 * @desc    Get user's payment history
 * @route   GET /api/users/:userId/payments
 * @access  Private/Owner
 */
exports.getUserPayments = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20, payment_status } = req.query;

    // Check authorization - user must be viewing their own payments or be admin
    if (userId !== req.user._id.toString() && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view these payments');
    }

    const validPage = Math.max(1, parseInt(page));
    const validLimit = Math.min(100, Math.max(1, parseInt(limit)));

    // Build filter
    const filter = { user_id: userId };

    if (payment_status) {
      filter.payment_status = payment_status;
    }

    // Get total count
    const total = await Payment.countDocuments(filter);

    // Get payments
    const payments = await Payment.find(filter)
      .populate({
        path: 'booking_id',
        select: 'booking_number space_id start_time end_time total_amount',
        populate: {
          path: 'space_id',
          select: 'space_number property_id',
          populate: {
            path: 'property_id',
            select: 'property_name address city state'
          }
        }
      })
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    const meta = paginationMeta(validPage, validLimit, total);

    // Calculate summary statistics
    const summary = {
      total_paid: 0,
      total_refunded: 0,
      total_pending: 0
    };

    const allUserPayments = await Payment.find({ user_id: userId });
    allUserPayments.forEach(payment => {
      if (payment.payment_status === 'succeeded') {
        summary.total_paid += payment.amount;
      } else if (payment.payment_status === 'refunded' || payment.payment_status === 'partially_refunded') {
        summary.total_refunded += payment.amount;
      } else if (payment.payment_status === 'pending' || payment.payment_status === 'processing') {
        summary.total_pending += payment.amount;
      }
    });

    return success(res, { payments, summary }, meta);
  } catch (err) {
    console.error('Get user payments error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching user payments');
  }
};

// Helper function to generate payment number
function generatePaymentNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PAY-${timestamp}-${random}`;
}
