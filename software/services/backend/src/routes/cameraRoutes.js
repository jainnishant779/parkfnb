const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const camerasController = require('../controllers/camerasController');
const { protect } = require('../middleware/auth');
const { authorize, isAdmin } = require('../middleware/roleCheck');

// Pairing takes a code an admin hands over, so it is the one route here worth
// guessing at. The code also burns itself after 5 wrong tries; this is the
// second fence. Keyed by the signed-in user, which protect() has already set.
const pairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CAMERA_PAIR_RATE_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String((req.user && req.user._id) || 'anonymous'),
  validate: { keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', http: 429, message: 'Too many pairing attempts. Try again in a few minutes.' },
  },
});

// Every camera route needs a signed-in user.
router.use(protect);

// ParkFNB admin: inventory and assignment. Keep these above /:cameraId so that
// "admin" is never read as a camera id.
router.get('/admin', isAdmin, camerasController.getAdminCameras);
router.post('/admin', isAdmin, camerasController.createCamera);
router.put('/admin/:cameraId/assignment', isAdmin, camerasController.assignCamera);
router.post('/admin/:cameraId/pairing-code', isAdmin, camerasController.createPairingCode);
router.patch('/admin/:cameraId', isAdmin, camerasController.updateCamera);
router.delete('/admin/:cameraId', isAdmin, camerasController.deleteCamera);

// Owner. authorize('owner'), not isOwner: isOwner also lets admins in, and an
// admin has no Owner record to own cameras with.
router.get('/mine', authorize('owner'), camerasController.getMyCameras);
router.post('/pair', authorize('owner'), pairLimiter, camerasController.pairCamera);
router.post('/access-grant', authorize('owner'), camerasController.accessGrant);
router.delete('/:cameraId/unpair', authorize('owner'), camerasController.unpairCamera);

module.exports = router;
