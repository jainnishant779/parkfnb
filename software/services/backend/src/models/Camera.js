const mongoose = require('mongoose');

/**
 * A camera that feeds the ANPR service (ai/anpr), and who owns it.
 *
 * The ANPR service knows a camera only by its camera_id (e.g. "phone-1") and
 * keeps its pictures, plates and violations under that id. This record is the
 * missing link from that id to an Owner and a Property, so the owner web
 * dashboard can show an owner only their own cameras.
 *
 * owner_id points to Owner, like Property, ParkingSpace and Booking do (and
 * unlike Device, whose owner_id is a User). That makes "this camera is on the
 * owner's property" a plain equality: property.owner_id == camera.owner_id.
 *
 * linked_at is when the camera got its current owner. It travels in the access
 * grant as that camera's "since" time, and the ANPR service hides everything
 * recorded before it, so a camera that changes hands never shows the previous
 * owner's plates to the new one.
 */
const cameraSchema = new mongoose.Schema({
  camera_id: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    // The same rule the ANPR service applies; case-sensitive, like its file names.
    match: /^[A-Za-z0-9_-]{1,32}$/,
  },
  name: {
    type: String,
    trim: true,
    maxlength: 80,
    default: '',
  },
  // null = use ANPR_DEFAULT_BASE_URL. Lets a second ANPR server exist later, and
  // lets one env change fix every camera when the server's address moves.
  anpr_base_url: {
    type: String,
    trim: true,
    default: null,
  },
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Owner',
    default: null,
  },
  property_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    default: null,
  },
  status: {
    type: String,
    enum: ['unassigned', 'active', 'disabled'],
    default: 'unassigned',
  },
  linked_via: {
    type: String,
    enum: ['admin', 'pairing', null],
    default: null,
  },
  linked_at: {
    type: Date,
    default: null,
  },
  // A one-time code an admin hands to the owner. Only a hash is stored, and the
  // code itself is shown once, when it is made.
  pairing: {
    code_hash: { type: String, select: false },
    expires_at: { type: Date },
    attempts: { type: Number, default: 0 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

cameraSchema.index({ owner_id: 1, status: 1 });

module.exports = mongoose.model('Camera', cameraSchema);
