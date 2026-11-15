const express = require('express');
const router = express.Router();
const anprAccessController = require('../controllers/anprAccessController');
const { protect } = require('../middleware/auth');

/**
 * ANPR gate access.
 *
 * Deliberately NOT wrapped in `protect`: a camera has no user session.
 * The controller authenticates the service with the x-anpr-token header,
 * then applies the same booking, payment and time-window checks the
 * app-tap path uses.
 */

// POST /api/access/anpr-event
router.post('/anpr-event', anprAccessController.anprEvent);

// GET /api/access/anpr-log — service token or an admin session
router.get('/anpr-log', (req, res, next) => {
  if (req.headers['x-anpr-token']) return next();
  return protect(req, res, next);
}, anprAccessController.anprLog);

module.exports = router;
