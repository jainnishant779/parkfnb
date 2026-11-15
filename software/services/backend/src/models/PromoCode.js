const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  promo_type: {
    type: String,
    required: true,
    enum: ['percentage', 'fixed_amount', 'free_hours'],
    trim: true
  },
  discount_value: {
    type: Number,
    required: true,
    min: 0
  },
  max_discount_amount: {
    type: Number,
    min: 0
  },
  valid_from: {
    type: Date,
    required: true,
    index: true
  },
  valid_to: {
    type: Date,
    required: true,
    index: true
  },
  usage_limit_total: {
    type: Number,
    min: 0
  },
  usage_count: {
    type: Number,
    default: 0,
    min: 0
  },
  is_active: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
promoCodeSchema.index({ is_active: 1, valid_from: 1, valid_to: 1 });
promoCodeSchema.index({ code: 1, is_active: 1 });

module.exports = mongoose.model('PromoCode', promoCodeSchema);
