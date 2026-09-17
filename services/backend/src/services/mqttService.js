const mqtt = require('mqtt');
const Device = require('../models/Device');
const AccessAuditLog = require('../models/AccessAuditLog');
const firebaseBarrier = require('./firebaseBarrierService');

let client = null;
let isConnected = false;

/**
 * Initialize MQTT Client connection to HiveMQ Cloud or Mosquitto broker
 */
function initMqtt() {
  const host = process.env.MQTT_HOST || 'broker.hivemq.com';
  const port = parseInt(process.env.MQTT_PORT || '1883', 10);
  const username = process.env.MQTT_USER || undefined;
  const password = process.env.MQTT_PASS || undefined;
  const protocol = process.env.MQTT_PROTOCOL || (port === 8883 ? 'mqtts' : 'mqtt');

  const brokerUrl = `${protocol}://${host}:${port}`;
  console.log(`[MQTT] Connecting to broker at ${protocol}://${host}:${port}...`);

  const options = {
    clientId: `parkbnb-backend-${Math.random().toString(16).substring(2, 8)}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    rejectUnauthorized: false, // Allows self-signed/testing certs
  };

  if (username) options.username = username;
  if (password) options.password = password;

  try {
    client = mqtt.connect(brokerUrl, options);

    client.on('connect', () => {
      isConnected = true;
      console.log('[MQTT] Connected successfully to broker');

      // Wildcard subscribe to all parkbnb device state, events, and online LWT
      client.subscribe(['parkbnb/+/state', 'parkbnb/+/online', 'parkbnb/+/evt'], (err) => {
        if (err) {
          console.error('[MQTT] Subscription error:', err.message);
        } else {
          console.log('[MQTT] Subscribed to parkbnb/+/state, parkbnb/+/online, parkbnb/+/evt');
        }
      });
    });

    client.on('message', async (topic, message) => {
      try {
        await handleIncomingMessage(topic, message.toString());
      } catch (err) {
        console.error('[MQTT] Error processing message:', err.message);
      }
    });

    client.on('error', (err) => {
      console.warn('[MQTT] Client error (non-fatal):', err.message);
    });

    client.on('close', () => {
      if (isConnected) {
        console.log('[MQTT] Connection closed, will retry automatically');
      }
      isConnected = false;
    });

    client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting to broker...');
    });
  } catch (err) {
    console.error('[MQTT] Failed to initialize MQTT client:', err.message);
  }

  return client;
}

/**
 * Handle incoming MQTT telemetry, events, and online status
 */
async function handleIncomingMessage(topic, payloadStr) {
  const parts = topic.split('/');
  if (parts.length < 3 || parts[0] !== 'parkbnb') return;

  const deviceId = parts[1];
  const subTopic = parts[2];

  let payload = {};
  try {
    payload = JSON.parse(payloadStr);
  } catch (e) {
    console.warn(`[MQTT] Invalid JSON on ${topic}:`, payloadStr);
    return;
  }

  if (subTopic === 'online') {
    const isOnline = !!payload.online;
    await Device.findOneAndUpdate(
      { device_id: deviceId },
      {
        status: isOnline ? 'online' : 'offline',
        last_seen_at: new Date(),
      }
    );
    console.log(`[MQTT] Device ${deviceId} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  } else if (subTopic === 'state') {
    // Payload: { state, angle, target, moving, pwm, rssi, uptime, fw }
    await Device.findOneAndUpdate(
      { device_id: deviceId },
      {
        status: 'online',
        last_seen_at: new Date(),
        'last_state.state': payload.state || 'unknown',
        'last_state.angle': typeof payload.angle === 'number' ? payload.angle : 0,
        'last_state.target': typeof payload.target === 'number' ? payload.target : 0,
        'last_state.moving': !!payload.moving,
        'last_state.pwm': payload.pwm || 0,
        'last_state.rssi': payload.rssi || 0,
        'last_state.fw_version': payload.fw || '1.0.0',
        'last_state.updated_at': new Date(),
      }
    );
  } else if (subTopic === 'evt') {
    // Payload: { evt, detail, ts }
    console.log(`[MQTT] Event from ${deviceId}:`, payload);
    const isFault = payload.evt === 'fault';

    await Device.findOneAndUpdate(
      { device_id: deviceId },
      {
        status: isFault ? 'error' : 'online',
        last_seen_at: new Date(),
        'last_state.fault_reason': isFault ? (payload.detail || 'unknown fault') : null,
      }
    );

    // Audit log fault event
    await AccessAuditLog.create({
      device_id: deviceId,
      user_id: '000000000000000000000000', // System
      user_role: 'system',
      action: isFault ? 'fault' : 'rejected',
      success: !isFault,
      error_message: payload.detail || payload.evt,
    }).catch(() => {});
  }
}

/**
 * Send command to an IoT device
 * @param {string} deviceId - Target hardware ID (e.g. 'pb-001')
 * @param {'open'|'close'|'stop'|'cal'|'status'|'clear'} command - Command name
 * @param {object} params - Optional command params (e.g. { angle: 45 })
 * @param {object} context - { userId, userRole, bookingId, ipAddress }
 */
async function sendDeviceCommand(deviceId, command, params = {}, context = {}) {
  const device = await Device.findOne({ device_id: deviceId });
  if (!device) {
    throw new Error(`Device '${deviceId}' not found`);
  }

  // Atomically increment the monotonic command counter `n` (replay guard)
  const updatedDevice = await Device.findOneAndUpdate(
    { device_id: deviceId },
    { $inc: { command_counter: 1 } },
    { new: true }
  );

  const commandN = updatedDevice.command_counter;
  const token = device.secret_token || 'change-me-to-a-long-random-string';

  const payload = {
    cmd: command,
    token: token,
    n: commandN,
    ...params,
  };

  const topic = `parkbnb/${deviceId}/cmd`;

  // The physical arch-lock prototype polls Firebase, not MQTT. Mirror every
  // open/close there so the real barrier and the simulator both react.
  // Fire it first and in parallel — the device polls every 2s, so the sooner
  // the node is written the sooner it moves.
  const firebaseResult = (command === 'open' || command === 'close')
    ? firebaseBarrier.sendCommand(deviceId, command)
    : Promise.resolve({ sent: false, skipped: 'not an open/close command' });

  return new Promise((resolve, reject) => {
    if (!client || !isConnected) {
      // Firebase may still have carried the command through, so this is only
      // a hard failure when nothing at all was delivered.
      firebaseResult.then(async (fb) => {
        await AccessAuditLog.create({
          device_id: deviceId,
          parking_space_id: device.parking_space_id,
          booking_id: context.bookingId || null,
          user_id: context.userId,
          user_role: context.userRole || 'renter',
          action: command === 'open' ? 'unlock' : command === 'close' ? 'lock' : command,
          command_n: commandN,
          success: Boolean(fb.sent),
          error_message: fb.sent
            ? 'MQTT broker unavailable; delivered over Firebase'
            : `MQTT broker not connected; Firebase: ${fb.error || fb.skipped}`,
          ip_address: context.ipAddress || null,
        }).catch(() => {});

        if (fb.sent) {
          console.log(`[MQTT] broker down — ${command} delivered via Firebase to ${deviceId}`);
          return resolve({
            success: true,
            deviceId,
            command,
            n: commandN,
            transport: 'firebase',
            firebase: fb,
            timestamp: new Date(),
          });
        }

        return reject(new Error(
          'Neither transport reached the barrier: MQTT broker not connected'
          + (fb.error ? `, Firebase: ${fb.error}` : ''),
        ));
      }).catch(reject);

      return;
    }

    client.publish(topic, JSON.stringify(payload), { qos: 1 }, async (err) => {
      const fb = await firebaseResult.catch((e) => ({ sent: false, error: e.message }));
      const isSuccess = !err || Boolean(fb.sent);

      // Create Audit Log entry
      await AccessAuditLog.create({
        device_id: deviceId,
        parking_space_id: device.parking_space_id,
        booking_id: context.bookingId || null,
        user_id: context.userId,
        user_role: context.userRole || 'renter',
        action: command === 'open' ? 'unlock' : command === 'close' ? 'lock' : command,
        command_n: commandN,
        success: isSuccess,
        error_message: err ? err.message : null,
        ip_address: context.ipAddress || null,
      }).catch(() => {});

      if (err && !fb.sent) {
        console.error(`[MQTT] Failed to publish to ${topic}:`, err.message);
        return reject(err);
      }

      if (!err) console.log(`[MQTT] Published ${command} (n=${commandN}) to ${topic}`);

      resolve({
        success: true,
        deviceId,
        command,
        n: commandN,
        transport: err ? 'firebase' : (fb.sent ? 'mqtt+firebase' : 'mqtt'),
        firebase: fb,
        timestamp: new Date(),
      });
    });
  });
}

function getClient() {
  return client;
}

function isBrokerConnected() {
  return isConnected;
}

module.exports = {
  initMqtt,
  sendDeviceCommand,
  getClient,
  isBrokerConnected,
};
