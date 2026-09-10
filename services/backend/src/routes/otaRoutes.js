const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const otaController = require('../controllers/otaController');

const TMP_UPLOAD_DIR = path.join(__dirname, '../../uploads/ota/tmp');
if (!fs.existsSync(TMP_UPLOAD_DIR)) {
  fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_UPLOAD_DIR),
  filename: (req, file, cb) => {
    cb(null, `bundle-${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Check for updates (called by apps)
router.get('/check', otaController.checkUpdate);

// Get status of active releases
router.get('/status', otaController.getStatus);

// Publish a new bundle (called by publishing script)
router.post('/publish', upload.single('bundle'), otaController.publishBundle);

module.exports = router;
