const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: true,
    index: true
  },
  booking_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    index: true
  },
  last_message_at: {
    type: Date,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
conversationSchema.index({ user_id: 1, owner_id: 1 });
conversationSchema.index({ user_id: 1, last_message_at: -1 });
conversationSchema.index({ owner_id: 1, last_message_at: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
