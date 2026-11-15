/**
 * Message Routes
 * Handles messages within conversations
 */

const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messagesController');
const { protect } = require('../middleware/auth');
const { validateObjectId, validateRequired, sanitize } = require('../middleware/validation');
// const { messageLimiter } = require('../middleware/rateLimit');

// Get unread message count
router.get('/unread/count', protect, messagesController.getUnreadCount);

// Get messages in a conversation
router.get(
  '/conversations/:conversationId/messages',
  protect,
  validateObjectId('conversationId'),
  messagesController.getConversationMessages
);

// Send message
router.post(
  '/conversations/:conversationId/messages',
  protect,
  // messageLimiter,
  validateObjectId('conversationId'),
  sanitize,
  validateRequired(['message_text']),
  messagesController.sendMessage
);

// Message-specific operations
router.get('/:id', protect, validateObjectId('id'), messagesController.getMessageById);

router.put(
  '/:id/read',
  protect,
  validateObjectId('id'),
  messagesController.markAsRead
);

router.delete(
  '/:id',
  protect,
  validateObjectId('id'),
  messagesController.deleteMessage
);

module.exports = router;
