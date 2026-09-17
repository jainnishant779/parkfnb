/**
 * Firebase bridge for the physical barrier.
 *
 * The arch-lock prototype does not speak MQTT. It polls a Firebase Realtime
 * Database node every 2 seconds and acts on whatever it finds:
 *
 *     /barriers/<BARRIER_ID>/command/action   "OPEN" | "CLOSE"
 *     /barriers/<BARRIER_ID>/device           heartbeat written by the ESP32
 *     /barriers/<BARRIER_ID>/liveData         angle, position, buzzer
 *
 * Rather than rewrite working firmware days before a demo, the backend writes
 * to both transports: MQTT for the simulator, Firebase for the real unit.
 * Whichever is listening reacts; neither knows about the other.
 *
 * Plain REST over https — no Firebase SDK, no service account. The database
 * rules are currently open, which is why this works and also why it must be
 * locked down before any pilot.
 */

const https = require('https');
const { URL } = require('url');

const DATABASE_URL = (process.env.FIREBASE_DATABASE_URL || '').replace(/\/+$/, '');
const AUTH = process.env.FIREBASE_DATABASE_SECRET || '';
const ENABLED = process.env.FIREBASE_BARRIER_ENABLED !== 'false' && Boolean(DATABASE_URL);

// MQTT ids and Firebase barrier ids are not the same namespace.
// FIREBASE_DEVICE_MAP="pb-001:BARRIER_001,pb-002:BARRIER_002"
const DEVICE_MAP = (process.env.FIREBASE_DEVICE_MAP || 'pb-001:BARRIER_001')
  .split(',')
  .map((pair) => pair.split(':').map((s) => s.trim()))
  .filter((p) => p.length === 2)
  .reduce((acc, [mqttId, fbId]) => ({ ...acc, [mqttId]: fbId }), {});

function barrierIdFor(deviceId) {
  return DEVICE_MAP[deviceId] || null;
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    if (!DATABASE_URL) return reject(new Error('FIREBASE_DATABASE_URL is not set'));

    const url = new URL(`${DATABASE_URL}${path}`);
    if (AUTH) url.searchParams.set('auth', AUTH);

    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
        timeout: 8000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : null);
            } catch {
              resolve(data);
            }
          } else {
            reject(new Error(`Firebase ${method} ${path} -> ${res.statusCode}: ${data}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Firebase request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Send open/close to the physical barrier.
 *
 * Never throws: the barrier is a secondary transport, and a Firebase outage
 * must not turn a successful MQTT unlock into a 500. Failures are returned,
 * not raised.
 */
async function sendCommand(deviceId, action) {
  if (!ENABLED) {
    return { sent: false, skipped: 'firebase bridge disabled' };
  }

  const barrierId = barrierIdFor(deviceId);
  if (!barrierId) {
    return { sent: false, skipped: `no Firebase mapping for '${deviceId}'` };
  }

  // The firmware compares the raw JSON string, so it must be exactly
  // "OPEN" or "CLOSE" — anything else is silently ignored by the device.
  const verb = String(action).toLowerCase() === 'open' ? 'OPEN' : 'CLOSE';

  try {
    await request('PATCH', `/barriers/${barrierId}/command.json`, {
      action: verb,
      commandId: Date.now(),
      source: 'parkfnb-backend',
    });
    console.log(`[firebase] ${barrierId} <- ${verb}`);
    return { sent: true, barrier_id: barrierId, action: verb };
  } catch (err) {
    console.error(`[firebase] ${barrierId} ${verb} failed:`, err.message);
    return { sent: false, barrier_id: barrierId, action: verb, error: err.message };
  }
}

/** Heartbeat + live telemetry the ESP32 publishes. */
async function getStatus(deviceId) {
  if (!ENABLED) return { available: false, reason: 'firebase bridge disabled' };

  const barrierId = barrierIdFor(deviceId);
  if (!barrierId) return { available: false, reason: `no mapping for '${deviceId}'` };

  try {
    const [device, live, command] = await Promise.all([
      request('GET', `/barriers/${barrierId}/device.json`),
      request('GET', `/barriers/${barrierId}/liveData.json`),
      request('GET', `/barriers/${barrierId}/command.json`),
    ]);
    return { available: true, barrier_id: barrierId, device, live, command };
  } catch (err) {
    return { available: false, barrier_id: barrierId, error: err.message };
  }
}

function isEnabled() {
  return ENABLED;
}

module.exports = { sendCommand, getStatus, isEnabled, barrierIdFor, DEVICE_MAP };
