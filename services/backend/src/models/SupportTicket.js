const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  ticket_number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    index: true
  },
  booking_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    index: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'booking_issue',
      'payment_issue',
      'refund_request',
      'property_issue',
      'account_issue',
      'technical_issue',
      'safety_concern',
      'general_inquiry',
      'other'
    ],
    trim: true,
    index: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['open', 'in_progress', 'waiting_for_customer', 'resolved', 'closed'],
    default: 'open',
    index: true
  },
  resolved_at: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
supportTicketSchema.index({ user_id: 1, status: 1 });
supportTicketSchema.index({ owner_id: 1, status: 1 });
supportTicketSchema.index({ status: 1, created_at: -1 });
supportTicketSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
