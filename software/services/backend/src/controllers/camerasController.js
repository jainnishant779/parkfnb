/**
 * Cameras Controller
 *
 * Links ANPR cameras (ai/anpr, known there only by camera_id) to owners and
 * properties, and hands an owner a short-lived pass the ANPR service accepts.
 *
 *   owner:  GET /mine, POST /pair, DELETE /:cameraId/unpair, POST /access-grant
 *   admin:  GET /admin, POST /admin, PUT /admin/:cameraId/assignment,
 *           POST /admin/:cameraId/pairing-code, PATCH|DELETE /admin/:cameraId
 *
 * The ANPR service never calls this backend: it verifies the pass with the
 * shared ANPR_GRANT_SECRET and trusts what is in it (see ai/anpr/grant_auth.py).
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Camera = require('../models/Camera');
const Owner = require('../models/Owner');
const Property = require('../models/Property');
const { isTestLoginActive } = require('./otpController');
const { success, error } = require('../utils/responseHelper');
const errorCodes = require('../utils/errorCodes');

const CAMERA_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
// The ANPR service's own key alphabet: no look-alikes (0/o, 1/l/i, q, g).
const CODE_ALPHABET = 'abcdefhjkmnprstuvwxyz23456789';
const CODE_LENGTH = 10;
const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CAMERAS_PER_GRANT = 50;
const GRANT_ISSUER = 'parkfnb-backend';
const GRANT_AUDIENCE = 'parkfnb-anpr';
const MIN_SECRET_LENGTH = 32;

const isProd = () => process.env.NODE_ENV === 'production';

// ------------------------------------------------------------------ helpers

const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '');

/** ANPR servers this backend may point an owner's browser at. */
const allowedBaseUrls = () => {
  const set = new Set();
  const def = trimUrl(process.env.ANPR_DEFAULT_BASE_URL);
  if (def) set.add(def);
  String(process.env.ANPR_BASE_URLS || '')
    .split(',')
    .map(trimUrl)
    .filter(Boolean)
    .forEach((u) => set.add(u));
  return [...set];
};

const resolveBaseUrl = (camera) =>
  trimUrl(camera.anpr_base_url) || trimUrl(process.env.ANPR_DEFAULT_BASE_URL);

const makeCode = () => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
};
const showCode = (code) => `${code.slice(0, CODE_LENGTH / 2)}-${code.slice(CODE_LENGTH / 2)}`;
/** What an owner typed, however they spaced or capitalised it. */
const cleanCode = (raw) => String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hashCode = (cameraId, code) =>
  crypto.createHash('sha256').update(`${cameraId}:${code}`).digest('hex');
const sameHash = (a, b) => {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** A camera as the API shows it: never the code hash. Admins also see whether a code is waiting. */
const publicCamera = (doc, { admin = false } = {}) => {
  const o = doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const p = o.pairing || {};
  const pending = Boolean(p.code_hash && p.expires_at && new Date(p.expires_at) > new Date());
  delete o.pairing;
  delete o.__v;
  if (admin) {
    o.pairing_pending = pending;
    o.pairing_expires_at = pending ? p.expires_at : null;
  }
  return o;
};

const loadOwner = async (req, res) => {
  const owner = await Owner.findOne({ user_id: req.user._id }).select('_id user_id');
  if (!owner) {
    error(res, errorCodes.AUTH_FORBIDDEN, 403, 'Finish owner sign-up first');
    return null;
  }
  return owner;
};

const badCameraId = (res) =>
  error(res, errorCodes.REQ_INVALID_FORMAT, 400,
    'Camera ID may only use letters, numbers, - and _ (up to 32 characters)');

const noStore = (res) => res.set('Cache-Control', 'no-store');

// ------------------------------------------------------------------- owner

/** GET /api/cameras/mine */
exports.getMyCameras = async (req, res) => {
  try {
    const owner = await loadOwner(req, res);
    if (!owner) return;
    const cameras = await Camera.find({ owner_id: owner._id })
      .populate('property_id', 'property_name city')
      .sort({ camera_id: 1 });
    return success(res, cameras.map((c) => publicCamera(c)));
  } catch (err) {
    console.error('getMyCameras error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not load your cameras');
  }
};

const PAIR_FAILED = 'That camera ID and code do not match, or the code has expired. Ask ParkFNB for a new code.';

/**
 * POST /api/cameras/pair { camera_id, pairing_code, property_id }
 *
 * Every way of not matching (no such camera, someone else's camera, no code,
 * an expired or wrong code) answers the same, so this cannot be used to find
 * out which camera IDs exist or who owns them.
 */
exports.pairCamera = async (req, res) => {
  try {
    const cameraId = String((req.body && req.body.camera_id) || '').trim();
    const code = cleanCode(req.body && req.body.pairing_code);
    const propertyId = req.body && req.body.property_id;
    if (!CAMERA_ID_RE.test(cameraId)) return badCameraId(res);
    if (code.length !== CODE_LENGTH) {
      return error(res, errorCodes.REQ_INVALID_FORMAT, 400, 'Enter the 10-character pairing code');
    }
    if (!mongoose.isValidObjectId(propertyId)) {
      return error(res, errorCodes.REQ_INVALID_FORMAT, 400, 'Choose the property this camera is on');
    }

    const owner = await loadOwner(req, res);
    if (!owner) return;

    const property = await Property.findById(propertyId).select('owner_id');
    if (!property || String(property.owner_id) !== String(owner._id)) {
      return error(res, errorCodes.AUTH_FORBIDDEN, 403, 'That property is not yours');
    }

    const camera = await Camera.findOne({ camera_id: cameraId }).select('+pairing.code_hash');
    if (camera && camera.owner_id && String(camera.owner_id) === String(owner._id)) {
      return success(res, publicCamera(camera)); // already yours: nothing to do
    }

    const live = camera && !camera.owner_id && camera.pairing && camera.pairing.code_hash
      && camera.pairing.expires_at && camera.pairing.expires_at > new Date()
      && camera.pairing.attempts < MAX_CODE_ATTEMPTS;
    if (!live) return error(res, errorCodes.REQ_VALIDATION, 400, PAIR_FAILED);

    if (!sameHash(camera.pairing.code_hash, hashCode(cameraId, code))) {
      const after = await Camera.findOneAndUpdate(
        { _id: camera._id, owner_id: null },
        { $inc: { 'pairing.attempts': 1 } },
        { new: true },
      );
      if (after && after.pairing && after.pairing.attempts >= MAX_CODE_ATTEMPTS) {
        await Camera.updateOne({ _id: camera._id }, { $unset: { pairing: 1 } }); // burned
      }
      return error(res, errorCodes.REQ_VALIDATION, 400, PAIR_FAILED);
    }

    // Single use, even when two requests race: only one finds the code still there.
    const linked = await Camera.findOneAndUpdate(
      { _id: camera._id, owner_id: null, 'pairing.code_hash': camera.pairing.code_hash },
      {
        $set: {
          owner_id: owner._id,
          property_id: property._id,
          status: 'active',
          linked_via: 'pairing',
          linked_at: new Date(),
        },
        $unset: { pairing: 1 },
      },
      { new: true },
    ).populate('property_id', 'property_name city');
    if (!linked) return error(res, errorCodes.REQ_VALIDATION, 400, PAIR_FAILED);

    return success(res, publicCamera(linked));
  } catch (err) {
    console.error('pairCamera error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not pair the camera');
  }
};

/** DELETE /api/cameras/:cameraId/unpair */
exports.unpairCamera = async (req, res) => {
  try {
    const { cameraId } = req.params;
    if (!CAMERA_ID_RE.test(cameraId)) return badCameraId(res);
    const owner = await loadOwner(req, res);
    if (!owner) return;

    // Someone else's camera answers exactly like one that does not exist.
    const camera = await Camera.findOneAndUpdate(
      { camera_id: cameraId, owner_id: owner._id },
      {
        $set: { owner_id: null, property_id: null, status: 'unassigned', linked_via: null, linked_at: null },
        $unset: { pairing: 1 },
      },
      { new: true },
    );
    if (!camera) return error(res, errorCodes.RES_NOT_FOUND, 404, 'Camera not found');
    return success(res, publicCamera(camera));
  } catch (err) {
    console.error('unpairCamera error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not unpair the camera');
  }
};

/**
 * POST /api/cameras/access-grant
 *
 * Mints a pass per ANPR server for the owner's active cameras. The pass is
 * short-lived and carries, for each camera, the time the owner got it ("since"):
 * the ANPR service hides anything recorded earlier.
 */
exports.accessGrant = async (req, res) => {
  try {
    noStore(res);
    const secret = process.env.ANPR_GRANT_SECRET || '';
    if (secret.length < MIN_SECRET_LENGTH) {
      return error(res, errorCodes.SERVER_ERROR, 503, 'Camera access is not set up yet');
    }
    // Owners see number plates through this pass. While the fixed test code can
    // still sign anybody in, that is one guess away from a stranger.
    if (isProd() && process.env.ANPR_GRANT_ALLOW_TEST_LOGIN !== 'true' && await isTestLoginActive()) {
      return error(res, errorCodes.SERVER_ERROR, 503,
        'Camera access is switched off while the test sign-in code works');
    }

    const owner = await loadOwner(req, res);
    if (!owner) return;

    const ttl = Math.min(Math.max(Number(process.env.ANPR_GRANT_TTL_S) || 900, 60), 3600);
    const allowed = new Set(allowedBaseUrls());
    const cameras = await Camera.find({ owner_id: owner._id, status: 'active' })
      .populate('property_id', 'property_name')
      .sort({ camera_id: 1 })
      .limit(MAX_CAMERAS_PER_GRANT);

    const byServer = new Map();
    for (const c of cameras) {
      const base = resolveBaseUrl(c);
      if (!base || !allowed.has(base)) continue; // never send a pass to an address nobody approved
      if (!byServer.has(base)) byServer.set(base, []);
      byServer.get(base).push(c);
    }

    const grants = [];
    for (const [base, list] of byServer) {
      const cams = {};
      for (const c of list) {
        cams[c.camera_id] = Math.floor(new Date(c.linked_at || c.created_at).getTime() / 1000);
      }
      const token = jwt.sign(
        { sub: String(req.user._id), oid: String(owner._id), scope: 'owner', cams },
        secret,
        { algorithm: 'HS256', expiresIn: ttl, issuer: GRANT_ISSUER, audience: GRANT_AUDIENCE },
      );
      grants.push({
        anpr_base_url: base,
        token,
        cameras: list.map((c) => ({
          camera_id: c.camera_id,
          name: c.name || c.camera_id,
          property_id: c.property_id ? String(c.property_id._id) : null,
          property_name: c.property_id ? c.property_id.property_name : null,
        })),
      });
    }

    return success(res, {
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      refresh_after_s: Math.floor((ttl * 2) / 3),
      grants,
    });
  } catch (err) {
    console.error('accessGrant error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not issue camera access');
  }
};

// ------------------------------------------------------------------- admin

const adminCameraQuery = (filter = {}) =>
  Camera.find(filter)
    .select('+pairing.code_hash')
    .populate({
      path: 'owner_id',
      select: 'business_name user_id',
      populate: { path: 'user_id', select: 'first_name last_name phone' },
    })
    .populate('property_id', 'property_name city');

/** GET /api/cameras/admin */
exports.getAdminCameras = async (req, res) => {
  try {
    const [cameras, properties] = await Promise.all([
      adminCameraQuery().sort({ camera_id: 1 }),
      Property.find({ is_active: { $ne: false } })
        .select('property_name city owner_id')
        .populate({
          path: 'owner_id',
          select: 'business_name user_id',
          populate: { path: 'user_id', select: 'first_name last_name phone' },
        })
        .sort({ property_name: 1 })
        .limit(2000),
    ]);
    return success(res, {
      cameras: cameras.map((c) => publicCamera(c, { admin: true })),
      properties,
      anpr_base_urls: allowedBaseUrls(),
    });
  } catch (err) {
    console.error('getAdminCameras error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not load cameras');
  }
};

/** POST /api/cameras/admin { camera_id, name?, anpr_base_url? } */
exports.createCamera = async (req, res) => {
  try {
    const cameraId = String((req.body && req.body.camera_id) || '').trim();
    if (!CAMERA_ID_RE.test(cameraId)) return badCameraId(res);

    let base = null;
    if (req.body.anpr_base_url) {
      base = trimUrl(req.body.anpr_base_url);
      if (!allowedBaseUrls().includes(base)) {
        return error(res, errorCodes.REQ_INVALID_FORMAT, 400,
          'That ANPR server is not in ANPR_BASE_URLS');
      }
    }
    if (await Camera.exists({ camera_id: cameraId })) {
      return error(res, errorCodes.RES_CONFLICT, 409, 'A camera with this ID already exists');
    }

    const camera = await Camera.create({
      camera_id: cameraId,
      name: String(req.body.name || '').trim().slice(0, 80),
      anpr_base_url: base,
      created_by: req.user._id,
    });
    return success(res, publicCamera(camera, { admin: true }), null, 201);
  } catch (err) {
    if (err && err.code === 11000) {
      return error(res, errorCodes.RES_CONFLICT, 409, 'A camera with this ID already exists');
    }
    console.error('createCamera error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not create the camera');
  }
};

/**
 * PUT /api/cameras/admin/:cameraId/assignment { property_id | null }
 *
 * The owner comes from the property, so the two can never disagree. Giving a
 * camera to a different owner starts a new "since" time; moving it between one
 * owner's own properties does not.
 */
exports.assignCamera = async (req, res) => {
  try {
    const { cameraId } = req.params;
    if (!CAMERA_ID_RE.test(cameraId)) return badCameraId(res);
    const camera = await Camera.findOne({ camera_id: cameraId });
    if (!camera) return error(res, errorCodes.RES_NOT_FOUND, 404, 'Camera not found');

    const requested = req.body ? req.body.property_id : null;
    let update;
    if (requested === null || requested === undefined || requested === '') {
      update = {
        $set: { owner_id: null, property_id: null, status: 'unassigned', linked_via: null, linked_at: null },
        $unset: { pairing: 1 },
      };
    } else {
      if (!mongoose.isValidObjectId(requested)) {
        return error(res, errorCodes.REQ_INVALID_FORMAT, 400, 'Invalid property id');
      }
      const property = await Property.findById(requested).select('owner_id');
      if (!property) return error(res, errorCodes.RES_NOT_FOUND, 404, 'Property not found');

      const ownerChanged = !camera.owner_id || String(camera.owner_id) !== String(property.owner_id);
      update = {
        $set: {
          owner_id: property.owner_id,
          property_id: property._id,
          status: camera.status === 'disabled' ? 'disabled' : 'active',
          linked_via: 'admin',
          ...(ownerChanged ? { linked_at: new Date() } : {}),
        },
        $unset: { pairing: 1 },
      };
    }

    await Camera.updateOne({ _id: camera._id }, update);
    const fresh = await adminCameraQuery({ _id: camera._id });
    return success(res, publicCamera(fresh[0], { admin: true }));
  } catch (err) {
    console.error('assignCamera error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not assign the camera');
  }
};

/** POST /api/cameras/admin/:cameraId/pairing-code: the only time the code is shown. */
exports.createPairingCode = async (req, res) => {
  try {
    noStore(res);
    const { cameraId } = req.params;
    if (!CAMERA_ID_RE.test(cameraId)) return badCameraId(res);
    const camera = await Camera.findOne({ camera_id: cameraId }).select('owner_id');
    if (!camera) return error(res, errorCodes.RES_NOT_FOUND, 404, 'Camera not found');
    if (camera.owner_id) {
      return error(res, errorCodes.RES_CONFLICT, 409,
        'This camera already has an owner. Unassign it before making a code.');
    }

    const code = makeCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await Camera.updateOne({ _id: camera._id, owner_id: null }, {
      $set: {
        pairing: {
          code_hash: hashCode(cameraId, code),
          expires_at: expiresAt,
          attempts: 0,
          created_by: req.user._id,
        },
      },
    });
    return success(res, { camera_id: cameraId, code: showCode(code), expires_at: expiresAt.toISOString() });
  } catch (err) {
    console.error('createPairingCode error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not make a pairing code');
  }
};

/** PATCH /api/cameras/admin/:cameraId { name?, status?, anpr_base_url? } */
exports.updateCamera = async (req, res) => {
  try {
    const { cameraId } = req.params;
    if (!CAMERA_ID_RE.test(cameraId)) return badCameraId(res);
    const camera = await Camera.findOne({ camera_id: cameraId });
    if (!camera) return error(res, errorCodes.RES_NOT_FOUND, 404, 'Camera not found');

    const body = req.body || {};
    const set = {};
    if (body.name !== undefined) set.name = String(body.name || '').trim().slice(0, 80);
    if (body.anpr_base_url !== undefined) {
      if (body.anpr_base_url === null || body.anpr_base_url === '') {
        set.anpr_base_url = null;
      } else {
        const base = trimUrl(body.anpr_base_url);
        if (!allowedBaseUrls().includes(base)) {
          return error(res, errorCodes.REQ_INVALID_FORMAT, 400, 'That ANPR server is not in ANPR_BASE_URLS');
        }
        set.anpr_base_url = base;
      }
    }
    if (body.status !== undefined) {
      if (body.status === 'disabled') {
        set.status = 'disabled';
      } else if (body.status === 'active' && camera.owner_id) {
        set.status = 'active';
      } else {
        return error(res, errorCodes.REQ_INVALID_FORMAT, 400,
          "status can be 'disabled', or 'active' for a camera that has an owner. Use the assignment to unassign.");
      }
    }

    await Camera.updateOne({ _id: camera._id }, { $set: set });
    const fresh = await adminCameraQuery({ _id: camera._id });
    return success(res, publicCamera(fresh[0], { admin: true }));
  } catch (err) {
    console.error('updateCamera error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not update the camera');
  }
};

/** DELETE /api/cameras/admin/:cameraId: only for a camera nobody owns. */
exports.deleteCamera = async (req, res) => {
  try {
    const { cameraId } = req.params;
    if (!CAMERA_ID_RE.test(cameraId)) return badCameraId(res);
    const camera = await Camera.findOne({ camera_id: cameraId }).select('owner_id');
    if (!camera) return error(res, errorCodes.RES_NOT_FOUND, 404, 'Camera not found');
    if (camera.owner_id) {
      return error(res, errorCodes.RES_CONFLICT, 409, 'Unassign the camera before deleting it');
    }
    await Camera.deleteOne({ _id: camera._id });
    return success(res, { camera_id: cameraId, deleted: true });
  } catch (err) {
    console.error('deleteCamera error:', err);
    return error(res, errorCodes.SERVER_ERROR, 500, 'Could not delete the camera');
  }
};
