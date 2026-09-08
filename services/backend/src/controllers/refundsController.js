/**
 * Refunds Controller
 * Handles refund processing, approval, and management
 */

const Refund = require('../models/Refund');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');
const { validatePagination } = require('../utils/validators');

/**
 * @desc    Get all refunds
 * @route   GET /api/refunds
 * @access  Private/Admin
 */
exports.getAllRefunds = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, booking_id } = req.query;
    const { page: validPage, limit: validLimit } = validatePagination(page, limit);

    // Build filter
    const filter = {};
    if (status) filter.status = status;
    if (booking_id) filter.booking_id = booking_id;

    // Get total count
    const total = await Refund.countDocuments(filter);

    // Get refunds with pagination
    const refunds = await Refund.find(filter)
      .populate({
        path: 'payment_id',
        select: 'payment_number amount payment_method payment_status'
      })
      .populate({
        path: 'booking_id',
        select: 'booking_number user_id space_id total_amount',
        populate: [
          { path: 'user_id', select: 'email first_name last_name' },
          { path: 'space_id', select: 'space_number space_type' }
        ]
      })
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    return success(
      res,
      { refunds },
      paginationMeta(validPage, validLimit, total)
    );
  } catch (err) {
    console.error('Get all refunds error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching refunds');
  }
};

/**
 * @desc    Get refund by ID
 * @route   GET /api/refunds/:id
 * @access  Private
 */
exports.getRefundById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const refund = await Refund.findById(id)
      .populate({
        path: 'payment_id',
        select: 'payment_number amount payment_method payment_status provider_transaction_id'
      })
      .populate({
        path: 'booking_id',
        select: 'booking_number user_id space_id owner_id total_amount status',
        populate: [
          { path: 'user_id', select: 'email first_name last_name phone' },
          { path: 'space_id', select: 'space_number space_type property_id' }
        ]
      });

    if (!refund) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Refund not found');
    }

    // Authorization check
    if (req.user.user_type !== 'admin') {
      const booking = await Booking.findById(refund.booking_id);
      if (
        booking.user_id.toString() !== req.user._id.toString() &&
        booking.owner_id.toString() !== req.user._id.toString()
      ) {
        return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view this refund');
      }
    }

    return success(res, { refund });
  } catch (err) {
    console.error('Get refund by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching refund');
  }
};

/**
 * @desc    Get refunds for a booking
 * @route   GET /api/refunds/bookings/:bookingId/refunds
 * @access  Private
 */
exports.getBookingRefunds = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    // Check if booking exists
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Booking not found');
    }

    // Authorization check
    if (req.user.user_type !== 'admin') {
      if (
        booking.user_id.toString() !== req.user._id.toString() &&
        booking.owner_id.toString() !== req.user._id.toString()
      ) {
        return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view refunds for this booking');
      }
    }

    // Get refunds
    const refunds = await Refund.find({ booking_id: bookingId })
      .populate({
        path: 'payment_id',
        select: 'payment_number amount payment_method'
      })
      .sort({ created_at: -1 });

    // Calculate total refunded amount
    const totalRefunded = refunds
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + r.refund_amount, 0);

    return success(res, {
      refunds,
      booking_number: booking.booking_number,
      total_refunded: totalRefunded,
      booking_total: booking.total_amount
    });
  } catch (err) {
    console.error('Get booking refunds error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching booking refunds');
  }
};

/**
 * @desc    Request refund
 * @route   POST /api/refunds/bookings/:bookingId/refund
 * @access  Private
 */
exports.requestRefund = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { reason, refund_amount } = req.body;

    // Check if booking exists
    const booking = await Booking.findById(bookingId)
      .populate('space_id', 'space_number owner_id');

    if (!booking) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Booking not found');
    }

    // Check if user owns the booking
    if (booking.user_id.toString() !== req.user._id.toString()) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to request refund for this booking');
    }

    // Check if booking is eligible for refund
    if (booking.payment_status !== 'paid') {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Booking has not been paid');
    }

    // Check if booking has already been fully refunded
    const existingRefunds = await Refund.find({
      booking_id: bookingId,
      status: { $in: ['completed', 'processing', 'pending'] }
    });

    const totalRefunded = existingRefunds
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + r.refund_amount, 0);

    const pendingRefunds = existingRefunds
      .filter(r => ['pending', 'processing'].includes(r.status))
      .reduce((sum, r) => sum + r.refund_amount, 0);

    if (totalRefunded >= booking.total_amount) {
      return error(res, errorCodes.BIZ_CONFLICT, 409, 'Booking has already been fully refunded');
    }

    // Calculate refund amount
    let calculatedRefundAmount = refund_amount || booking.total_amount;
    const maxRefundable = booking.total_amount - totalRefunded - pendingRefunds;

    if (calculatedRefundAmount > maxRefundable) {
      calculatedRefundAmount = maxRefundable;
    }

    if (calculatedRefundAmount <= 0) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'No refundable amount available');
    }

    // Get payment for this booking
    const payment = await Payment.findOne({
      booking_id: bookingId,
      payment_status: 'succeeded'
    });

    if (!payment) {
      return error(res, errorCodes.NOT_FOUND, 404, 'No successful payment found for this booking');
    }

    // Create refund
    const refund = await Refund.create({
      payment_id: payment._id,
      booking_id: bookingId,
      refund_amount: calculatedRefundAmount,
      refund_reason: reason,
      status: 'pending'
    });

    // Populate refund for response
    const populatedRefund = await Refund.findById(refund._id)
      .populate('payment_id', 'payment_number amount')
      .populate('booking_id', 'booking_number total_amount');

    return success(res, { refund: populatedRefund }, null, 201);
  } catch (err) {
    console.error('Request refund error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error requesting refund');
  }
};

/**
 * @desc    Approve refund
 * @route   PUT /api/refunds/:id/approve
 * @access  Private/Admin
 */
exports.approveRefund = async (req, res, next) => {
  try {
    const { id } = req.params;

    const refund = await Refund.findById(id)
      .populate('payment_id', 'payment_number amount')
      .populate('booking_id', 'booking_number user_id');

    if (!refund) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Refund not found');
    }

    if (refund.status !== 'pending') {
      return error(res, errorCodes.BIZ_CONFLICT, 409, `Refund is already ${refund.status}`);
    }

    // Update refund status to processing
    refund.status = 'processing';
    await refund.save();

    return success(res, {
      message: 'Refund approved and is now processing',
      refund
    });
  } catch (err) {
    console.error('Approve refund error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error approving refund');
  }
};

/**
 * @desc    Reject refund
 * @route   PUT /api/refunds/:id/reject
 * @access  Private/Admin
 */
exports.rejectRefund = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const refund = await Refund.findById(id)
      .populate('payment_id', 'payment_number amount')
      .populate('booking_id', 'booking_number user_id');

    if (!refund) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Refund not found');
    }

    if (refund.status !== 'pending') {
      return error(res, errorCodes.BIZ_CONFLICT, 409, `Cannot reject refund with status ${refund.status}`);
    }

    // Update refund status to cancelled (rejected)
    refund.status = 'cancelled';
    refund.refund_reason = `${refund.refund_reason} [REJECTED: ${rejection_reason}]`;
    await refund.save();

    return success(res, {
      message: 'Refund rejected successfully',
      refund
    });
  } catch (err) {
    console.error('Reject refund error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error rejecting refund');
  }
};

/**
 * @desc    Process refund
 * @route   PUT /api/refunds/:id/process
 * @access  Private/Admin
 */
exports.processRefund = async (req, res, next) => {
  try {
    const { id } = req.params;

    const refund = await Refund.findById(id)
      .populate('payment_id', 'payment_number amount payment_provider provider_transaction_id')
      .populate('booking_id', 'booking_number user_id total_amount');

    if (!refund) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Refund not found');
    }

    if (refund.status !== 'processing') {
      return error(res, errorCodes.BIZ_CONFLICT, 409, `Refund must be in processing status. Current status: ${refund.status}`);
    }

    // Simulate refund processing with payment provider
    // In production, this would integrate with payment gateway (Stripe, Razorpay, etc.)
    const simulateRefundProcessing = () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            refund_transaction_id: `REFUND_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            processed_at: new Date()
          });
        }, 100);
      });
    };

    const refundResult = await simulateRefundProcessing();

    if (!refundResult.success) {
      refund.status = 'failed';
      await refund.save();
      return error(res, errorCodes.SERVER_ERROR, 500, 'Refund processing failed');
    }

    // Update refund status to completed
    refund.status = 'completed';
    refund.processed_at = refundResult.processed_at;
    await refund.save();

    // Update booking payment status if fully refunded
    const booking = await Booking.findById(refund.booking_id);
    const allRefunds = await Refund.find({
      booking_id: refund.booking_id,
      status: 'completed'
    });

    const totalRefunded = allRefunds.reduce((sum, r) => sum + r.refund_amount, 0);

    if (totalRefunded >= booking.total_amount) {
      booking.payment_status = 'refunded';
      await booking.save();
    }

    return success(res, {
      message: 'Refund processed successfully',
      refund,
      refund_transaction_id: refundResult.refund_transaction_id
    });
  } catch (err) {
    console.error('Process refund error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error processing refund');
  }
};
