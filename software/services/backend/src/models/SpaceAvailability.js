const mongoose = require('mongoose');

const spaceAvailabilitySchema = new mongoose.Schema({
  space_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSpace',
    required: true,
    index: true
  },
  day_of_week: {
    type: Number,
    required: true,
    min: 0,
    max: 6,
    validate: {
      validator: Number.isInteger,
      message: 'day_of_week must be an integer between 0 (Sunday) and 6 (Saturday)'
    }
  },
  available_from: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
      },
      message: 'available_from must be in HH:MM format (24-hour)'
    }
  },
  available_to: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v);
      },
      message: 'available_to must be in HH:MM format (24-hour)'
    }
  },
  is_available: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: false
});

// Compound index for efficient availability queries
spaceAvailabilitySchema.index({ space_id: 1, day_of_week: 1 });
spaceAvailabilitySchema.index({ space_id: 1, is_available: 1 });

module.exports = mongoose.model('SpaceAvailability', spaceAvailabilitySchema);
