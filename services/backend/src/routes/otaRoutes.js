const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const otaController = require("../controllers/otaController");
const { optionalAuth } = require("../middleware/auth");

const TMP_UPLOAD_DIR = path.join(__dirname, "../../uploads/ota/tmp");
if (!fs.existsSync(TMP_UPLOAD_DIR)) {
  fs.mkdirSync(TMP_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, TMP_UPLOAD_DIR),
  filename: (req, file, cb) => {
    cb(null, `release-${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Check for updates (called by apps or ESP32)
router.get("/check", otaController.checkUpdate);

// Get status of active releases (consumer, owner, firmware)
router.get("/status", otaController.getStatus);

// List all releases and history (for admin dashboard)
router.get("/releases", otaController.getAllReleases);

// Publish a new bundle or firmware binary (called by CLI script or Admin UI)
router.post(
  "/publish",
  optionalProtect,
  upload.single("bundle"),
  otaController.publishBundle,
);

module.exports = router;
