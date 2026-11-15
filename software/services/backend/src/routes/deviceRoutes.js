const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const { protect } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleCheck');
const { validateObjectId } = require('../middleware/validation');

// All device routes require authentication
router.use(protect);

// Pair/register device
router.post('/pair', deviceController.pairDevice);

// Get my devices (Owner)
router.get('/my-devices', deviceController.getMyDevices);

// Admin inventory and parking-space assignment. Keep these routes above /:id
// so "admin" is never interpreted as a device identifier.
router.get('/admin/barrier-assignments', isAdmin, deviceController.getAdminBarrierAssignments);
router.put(
  '/admin/parking-spaces/:spaceId/barrier',
  isAdmin,
  validateObjectId('spaceId'),
  deviceController.assignBarrierToSpace
);

// Get telemetry & live state
router.get('/:id/telemetry', deviceController.getDeviceTelemetry);

// Send manual command (Owner override)
router.post('/:id/command', deviceController.sendCommand);

// Unpair device
router.delete('/:id/unpair', deviceController.unpairDevice);

// Access audit logs
router.get('/:id/logs', deviceController.getDeviceLogs);

module.exports = router;
