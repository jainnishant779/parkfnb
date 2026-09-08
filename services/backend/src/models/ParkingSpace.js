const mongoose = require('mongoose');

const parkingSpaceSchema = new mongoose.Schema({
  property_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true,
    index: true
  },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: true,
    index: true
  },
  space_number: {
    type: String,
    required: true,
    trim: true
  },
  space_type: {
    type: String,
    required: true,
    enum: ['outdoor', 'covered', 'garage', 'driveway', 'carport', 'street'],
    trim: true
  },
  length_meters: {
    type: Number,
    required: true,
    min: 0
  },
  width_meters: {
    type: Number,
    required: true,
    min: 0
  },
  height_meters: {
    type: Number,
    min: 0
  },
  allowed_vehicle_types: {
    type: [String],
    default: [],
    enum: ['car', 'suv', 'truck', 'van', 'motorcycle', 'bicycle', 'rv', 'trailer']
  },
  space_description: {
    type: String,
    trim: true
  },
  space_images: {
    type: [String],
    default: []
  },
  price_per_hour: {
    type: Number,
    required: true,
    min: 0
  },
  price_per_day: {
    type: Number,
    min: 0
  },
  price_per_month: {
    type: Number,
    min: 0
  },
  // Aliases for bookings controller compatibility
  hourly_rate: {
    type: Number,
    min: 0
  },
  daily_rate: {
    type: Number,
    min: 0
  },
  monthly_rate: {
    type: Number,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance', 'unavailable'],
    default: 'active',
    trim: true
  },
  booking_mode: {
    type: String,
    required: true,
    enum: ['instant', 'request', 'both'],
    default: 'instant',
    trim: true
  },
  has_ev_charging: {
    type: Boolean,
    default: false
  },
  is_available: {
    type: Boolean,
    default: true
  },
  average_rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
parkingSpaceSchema.index({ property_id: 1, space_number: 1 });
parkingSpaceSchema.index({ owner_id: 1, is_available: 1 });
parkingSpaceSchema.index({ is_available: 1, price_per_hour: 1 });
parkingSpaceSchema.index({ average_rating: -1 });
parkingSpaceSchema.index({ has_ev_charging: 1 });

module.exports = mongoose.model('ParkingSpace', parkingSpaceSchema);
