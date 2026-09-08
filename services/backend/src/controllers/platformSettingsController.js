/**
 * Platform Settings Controller
 * Handles system configuration and feature flags
 */

const PlatformSettings = require('../models/PlatformSettings');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

// Default platform settings
const DEFAULT_SETTINGS = {
  'platform.name': { value: 'ParkingBNB', description: 'Platform name', is_public: true },
  'platform.version': { value: '1.0.0', description: 'Platform version', is_public: true },
  'platform.commission_rate': { value: 0.15, description: 'Platform commission rate (15%)', is_public: false },
  'feature.instant_booking': { value: true, description: 'Enable instant booking', is_public: true },
  'feature.promo_codes': { value: true, description: 'Enable promo codes', is_public: true },
  'maintenance.mode': { value: false, description: 'Maintenance mode', is_public: true },
  'payment.min_amount': { value: 5, description: 'Minimum payment amount', is_public: true },
  'payment.max_amount': { value: 10000, description: 'Maximum payment amount', is_public: true },
  'booking.min_hours': { value: 1, description: 'Minimum booking duration in hours', is_public: true },
  'booking.max_days': { value: 30, description: 'Maximum booking duration in days', is_public: true },
  'booking.cancellation_hours': { value: 24, description: 'Hours before booking to cancel', is_public: true }
};

/**
 * @desc    Get all platform settings
 * @route   GET /api/settings
 * @access  Private/Admin
 */
exports.getAllSettings = async (req, res, next) => {
  try {
    // Admin check
    if (req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only admins can view all settings');
    }

    const settings = await PlatformSettings.find().sort({ setting_key: 1 });

    // Convert to key-value object for easier consumption
    const settingsObject = {};
    settings.forEach(setting => {
      settingsObject[setting.setting_key] = {
        value: setting.setting_value,
        description: setting.description,
        updated_at: setting.updated_at
      };
    });

    return success(res, {
      settings: settingsObject,
      count: settings.length
    });
  } catch (err) {
    console.error('Get all settings error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching settings');
  }
};

/**
 * @desc    Get setting by key
 * @route   GET /api/settings/:key
 * @access  Private/Admin
 */
exports.getSettingByKey = async (req, res, next) => {
  try {
    // Admin check
    if (req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only admins can view settings');
    }

    const { key } = req.params;

    const setting = await PlatformSettings.findOne({ setting_key: key });

    if (!setting) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Setting not found');
    }

    return success(res, { setting });
  } catch (err) {
    console.error('Get setting by key error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching setting');
  }
};

/**
 * @desc    Get public settings (for frontend)
 * @route   GET /api/settings/public
 * @access  Public
 */
exports.getPublicSettings = async (req, res, next) => {
  try {
    // Get all settings and filter public ones
    const settings = await PlatformSettings.find();

    const publicSettings = {};

    settings.forEach(setting => {
      // Consider settings as public if key starts with certain prefixes or is specifically marked
      const isPublicKey = setting.setting_key.startsWith('feature.') ||
                         setting.setting_key.startsWith('platform.name') ||
                         setting.setting_key.startsWith('platform.version') ||
                         setting.setting_key.startsWith('maintenance.') ||
                         setting.setting_key.includes('min_') ||
                         setting.setting_key.includes('max_') ||
                         setting.setting_key.includes('cancellation');

      if (isPublicKey) {
        publicSettings[setting.setting_key] = setting.setting_value;
      }
    });

    // Add default public settings if not in database
    if (Object.keys(publicSettings).length === 0) {
      Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (DEFAULT_SETTINGS[key].is_public) {
          publicSettings[key] = DEFAULT_SETTINGS[key].value;
        }
      });
    }

    return success(res, { settings: publicSettings });
  } catch (err) {
    console.error('Get public settings error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error fetching public settings');
  }
};

/**
 * @desc    Create or update setting
 * @route   PUT /api/settings/:key
 * @access  Private/Admin
 */
exports.upsertSetting = async (req, res, next) => {
  try {
    // Admin check
    if (req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only admins can update settings');
    }

    const { key } = req.params;
    const { value, description } = req.body;

    if (value === undefined) {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Setting value is required');
    }

    // Upsert the setting
    const setting = await PlatformSettings.findOneAndUpdate(
      { setting_key: key },
      {
        setting_key: key,
        setting_value: value,
        description: description || `Setting for ${key}`,
        updated_at: new Date()
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    return success(res, {
      message: 'Setting updated successfully',
      setting
    });
  } catch (err) {
    console.error('Upsert setting error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating setting');
  }
};

/**
 * @desc    Delete setting
 * @route   DELETE /api/settings/:key
 * @access  Private/Admin (super admin only)
 */
exports.deleteSetting = async (req, res, next) => {
  try {
    // Admin check
    if (req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only admins can delete settings');
    }

    const { key } = req.params;

    // Prevent deletion of critical settings
    const criticalSettings = [
      'platform.name',
      'platform.version',
      'platform.commission_rate'
    ];

    if (criticalSettings.includes(key)) {
      return error(res, errorCodes.BIZ_CONFLICT, 409, 'Cannot delete critical platform settings');
    }

    const setting = await PlatformSettings.findOneAndDelete({ setting_key: key });

    if (!setting) {
      return error(res, errorCodes.NOT_FOUND, 404, 'Setting not found');
    }

    return success(res, {
      message: 'Setting deleted successfully',
      deleted_setting: setting.setting_key
    });
  } catch (err) {
    console.error('Delete setting error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error deleting setting');
  }
};

/**
 * @desc    Bulk update settings
 * @route   PUT /api/settings/bulk
 * @access  Private/Admin
 */
exports.bulkUpdateSettings = async (req, res, next) => {
  try {
    // Admin check
    if (req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only admins can update settings');
    }

    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return error(res, errorCodes.REQ_VALIDATION, 400, 'Settings object is required');
    }

    const updatePromises = [];
    const updatedKeys = [];

    // Update each setting
    Object.keys(settings).forEach(key => {
      const settingData = settings[key];

      const updatePromise = PlatformSettings.findOneAndUpdate(
        { setting_key: key },
        {
          setting_key: key,
          setting_value: settingData.value !== undefined ? settingData.value : settingData,
          description: settingData.description || `Setting for ${key}`,
          updated_at: new Date()
        },
        {
          new: true,
          upsert: true,
          runValidators: true
        }
      );

      updatePromises.push(updatePromise);
      updatedKeys.push(key);
    });

    await Promise.all(updatePromises);

    return success(res, {
      message: 'Settings updated successfully',
      updated_count: updatedKeys.length,
      updated_keys: updatedKeys
    });
  } catch (err) {
    console.error('Bulk update settings error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error updating settings');
  }
};

/**
 * @desc    Reset settings to default
 * @route   POST /api/settings/reset
 * @access  Private/Admin (super admin only)
 */
exports.resetToDefault = async (req, res, next) => {
  try {
    // Admin check
    if (req.user.user_type !== 'admin') {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Only admins can reset settings');
    }

    // Delete all existing settings
    await PlatformSettings.deleteMany({});

    // Insert default settings
    const defaultSettingsArray = Object.keys(DEFAULT_SETTINGS).map(key => ({
      setting_key: key,
      setting_value: DEFAULT_SETTINGS[key].value,
      description: DEFAULT_SETTINGS[key].description,
      updated_at: new Date()
    }));

    await PlatformSettings.insertMany(defaultSettingsArray);

    return success(res, {
      message: 'Settings reset to default successfully',
      settings_count: defaultSettingsArray.length
    });
  } catch (err) {
    console.error('Reset settings error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Error resetting settings');
  }
};
