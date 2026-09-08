const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  booking_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  space_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSpace',
    required: true,
    index: true
  },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    required: true,
    index: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: 'rating must be an integer between 1 and 5'
    }
  },
  review_text: {
    type: String,
    trim: true
  },
  review_images: {
    type: [String],
    default: []
  },
  owner_response: {
    type: String,
    trim: true
  },
  owner_responded_at: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Compound indexes for efficient queries
reviewSchema.index({ space_id: 1, rating: -1 });
reviewSchema.index({ owner_id: 1, rating: -1 });
reviewSchema.index({ user_id: 1, created_at: -1 });
reviewSchema.index({ booking_id: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
