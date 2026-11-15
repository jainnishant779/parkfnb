#!/usr/bin/env node
/**
 * ParkBNB ESP32 Virtual Device Simulator
 *
 * Emulates the exact firmware behavior of `firmware/parkbnb_esp32/`
 * Connects to the MQTT broker, responds to commands, and publishes live telemetry.
 *
 * Usage:
 *   node scripts/simulate-device.js [--device pb-001] [--broker broker.hivemq.com]
 */

let mqtt;
try {
  mqtt = require('mqtt');
} catch (e) {
  try {
    mqtt = require('../services/backend/node_modules/mqtt');
  } catch (e2) {
    console.error('MQTT package not found. Run `npm install mqtt` or install in services/backend');
    process.exit(1);
  }
}

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const DEVICE_ID = getArg('device', 'pb-001');
const BROKER_HOST = getArg('broker', process.env.MQTT_HOST || 'broker.hivemq.com');
const BROKER_PORT = parseInt(getArg('port', process.env.MQTT_PORT || '1883'), 10);
const CMD_TOKEN = getArg('token', 'change-me-to-a-long-random-string');

console.log(`
======================================================
  PARKBNB ESP32 VIRTUAL DEVICE SIMULATOR
  Device ID:  ${DEVICE_ID}
  Broker:     ${BROKER_HOST}:${BROKER_PORT}
  Auth Token: ${CMD_TOKEN}
======================================================
`);

const TOPIC_CMD = `parkbnb/${DEVICE_ID}/cmd`;
const TOPIC_STATE = `parkbnb/${DEVICE_ID}/state`;
const TOPIC_EVT = `parkbnb/${DEVICE_ID}/evt`;
const TOPIC_ONLINE = `parkbnb/${DEVICE_ID}/online`;

// Simulated device hardware state
let currentState = 'secure'; // 'secure' (up/locked) or 'open' (down/flat)
let currentAngle = 90.0;
let isMoving = false;
let lastCounter = 0;
let batteryLevel = 98;
let uptimeSeconds = 0;

const client = mqtt.connect(`mqtt://${BROKER_HOST}:${BROKER_PORT}`, {
  clientId: `sim-${DEVICE_ID}-${Math.random().toString(16).substring(2, 6)}`,
  clean: true,
  will: {
    topic: TOPIC_ONLINE,
    payload: JSON.stringify({ online: false }),
    qos: 1,
    retain: true,
  },
});

client.on('connect', () => {
  console.log(`[SIM] Connected to MQTT broker. Online status published.`);

  // 1. Announce Online
  client.publish(TOPIC_ONLINE, JSON.stringify({ online: true }), { qos: 1, retain: true });

  // 2. Publish initial state
  publishState();

  // 3. Subscribe to commands
  client.subscribe(TOPIC_CMD, (err) => {
    if (err) console.error(`[SIM] Failed to subscribe to ${TOPIC_CMD}:`, err.message);
    else console.log(`[SIM] Listening for commands on: ${TOPIC_CMD}\n`);
  });
});

client.on('message', (topic, message) => {
  if (topic !== TOPIC_CMD) return;

  try {
    const payload = JSON.parse(message.toString());
    handleCommand(payload);
  } catch (err) {
    console.error(`[SIM] Invalid JSON received:`, message.toString());
  }
});

function handleCommand(d) {
  console.log(`\n[SIM] >>> RECEIVED COMMAND:`, JSON.stringify(d));

  // 1. Token validation
  if (d.token !== CMD_TOKEN) {
    console.warn(`[SIM] REJECTED: Bad token (received '${d.token}')`);
    client.publish(TOPIC_EVT, JSON.stringify({ evt: 'rejected', detail: 'bad_token' }));
    return;
  }

  // 2. Replay guard
  const n = parseInt(d.n, 10) || 0;
  if (n <= lastCounter) {
    console.warn(`[SIM] REJECTED: Replay attack (n=${n} <= last=${lastCounter})`);
    client.publish(TOPIC_EVT, JSON.stringify({ evt: 'rejected', detail: 'replay' }));
    return;
  }
  lastCounter = n;

  const cmd = d.cmd;
  switch (cmd) {
    case 'open':
      console.log(`[SIM] Opening barrier (90° -> 0°)...`);
      animateBarrier(0.0, 'open');
      break;

    case 'close':
      console.log(`[SIM] Closing barrier (0° -> 90°)...`);
      animateBarrier(90.0, 'secure');
      break;

    case 'stop':
      console.log(`[SIM] Emergency stop triggered!`);
      isMoving = false;
      publishState();
      break;

    case 'status':
      publishState();
      break;

    case 'cal':
      console.log(`[SIM] Calibrated zero offset.`);
      client.publish(TOPIC_EVT, JSON.stringify({ evt: 'calibrated' }));
      publishState();
      break;

    default:
      console.warn(`[SIM] Unknown command: ${cmd}`);
      client.publish(TOPIC_EVT, JSON.stringify({ evt: 'rejected', detail: 'unknown_cmd' }));
  }
}

function animateBarrier(targetAngle, finalState) {
  if (isMoving) return;
  isMoving = true;

  const stepDeg = targetAngle > currentAngle ? 15 : -15;
  const interval = setInterval(() => {
    currentAngle += stepDeg;
    if ((stepDeg > 0 && currentAngle >= targetAngle) || (stepDeg < 0 && currentAngle <= targetAngle)) {
      currentAngle = targetAngle;
      currentState = finalState;
      isMoving = false;
      clearInterval(interval);
      console.log(`[SIM] Move complete! State: ${currentState} (${currentAngle.toFixed(1)}°)`);
      client.publish(TOPIC_EVT, JSON.stringify({ evt: 'move_done', state: currentState }));
      publishState();
    } else {
      currentState = 'moving';
      console.log(`[SIM] Barrier rotating: ${currentAngle.toFixed(1)}°`);
      publishState();
    }
  }, 300);
}

function publishState() {
  const telemetry = {
    state: currentState,
    angle: parseFloat(currentAngle.toFixed(1)),
    target: currentState === 'open' ? 0.0 : 90.0,
    moving: isMoving,
    pwm: isMoving ? 180 : 0,
    rssi: -56 + Math.floor(Math.random() * 5),
    uptime: uptimeSeconds,
    fw: '1.0.0',
    battery: batteryLevel,
  };

  client.publish(TOPIC_STATE, JSON.stringify(telemetry), { qos: 1, retain: true });
}

// Heartbeat every 10 seconds (matches firmware loop)
setInterval(() => {
  uptimeSeconds += 10;
  if (client.connected) {
    publishState();
  }
}, 10000);

// Graceful exit
process.on('SIGINT', () => {
  console.log('\n[SIM] Shutting down simulator...');
  if (client.connected) {
    client.publish(TOPIC_ONLINE, JSON.stringify({ online: false }), { qos: 1, retain: true }, () => {
      client.end();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
