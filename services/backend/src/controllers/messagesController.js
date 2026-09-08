/**
 * Messages Controller
 * Handles message operations within conversations
 */

const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Owner = require('../models/Owner');
const { success, error, paginationMeta } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

/**
 * @desc    Get messages in a conversation
 * @route   GET /api/conversations/:conversationId/messages
 * @access  Private/Participant
 */
exports.getConversationMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const validPage = Math.max(1, parseInt(page));
    const validLimit = Math.min(100, Math.max(1, parseInt(limit)));

    // Get conversation to verify participation
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Conversation not found');
    }

    // Check authorization - user must be a participant
    const owner = await Owner.findOne({ user_id: req.user._id });
    const isParticipant =
      conversation.user_id.toString() === req.user._id.toString() ||
      (owner && conversation.owner_id.toString() === owner._id.toString());

    if (!isParticipant && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view these messages');
    }

    // Get total count
    const total = await Message.countDocuments({ conversation_id: conversationId });

    // Get messages with pagination (most recent first)
    const messages = await Message.find({ conversation_id: conversationId })
      .sort({ created_at: -1 })
      .skip((validPage - 1) * validLimit)
      .limit(validLimit);

    // Reverse to show chronological order
    messages.reverse();

    const meta = paginationMeta(validPage, validLimit, total);

    return success(res, { messages }, meta);
  } catch (err) {
    console.error('Get conversation messages error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching messages');
  }
};

/**
 * @desc    Get message by ID
 * @route   GET /api/messages/:id
 * @access  Private/Participant
 */
exports.getMessageById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get message
    const message = await Message.findById(id);

    if (!message) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Message not found');
    }

    // Get conversation to verify participation
    const conversation = await Conversation.findById(message.conversation_id);

    if (!conversation) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Conversation not found');
    }

    // Check authorization - user must be a participant
    const owner = await Owner.findOne({ user_id: req.user._id });
    const isParticipant =
      conversation.user_id.toString() === req.user._id.toString() ||
      (owner && conversation.owner_id.toString() === owner._id.toString());

    if (!isParticipant && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to view this message');
    }

    return success(res, { message });
  } catch (err) {
    console.error('Get message by ID error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching message');
  }
};

/**
 * @desc    Send message
 * @route   POST /api/conversations/:conversationId/messages
 * @access  Private/Participant
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { message_text, message_attachments } = req.body;

    if (!message_text || !message_text.trim()) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Message text is required');
    }

    // Get conversation to verify participation
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Conversation not found');
    }

    // Check authorization and determine sender type
    const owner = await Owner.findOne({ user_id: req.user._id });
    let senderType;
    let senderId;
    let isParticipant = false;

    if (conversation.user_id.toString() === req.user._id.toString()) {
      // User is sending message
      senderType = 'User';
      senderId = req.user._id;
      isParticipant = true;
    } else if (owner && conversation.owner_id.toString() === owner._id.toString()) {
      // Owner is sending message
      senderType = 'Owner';
      senderId = owner._id;
      isParticipant = true;
    }

    if (!isParticipant && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to send messages in this conversation');
    }

    // Create message
    const message = await Message.create({
      conversation_id: conversationId,
      sender_id: senderId,
      sender_type: senderType,
      message_text: message_text.trim(),
      message_attachments: message_attachments || [],
      is_read: false
    });

    // Update conversation's last_message_at
    conversation.last_message_at = new Date();
    await conversation.save();

    return success(res, { message }, null, 201);
  } catch (err) {
    console.error('Send message error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error sending message');
  }
};

/**
 * @desc    Mark message as read
 * @route   PUT /api/messages/:id/read
 * @access  Private/Participant
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get message
    const message = await Message.findById(id);

    if (!message) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Message not found');
    }

    // Get conversation to verify participation
    const conversation = await Conversation.findById(message.conversation_id);

    if (!conversation) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Conversation not found');
    }

    // Check authorization - only the recipient can mark as read
    const owner = await Owner.findOne({ user_id: req.user._id });
    let isRecipient = false;

    // If message is from User, only Owner can mark as read
    if (message.sender_type === 'User' && owner && conversation.owner_id.toString() === owner._id.toString()) {
      isRecipient = true;
    }
    // If message is from Owner, only User can mark as read
    else if (message.sender_type === 'Owner' && conversation.user_id.toString() === req.user._id.toString()) {
      isRecipient = true;
    }

    if (!isRecipient && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to mark this message as read');
    }

    // Mark as read
    message.is_read = true;
    await message.save();

    return success(res, { message });
  } catch (err) {
    console.error('Mark message as read error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error marking message as read');
  }
};

/**
 * @desc    Delete message
 * @route   DELETE /api/messages/:id
 * @access  Private/Sender or Admin
 */
exports.deleteMessage = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get message
    const message = await Message.findById(id);

    if (!message) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Message not found');
    }

    // Get conversation to verify participation
    const conversation = await Conversation.findById(message.conversation_id);

    if (!conversation) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Conversation not found');
    }

    // Check authorization - only sender or admin can delete
    const owner = await Owner.findOne({ user_id: req.user._id });
    let isSender = false;

    // Check if user is the sender
    if (message.sender_type === 'User' && message.sender_id.toString() === req.user._id.toString()) {
      isSender = true;
    } else if (message.sender_type === 'Owner' && owner && message.sender_id.toString() === owner._id.toString()) {
      isSender = true;
    }

    if (!isSender && req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Not authorized to delete this message');
    }

    // Delete the message
    await Message.findByIdAndDelete(id);

    return success(res, { message: 'Message deleted successfully' });
  } catch (err) {
    console.error('Delete message error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error deleting message');
  }
};

/**
 * @desc    Get unread message count for user
 * @route   GET /api/messages/unread/count
 * @access  Private
 */
exports.getUnreadCount = async (req, res, next) => {
  try {
    // Check if user is owner to determine message filter
    const owner = await Owner.findOne({ user_id: req.user._id });

    let conversationFilter = {};
    let messageSenderType;

    if (owner) {
      // Owner's conversations - count messages from Users
      conversationFilter.owner_id = owner._id;
      messageSenderType = 'User';
    } else {
      // Regular user's conversations - count messages from Owners
      conversationFilter.user_id = req.user._id;
      messageSenderType = 'Owner';
    }

    // Get all conversations for this user/owner
    const conversations = await Conversation.find(conversationFilter).select('_id');
    const conversationIds = conversations.map(c => c._id);

    // Count unread messages
    const unreadCount = await Message.countDocuments({
      conversation_id: { $in: conversationIds },
      sender_type: messageSenderType,
      is_read: false
    });

    return success(res, { unread_count: unreadCount });
  } catch (err) {
    console.error('Get unread count error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching unread count');
  }
};
