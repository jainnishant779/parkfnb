const mongoose = require('mongoose');

const userVehicleSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  vehicle_type: {
    type: String,
    required: true,
    enum: ['car', 'suv', 'truck', 'van', 'motorcycle', 'bicycle', 'rv', 'trailer'],
    trim: true
  },
  vehicle_size: {
    type: String,
    required: true,
    enum: ['small', 'medium', 'large', 'extra_large'],
    trim: true
  },
  registration_number: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  // Alias for compatibility
  license_plate: {
    type: String,
    trim: true,
    uppercase: true
  },
  make: {
    type: String,
    required: true,
    trim: true
  },
  model: {
    type: String,
    required: true,
    trim: true
  },
  // Aliases for compatibility
  vehicle_make: {
    type: String,
    trim: true
  },
  vehicle_model: {
    type: String,
    trim: true
  },
  vehicle_year: {
    type: Number,
    min: 1900,
    max: 2100
  },
  is_electric: {
    type: Boolean,
    default: false
  },
  is_default: {
    type: Boolean,
    default: false
  },
  is_verified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Index for efficient queries
userVehicleSchema.index({ user_id: 1, is_default: 1 });

module.exports = mongoose.model('UserVehicle', userVehicleSchema);
