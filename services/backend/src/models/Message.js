const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'sender_type',
    index: true
  },
  sender_type: {
    type: String,
    required: true,
    enum: ['User', 'Owner'],
    trim: true
  },
  message_text: {
    type: String,
    required: true,
    trim: true
  },
  message_attachments: {
    type: [String],
    default: []
  },
  is_read: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
messageSchema.index({ conversation_id: 1, created_at: 1 });
messageSchema.index({ conversation_id: 1, is_read: 1 });

module.exports = mongoose.model('Message', messageSchema);
