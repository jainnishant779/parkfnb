/**
 * Support Tickets Controller
 * Handles support ticket lifecycle and SLA management
 */

const SupportTicket = require('../models/SupportTicket');
const TicketMessage = require('../models/TicketMessage');
const User = require('../models/User');
const Owner = require('../models/Owner');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * Generate unique ticket number
 */
const generateTicketNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TK-${timestamp}-${random}`;
};

/**
 * @desc    Get all support tickets (admin only)
 * @route   GET /api/support-tickets
 * @access  Private/Admin
 */
exports.getAllTickets = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.user_id) {
      filter.user_id = req.query.user_id;
    }

    if (req.query.owner_id) {
      filter.owner_id = req.query.owner_id;
    }

    // Execute query with population
    const tickets = await SupportTicket.find(filter)
      .populate('user_id', 'first_name last_name email')
      .populate('owner_id', 'business_name')
      .populate('booking_id', 'booking_number')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SupportTicket.countDocuments(filter);

    return success(
      res,
      { tickets },
      paginationMeta(page, limit, total),
      200
    );
  } catch (err) {
    console.error('Get all tickets error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching support tickets');
  }
};

/**
 * @desc    Get ticket by ID
 * @route   GET /api/support-tickets/:id
 * @access  Private/Owner or Admin
 */
exports.getTicketById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id)
      .populate('user_id', 'first_name last_name email phone')
      .populate('owner_id', 'business_name')
      .populate('booking_id', 'booking_number start_time end_time');

    if (!ticket) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Support ticket not found');
    }

    // Authorization check: Only ticket owner (user or owner) or admin can view
    const isTicketUser = ticket.user_id && ticket.user_id._id.toString() === req.user._id.toString();
    const isTicketOwner = ticket.owner_id && req.user.user_type === 'owner';
    const isAdmin = req.user.user_type === 'admin';

    if (!isTicketUser && !isTicketOwner && !isAdmin) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view this ticket');
    }

    return success(res, { ticket }, null, 200);
  } catch (err) {
    console.error('Get ticket by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching support ticket');
  }
};

/**
 * @desc    Get user's tickets
 * @route   GET /api/users/:userId/tickets
 * @access  Private/Owner
 */
exports.getUserTickets = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Authorization check: Only the user themselves or admin can view
    if (req.user._id.toString() !== userId && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view these tickets');
    }

    // Build filter
    const filter = { user_id: userId };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.category) {
      filter.category = req.query.category;
    }

    const tickets = await SupportTicket.find(filter)
      .populate('booking_id', 'booking_number')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SupportTicket.countDocuments(filter);

    return success(
      res,
      { tickets },
      paginationMeta(page, limit, total),
      200
    );
  } catch (err) {
    console.error('Get user tickets error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching user tickets');
  }
};

/**
 * @desc    Create support ticket
 * @route   POST /api/support-tickets
 * @access  Private
 */
exports.createTicket = async (req, res, next) => {
  try {
    const { subject, description, category, booking_id } = req.body;

    // Validate category
    const validCategories = [
      'booking_issue',
      'payment_issue',
      'refund_request',
      'property_issue',
      'account_issue',
      'technical_issue',
      'safety_concern',
      'general_inquiry',
      'other'
    ];

    if (!validCategories.includes(category)) {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid category');
    }

    // Generate unique ticket number
    const ticket_number = generateTicketNumber();

    // Determine if user is owner or regular user
    let ticketData = {
      ticket_number,
      subject,
      description,
      category,
      status: 'open'
    };

    if (req.user.user_type === 'owner') {
      // Find owner profile
      const owner = await Owner.findOne({ user_id: req.user._id });
      if (owner) {
        ticketData.owner_id = owner._id;
      }
    } else {
      ticketData.user_id = req.user._id;
    }

    if (booking_id) {
      ticketData.booking_id = booking_id;
    }

    const ticket = await SupportTicket.create(ticketData);

    // Populate for response
    await ticket.populate('user_id', 'first_name last_name email');
    await ticket.populate('owner_id', 'business_name');
    await ticket.populate('booking_id', 'booking_number');

    return success(res, { ticket }, null, 201);
  } catch (err) {
    console.error('Create ticket error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error creating support ticket');
  }
};

/**
 * @desc    Update ticket
 * @route   PUT /api/support-tickets/:id
 * @access  Private/Admin
 */
exports.updateTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, category, subject, description } = req.body;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Support ticket not found');
    }

    // Update allowed fields
    if (status) {
      const validStatuses = ['open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed'];
      if (!validStatuses.includes(status)) {
        return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid status');
      }
      ticket.status = status;

      // Set resolved_at if status is resolved or closed
      if ((status === 'resolved' || status === 'closed') && !ticket.resolved_at) {
        ticket.resolved_at = new Date();
      }
    }

    if (category) {
      ticket.category = category;
    }

    if (subject) {
      ticket.subject = subject;
    }

    if (description) {
      ticket.description = description;
    }

    await ticket.save();

    // Populate for response
    await ticket.populate('user_id', 'first_name last_name email');
    await ticket.populate('owner_id', 'business_name');
    await ticket.populate('booking_id', 'booking_number');

    return success(res, { ticket }, null, 200);
  } catch (err) {
    console.error('Update ticket error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating support ticket');
  }
};

/**
 * @desc    Assign ticket to admin
 * @route   PUT /api/support-tickets/:id/assign
 * @access  Private/Admin
 */
exports.assignTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { admin_id } = req.body;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Support ticket not found');
    }

    // Verify admin_id is actually an admin
    const admin = await User.findById(admin_id);
    if (!admin || admin.user_type !== 'admin') {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Invalid admin user');
    }

    // Note: SupportTicket model doesn't have assigned_to field
    // This function is a placeholder for future implementation
    // For now, we'll just change status to in_progress
    ticket.status = 'in_progress';
    await ticket.save();

    // Populate for response
    await ticket.populate('user_id', 'first_name last_name email');
    await ticket.populate('owner_id', 'business_name');
    await ticket.populate('booking_id', 'booking_number');

    return success(res, { ticket, message: 'Ticket assigned and status updated to in_progress' }, null, 200);
  } catch (err) {
    console.error('Assign ticket error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error assigning ticket');
  }
};

/**
 * @desc    Close ticket
 * @route   PUT /api/support-tickets/:id/close
 * @access  Private/Admin or Owner
 */
exports.closeTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Support ticket not found');
    }

    // Authorization check: Only ticket owner or admin can close
    const isTicketUser = ticket.user_id && ticket.user_id.toString() === req.user._id.toString();
    const isTicketOwner = ticket.owner_id && req.user.user_type === 'owner';
    const isAdmin = req.user.user_type === 'admin';

    if (!isTicketUser && !isTicketOwner && !isAdmin) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to close this ticket');
    }

    // Cannot close already closed ticket
    if (ticket.status === 'closed') {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Ticket is already closed');
    }

    ticket.status = 'closed';
    ticket.resolved_at = new Date();
    await ticket.save();

    // Populate for response
    await ticket.populate('user_id', 'first_name last_name email');
    await ticket.populate('owner_id', 'business_name');
    await ticket.populate('booking_id', 'booking_number');

    return success(res, { ticket, message: 'Ticket closed successfully' }, null, 200);
  } catch (err) {
    console.error('Close ticket error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error closing ticket');
  }
};

/**
 * @desc    Reopen ticket
 * @route   PUT /api/support-tickets/:id/reopen
 * @access  Private/Owner
 */
exports.reopenTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Support ticket not found');
    }

    // Authorization check: Only ticket owner can reopen
    const isTicketUser = ticket.user_id && ticket.user_id.toString() === req.user._id.toString();
    const isTicketOwner = ticket.owner_id && req.user.user_type === 'owner';

    if (!isTicketUser && !isTicketOwner) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to reopen this ticket');
    }

    // Can only reopen closed or resolved tickets
    if (ticket.status !== 'closed' && ticket.status !== 'resolved') {
      return error(res, errorCodes.BIZ_VALIDATION, 400, 'Can only reopen closed or resolved tickets');
    }

    ticket.status = 'open';
    ticket.resolved_at = null;
    await ticket.save();

    // Populate for response
    await ticket.populate('user_id', 'first_name last_name email');
    await ticket.populate('owner_id', 'business_name');
    await ticket.populate('booking_id', 'booking_number');

    return success(res, { ticket, message: 'Ticket reopened successfully' }, null, 200);
  } catch (err) {
    console.error('Reopen ticket error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error reopening ticket');
  }
};

/**
 * @desc    Get ticket messages
 * @route   GET /api/support-tickets/:id/messages
 * @access  Private/Owner or Admin
 */
exports.getTicketMessages = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify ticket exists
    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Support ticket not found');
    }

    // Authorization check: Only ticket participants or admin can view messages
    const isTicketUser = ticket.user_id && ticket.user_id.toString() === req.user._id.toString();
    const isTicketOwner = ticket.owner_id && req.user.user_type === 'owner';
    const isAdmin = req.user.user_type === 'admin';

    if (!isTicketUser && !isTicketOwner && !isAdmin) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view ticket messages');
    }

    // Get messages
    const messages = await TicketMessage.find({ ticket_id: id })
      .sort({ created_at: 1 });

    return success(res, { messages, total: messages.length }, null, 200);
  } catch (err) {
    console.error('Get ticket messages error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching ticket messages');
  }
};

/**
 * @desc    Add message to ticket
 * @route   POST /api/support-tickets/:id/messages
 * @access  Private/Owner or Admin
 */
exports.addTicketMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message, attachments } = req.body;

    // Verify ticket exists
    const ticket = await SupportTicket.findById(id);

    if (!ticket) {
      return error(res, errorCodes.RESOURCE_NOT_FOUND, 404, 'Support ticket not found');
    }

    // Authorization check: Only ticket participants or admin can add messages
    const isTicketUser = ticket.user_id && ticket.user_id.toString() === req.user._id.toString();
    const isTicketOwner = ticket.owner_id && req.user.user_type === 'owner';
    const isAdmin = req.user.user_type === 'admin';

    if (!isTicketUser && !isTicketOwner && !isAdmin) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to add messages to this ticket');
    }

    // Create message
    const ticketMessage = await TicketMessage.create({
      ticket_id: id,
      sender_id: req.user._id,
      message_text: message,
      attachments: attachments || []
    });

    // Update ticket status if closed
    if (ticket.status === 'closed' || ticket.status === 'resolved') {
      // If customer adds message, reopen ticket
      if (isTicketUser || isTicketOwner) {
        ticket.status = 'open';
        ticket.resolved_at = null;
      } else if (isAdmin) {
        // If admin adds message, set to in_progress
        ticket.status = 'in_progress';
      }
      await ticket.save();
    }

    return success(res, { message: ticketMessage }, null, 201);
  } catch (err) {
    console.error('Add ticket message error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error adding ticket message');
  }
};
