/**
 * Conversation Routes
 * Handles conversation threads
 */

const express = require('express');
const router = express.Router();
const conversationsController = require('../controllers/conversationsController');
const { protect } = require('../middleware/auth');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');

// Get user's conversations
router.get('/', protect, conversationsController.getUserConversations);

// Get unread conversation count (MUST be before /:id route)
router.get('/unread/count', protect, conversationsController.getUnreadCount);

// Create or get conversation
router.post(
  '/',
  protect,
  sanitize,
  validateRequired(['participant_id']),
  conversationsController.createConversation
);

// Conversation-specific operations
router.get('/:id', protect, validateObjectId('id'), conversationsController.getConversationById);

router.put(
  '/:id/read',
  protect,
  validateObjectId('id'),
  conversationsController.markAsRead
);

router.delete(
  '/:id',
  protect,
  validateObjectId('id'),
  conversationsController.deleteConversation
);

module.exports = router;
