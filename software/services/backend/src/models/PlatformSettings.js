const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema({
  setting_key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  setting_value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: { createdAt: false, updatedAt: 'updated_at' }
});

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
