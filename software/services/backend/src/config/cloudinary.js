/**
 * Cloudinary storage for user-uploaded files (KYC documents, property and
 * space photos).
 *
 * Why this exists: uploads used to be written to local disk under /uploads.
 * Render's filesystem is ephemeral, so every deploy or restart silently threw
 * away every document and photo an owner had uploaded. Cloudinary keeps them.
 *
 * Configured only when all three credentials are present. Without them —
 * a local checkout with no .env, say — isConfigured() is false and the upload
 * route falls back to local disk, which is fine for development.
 */
const cloudinary = require('cloudinary').v2;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

const configured = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (configured) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });
}

const isConfigured = () => configured;

/**
 * Upload a buffer to Cloudinary.
 *
 * PDFs (KYC documents) have to go up as `raw`; images as `image` so
 * Cloudinary can transform and serve them.
 */
const uploadBuffer = (buffer, { folder = 'parkfnb', mimeType, filename } = {}) =>
  new Promise((resolve, reject) => {
    if (!configured) return reject(new Error('Cloudinary is not configured'));

    const resourceType = mimeType === 'application/pdf' ? 'raw' : 'image';

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // Let Cloudinary pick the id; the client's filename is untrusted and
        // two owners uploading "aadhaar.jpg" must not collide.
        use_filename: false,
        unique_filename: true,
        overwrite: false,
        context: filename ? { original_filename: filename } : undefined,
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );

    stream.end(buffer);
  });

module.exports = { cloudinary, isConfigured, uploadBuffer };
