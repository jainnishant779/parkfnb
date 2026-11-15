/**
 * Upload Routes
 *
 * Both apps post KYC documents and listing photos here as multipart/form-data
 * under the field name `file`, and expect back a `url` they can store on the
 * record and render later.
 *
 * Storage is Cloudinary when it is configured (see config/cloudinary.js).
 * Local disk under /uploads is the fallback for a dev checkout with no
 * credentials — never rely on it in a deployment, because Render's filesystem
 * is ephemeral and every restart wipes it.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');
const { isConfigured, uploadBuffer } = require('../config/cloudinary');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 10 * 1024 * 1024;

// KYC documents arrive as PDFs as often as photos.
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf'
};

// Cloudinary needs the bytes in hand; disk mode streams straight to /uploads.
const storage = isConfigured()
  ? multer.memoryStorage()
  : multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      // Random name: the client's filename is untrusted, and two owners
      // uploading "aadhaar.jpg" must not collide.
      const ext = ALLOWED[file.mimetype] || path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    }
  });

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    const err = new Error('Only JPEG, PNG, WebP, HEIC images and PDFs are accepted');
    err.code = 'UNSUPPORTED_TYPE';
    cb(err);
  }
});

/**
 * @desc    Upload one file
 * @route   POST /api/uploads
 * @access  Private
 */
router.post('/', protect, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return error(res, errorCodes.REQ_VALIDATION, 400,
          'That file is larger than 10 MB');
      }
      if (err.code === 'UNSUPPORTED_TYPE') {
        return error(res, errorCodes.REQ_INVALID_FORMAT, 400, err.message);
      }
      console.error('Upload error:', err);
      return error(res, errorCodes.SERVER_ERROR, 500, 'Could not store the file');
    }

    if (!req.file) {
      return error(res, errorCodes.REQ_MISSING_FIELD, 400,
        'No file was uploaded (send it as the "file" field)');
    }

    // ---- Cloudinary ----
    if (isConfigured()) {
      try {
        const result = await uploadBuffer(req.file.buffer, {
          folder: 'parkfnb',
          mimeType: req.file.mimetype,
          filename: req.file.originalname,
        });

        return success(res, {
          // Both apps store whatever `url` they get and render it later, so
          // this is the absolute Cloudinary URL rather than a /uploads path.
          url: result.secure_url,
          full_url: result.secure_url,
          public_id: result.public_id,
          format: result.format || path.extname(req.file.originalname).replace('.', ''),
          width: result.width || 0,
          height: result.height || 0,
          bytes: result.bytes || req.file.size,
          resource_type: result.resource_type,
          filename: req.file.originalname,
          mime_type: req.file.mimetype
        }, null, 201);
      } catch (e) {
        console.error('Cloudinary upload failed:', e.message);
        return error(res, errorCodes.SERVER_ERROR, 502,
          'Could not store the file with the image provider');
      }
    }

    // ---- local disk fallback (development only) ----
    const filename = req.file.filename;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host') || 'parkfnb.onrender.com';
    const fullUrl = `${protocol}://${host}/uploads/${filename}`;
    const url = `/uploads/${filename}`;

    return success(res, {
      url,
      full_url: fullUrl,
      public_id: filename,
      format: path.extname(req.file.filename).replace('.', ''),
      // Dimensions would need an image library; the apps only read them for
      // display hints and tolerate zero.
      width: 0,
      height: 0,
      bytes: req.file.size,
      resource_type: req.file.mimetype === 'application/pdf' ? 'raw' : 'image',
      filename: req.file.originalname,
      mime_type: req.file.mimetype
    }, null, 201);
  });
});

module.exports = router;
