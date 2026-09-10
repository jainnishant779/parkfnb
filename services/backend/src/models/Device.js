const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  device_id: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  parking_space_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSpace',
    default: null,
    index: true,
  },
  name: {
    type: String,
    trim: true,
    default: 'Smart Barrier',
  },
  device_type: {
    type: String,
    enum: ['barrier', 'lock', 'gate'],
    default: 'barrier',
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'error', 'maintenance'],
    default: 'offline',
    index: true,
  },
  secret_token: {
    type: String,
    trim: true,
    default: 'change-me-to-a-long-random-string',
  },
  command_counter: {
    type: Number,
    default: 1,
  },
  last_state: {
    state: { type: String, default: 'unknown' }, // 'open', 'secure', 'moving', 'fault', 'idle'
    angle: { type: Number, default: 90.0 },      // 0 = open, 90 = secure
    target: { type: Number, default: 90.0 },
    moving: { type: Boolean, default: false },
    pwm: { type: Number, default: 0 },
    rssi: { type: Number, default: 0 },
    battery_level: { type: Number, default: 100 },
    fw_version: { type: String, default: '1.0.0' },
    fault_reason: { type: String, default: null },
    updated_at: { type: Date, default: Date.now },
  },
  last_seen_at: {
    type: Date,
    default: null,
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// Compound indexes
deviceSchema.index({ owner_id: 1, status: 1 });
deviceSchema.index({ parking_space_id: 1 });

module.exports = mongoose.model('Device', deviceSchema);
