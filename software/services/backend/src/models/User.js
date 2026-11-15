const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // A user signs up with EITHER a phone (OTP) or an email (password), so
  // neither is required on its own — the sparse unique index lets many
  // documents omit the field while still rejecting duplicates.
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  // Absent for OTP-only accounts.
  password_hash: {
    type: String,
    select: false
  },
  // Not known at OTP sign-up — collected during profile setup.
  first_name: {
    type: String,
    trim: true,
    default: ''
  },
  last_name: {
    type: String,
    trim: true,
    default: ''
  },
  legal_name: {
    type: String,
    trim: true
  },
  auth_method: {
    type: String,
    enum: ['password', 'otp'],
    default: 'otp'
  },
  // Drives which stack the apps show on launch.
  onboarding_step: {
    type: String,
    enum: ['auth_complete', 'profile_setup', 'kyc_submitted', 'completed'],
    default: 'auth_complete'
  },
  // Notification + language preferences, set during onboarding.
  notification_booking: {
    type: Boolean,
    default: true
  },
  notification_promotion: {
    type: Boolean,
    default: false
  },
  preferred_language: {
    type: String,
    default: 'en',
    trim: true
  },
  alternate_phone: {
    type: String,
    trim: true
  },
  date_of_birth: {
    type: Date
  },
  address_line1: {
    type: String,
    trim: true
  },
  address_line2: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  postal_code: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    trim: true,
    default: 'IN'
  },
  profile_picture_url: {
    type: String,
    default: null
  },
  user_type: {
    type: String,
    enum: ['user', 'owner', 'admin'],
    default: 'user'
  },
  location_lat: {
    type: Number
  },
  location_lng: {
    type: Number
  },
  is_verified: {
    type: Boolean,
    default: false
  },
  is_active: {
    type: Boolean,
    default: true
  },
  verification_token: {
    type: String,
    select: false
  },
  verification_token_expiry: {
    type: Date,
    select: false
  },
  reset_password_token: {
    type: String,
    select: false
  },
  reset_password_expiry: {
    type: Date,
    select: false
  },
  last_login: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Note: Password hashing is done in the controller, not here
// This prevents double-hashing issues

// Method to compare password
userSchema.methods.comparePassword = async function(enteredPassword) {
  // OTP-only accounts have no password — never let a comparison succeed.
  if (!this.password_hash) return false;
  return await bcrypt.compare(enteredPassword, this.password_hash);
};

module.exports = mongoose.model('User', userSchema);
