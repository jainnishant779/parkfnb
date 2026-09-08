const mongoose = require('mongoose');

const ownerSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  owner_type: {
    type: String,
    required: true,
    enum: ['individual', 'business', 'property_manager'],
    default: 'individual',
    trim: true
  },
  business_name: {
    type: String,
    trim: true
  },
  payout_bank_account: {
    type: String,
    trim: true
  },
  payout_method: {
    type: String,
    enum: ['bank_transfer', 'paypal', 'stripe', 'check'],
    default: 'bank_transfer',
    trim: true
  },
  total_earnings: {
    type: Number,
    default: 0,
    min: 0
  },
  average_rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  is_verified: {
    type: Boolean,
    default: false
  },
  // The owner app's onboarding wizard writes each step into its own block and
  // reads kyc_status back to decide which screen to show next.
  terms_accepted_at: {
    type: Date
  },
  kyc_status: {
    type: String,
    enum: ['not_started', 'draft', 'submitted', 'verified', 'rejected'],
    default: 'not_started',
    index: true
  },
  kyc_rejection_reason: {
    type: String,
    trim: true
  },
  kyc_personal: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  kyc_identity: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  kyc_address: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  kyc_bank: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  role_designation: {
    type: String,
    trim: true
  },
  registration_id: {
    type: String,
    trim: true
  },
  land_label: {
    type: String,
    trim: true
  },
  landmark: {
    type: String,
    trim: true
  },
  kyc_document_type: {
    type: String,
    trim: true
  },
  kyc_document_number: {
    type: String,
    trim: true
  },
  kyc_submitted_at: {
    type: Date
  },
  kyc_verified_at: {
    type: Date
  },
  kyc_verification_notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Index for efficient queries
ownerSchema.index({ is_verified: 1 });
ownerSchema.index({ average_rating: -1 });

module.exports = mongoose.model('Owner', ownerSchema);
