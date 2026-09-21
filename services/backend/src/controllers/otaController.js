const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OTA_BASE_DIR = path.join(__dirname, "../../uploads/ota");

// Ensure base OTA directory exists
if (!fs.existsSync(OTA_BASE_DIR)) {
  fs.mkdirSync(OTA_BASE_DIR, { recursive: true });
}

const normalizeTarget = (target) => {
  const t = (target || "").toLowerCase().trim();
  if (t === "esp32" || t === "firmware" || t === "barrier") return "firmware";
  if (t === "consumer" || t === "owner") return t;
  return null;
};

/**
 * GET /api/v1/ota/check
 * Query: app (consumer|owner|firmware), platform (android|ios|esp32), currentVersion, bundleVersion
 */
exports.checkUpdate = async (req, res) => {
  try {
    const rawApp = req.query.app || "consumer";
    const app = normalizeTarget(rawApp);
    const bundleVersion =
      req.query.bundleVersion || req.query.version || "base";

    if (!app) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_APP",
          message: 'app must be "consumer", "owner", or "firmware"',
        },
      });
    }

    const metaPath = path.join(OTA_BASE_DIR, app, "meta.json");
    if (!fs.existsSync(metaPath)) {
      return res.json({
        success: true,
        hasUpdate: false,
        message: `No OTA releases published for ${app} yet`,
        currentBundleVersion: bundleVersion,
      });
    }

    const raw = fs.readFileSync(metaPath, "utf-8");
    const meta = JSON.parse(raw);

    // If client already has this bundle version, no update needed
    const hasUpdate = meta.version && meta.version !== bundleVersion;

    return res.json({
      success: true,
      hasUpdate,
      bundleVersion: meta.version,
      bundleUrl: meta.bundleUrl,
      checksum: meta.checksum,
      size: meta.size,
      mandatory: meta.mandatory || false,
      releaseNotes: meta.releaseNotes || "",
      releasedAt: meta.releasedAt,
    });
  } catch (err) {
    console.error("[OTA] checkUpdate error:", err);
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message },
    });
  }
};

/**
 * POST /api/v1/ota/publish
 * Form data:
 * - bundle: file (index.android.bundle or firmware.bin)
 * - app: 'consumer' | 'owner' | 'firmware'
 * - version: e.g. '1.0.1'
 * - releaseNotes: string
 * - mandatory: 'true' | 'false'
 * Headers:
 * - x-ota-secret: matching process.env.OTA_SECRET or default, OR JWT admin session
 */
exports.publishBundle = async (req, res) => {
  try {
    const secret = req.headers["x-ota-secret"];
    const expectedSecret =
      process.env.OTA_SECRET || "parkbnb-ota-secret-key-2026";
    const isAdmin = req.user && req.user.user_type === "admin";

    if (secret !== expectedSecret && !isAdmin) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or missing x-ota-secret header",
        },
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_FILE", message: "Release file is required" },
      });
    }

    const app = normalizeTarget(req.body.app);
    const version = (req.body.version || "").trim();
    const releaseNotes = req.body.releaseNotes || "";
    const mandatory =
      req.body.mandatory === "true" || req.body.mandatory === true;

    if (!app) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_APP",
          message: 'app must be "consumer", "owner", or "firmware"',
        },
      });
    }

    if (!version) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_VERSION",
          message: "version string is required",
        },
      });
    }

    // Target folder: uploads/ota/<app>/<version>/
    const appDir = path.join(OTA_BASE_DIR, app);
    const versionDir = path.join(appDir, version);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    const isFirmware = app === "firmware";
    const fileName = isFirmware
      ? req.file.originalname.endsWith(".bin")
        ? req.file.originalname
        : "firmware.bin"
      : "index.android.bundle";
    const targetBundlePath = path.join(versionDir, fileName);

    // Move uploaded file to final path
    fs.renameSync(req.file.path, targetBundlePath);

    // Compute sha256 checksum
    const fileBuffer = fs.readFileSync(targetBundlePath);
    const checksum = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");
    const size = fileBuffer.length;

    // Resolve public URL for bundle
    const host = req.get("host");
    const protocol = req.protocol;
    const bundleUrl = `${protocol}://${host}/uploads/ota/${app}/${version}/${fileName}`;

    const meta = {
      app,
      version,
      fileName,
      bundleUrl,
      checksum,
      size,
      releaseNotes,
      mandatory,
      releasedAt: new Date().toISOString(),
    };

    // Save meta.json both in version folder and as active release in app folder
    fs.writeFileSync(
      path.join(versionDir, "meta.json"),
      JSON.stringify(meta, null, 2),
    );
    fs.writeFileSync(
      path.join(appDir, "meta.json"),
      JSON.stringify(meta, null, 2),
    );

    console.log(
      `[OTA] Published ${app} release ${version} (${size} bytes, sha256: ${checksum.slice(0, 8)}...)`,
    );

    return res.status(201).json({
      success: true,
      message: `Successfully published OTA release ${version} for ${app}`,
      release: meta,
    });
  } catch (err) {
    console.error("[OTA] publishBundle error:", err);
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message },
    });
  }
};

/**
 * GET /api/v1/ota/status
 * Returns current active OTA releases for consumer, owner, and firmware
 */
exports.getStatus = async (req, res) => {
  try {
    const apps = ["consumer", "owner", "firmware"];
    const status = {};

    for (const app of apps) {
      const metaPath = path.join(OTA_BASE_DIR, app, "meta.json");
      if (fs.existsSync(metaPath)) {
        status[app] = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      } else {
        status[app] = null;
      }
    }

    return res.json({
      success: true,
      releases: status,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message },
    });
  }
};

/**
 * GET /api/v1/ota/releases
 * Returns full release history across targets for admin portal
 */
exports.getAllReleases = async (req, res) => {
  try {
    const apps = ["consumer", "owner", "firmware"];
    const history = [];

    for (const app of apps) {
      const appDir = path.join(OTA_BASE_DIR, app);
      if (!fs.existsSync(appDir)) continue;

      const entries = fs.readdirSync(appDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const vMeta = path.join(appDir, entry.name, "meta.json");
          if (fs.existsSync(vMeta)) {
            try {
              const meta = JSON.parse(fs.readFileSync(vMeta, "utf-8"));
              history.push(meta);
            } catch (e) {}
          }
        }
      }
    }

    history.sort(
      (a, b) => new Date(b.releasedAt || 0) - new Date(a.releasedAt || 0),
    );

    return res.json({
      success: true,
      releases: history,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message },
    });
  }
};
