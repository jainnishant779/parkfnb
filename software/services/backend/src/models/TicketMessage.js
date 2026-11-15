const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema({
  ticket_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupportTicket',
    required: true,
    index: true
  },
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  message_text: {
    type: String,
    required: true,
    trim: true
  },
  attachments: {
    type: [String],
    default: []
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
ticketMessageSchema.index({ ticket_id: 1, created_at: 1 });

module.exports = mongoose.model('TicketMessage', ticketMessageSchema);
