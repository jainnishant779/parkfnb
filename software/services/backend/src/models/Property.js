const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: true,
    index: true
  },
  property_name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  state: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  postal_code: {
    type: String,
    required: true,
    trim: true
  },
  country: {
    type: String,
    trim: true,
    default: 'IN'
  },
  location_lat: {
    type: Number,
    required: true
  },
  location_lng: {
    type: Number,
    required: true
  },
  access_instructions: {
    type: String,
    trim: true
  },
  property_images: {
    type: [String],
    default: []
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Geospatial index for location-based queries
propertySchema.index({ location_lat: 1, location_lng: 1 });
propertySchema.index({ owner_id: 1, is_active: 1 });

module.exports = mongoose.model('Property', propertySchema);
