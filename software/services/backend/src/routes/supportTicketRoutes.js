/**
 * Support Ticket Routes
 * Handles support ticket management
 */

const express = require('express');
const router = express.Router();
const supportTicketsController = require('../controllers/supportTicketsController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Get all support tickets (admin only)
router.get('/', protect, authorize('admin'), supportTicketsController.getAllTickets);

// Get user's tickets
router.get(
  '/users/:userId/tickets',
  protect,
  validateObjectId('userId'),
  supportTicketsController.getUserTickets
);

// Create support ticket
router.post(
  '/',
  protect,
  sanitize,
  validateRequired(['subject', 'description', 'category']),
  supportTicketsController.createTicket
);

// Ticket-specific operations
router.get('/:id', protect, validateObjectId('id'), supportTicketsController.getTicketById);

router.put(
  '/:id',
  protect,
  authorize('admin'),
  validateObjectId('id'),
  sanitize,
  supportTicketsController.updateTicket
);

router.put(
  '/:id/assign',
  protect,
  authorize('admin'),
  validateObjectId('id'),
  sanitize,
  validateRequired(['admin_id']),
  supportTicketsController.assignTicket
);

router.put(
  '/:id/close',
  protect,
  validateObjectId('id'),
  supportTicketsController.closeTicket
);

router.put(
  '/:id/reopen',
  protect,
  validateObjectId('id'),
  supportTicketsController.reopenTicket
);

// Ticket messages
router.get(
  '/:id/messages',
  protect,
  validateObjectId('id'),
  supportTicketsController.getTicketMessages
);

router.post(
  '/:id/messages',
  protect,
  validateObjectId('id'),
  sanitize,
  validateRequired(['message']),
  supportTicketsController.addTicketMessage
);

module.exports = router;
