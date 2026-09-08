// ============================================================
//  Parkbnb Smart Parking Lock - ESP32 cloud firmware
//
//  WiFi -> TLS -> MQTT. Subscribes to a command topic, drives the
//  barrier motor to a target angle with soft start/stop and stall
//  detection, and publishes state back to the cloud.
//
//  Libraries (Arduino Library Manager):
//    PubSubClient  by Nick OLeary
//    ArduinoJson   by Benoit Blanchon (v6)
// ============================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <Wire.h>
#include <math.h>

#include "config.h"

// ---------- MQTT topics ----------
static const String T_BASE   = String("parkbnb/") + DEVICE_ID;
static const String T_CMD    = T_BASE + "/cmd";     // cloud -> device
static const String T_STATE  = T_BASE + "/state";   // device -> cloud (retained)
static const String T_EVT    = T_BASE + "/evt";     // device -> cloud (log)
static const String T_ONLINE = T_BASE + "/online";  // retained + last will

WiFiClientSecure netClient;
PubSubClient     mqtt(netClient);
Preferences      prefs;

// ---------- Motion state ----------
enum MotionState { ST_IDLE, ST_MOVING, ST_FAULT };
MotionState state       = ST_IDLE;
float    angle          = 0.0f;      // smoothed, degrees
float    angleOffset    = ANGLE_OFFSET;
float    targetAngle    = ANGLE_SECURE;
int      pwmNow         = 0;         // applied PWM, signed = direction
String   faultReason    = "";
uint32_t moveStartMs    = 0;
uint32_t stallMarkMs    = 0;
float    stallMarkAngle = 0.0f;
uint32_t lastTickMs     = 0;
uint32_t lastStateMs    = 0;
uint32_t lastCmdCounter = 0;         // replay guard, persisted in NVS

// LEDC PWM channels
static const int CH_IN1 = 0;
static const int CH_IN2 = 1;

// ============================================================
//  IMU - MPU6050 raw accelerometer read (no external library)
// ============================================================
bool mpuBegin() {
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);            // PWR_MGMT_1
  Wire.write(0x00);            // wake up
  if (Wire.endTransmission() != 0) return false;
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1C);            // ACCEL_CONFIG
  Wire.write(0x00);            // +/- 2g
  return Wire.endTransmission() == 0;
}

// Returns tilt in degrees from the gravity vector.
// NOTE: which axes to use depends on how the IMU is mounted.
// If the angle counts the wrong way, flip ANGLE_SIGN in config.h.
bool mpuReadAngle(float &deg) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);                       // ACCEL_XOUT_H
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, 6) != 6) return false;

  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();

  // Gravity is an ABSOLUTE reference, so there is no drift here.
  // A gyro integrated on its own would drift - that is why we use accel.
  deg = atan2f((float)ax, sqrtf((float)ay * ay + (float)az * az)) * 57.2957795f;
  return true;
}

void updateAngle() {
  float raw;
  if (!mpuReadAngle(raw)) return;
  float corrected = ANGLE_SIGN * raw - angleOffset;
  // exponential smoothing - the barrier is slow, the IMU is noisy
  angle = (angle * 0.80f) + (corrected * 0.20f);
}

// ============================================================
//  Motor
// ============================================================
void motorSetup() {
  ledcSetup(CH_IN1, 20000, 8);   // 20 kHz, above hearing
  ledcSetup(CH_IN2, 20000, 8);
  ledcAttachPin(PIN_MOTOR_IN1, CH_IN1);
  ledcAttachPin(PIN_MOTOR_IN2, CH_IN2);
  ledcWrite(CH_IN1, 0);
  ledcWrite(CH_IN2, 0);
}

// signed: >0 drives toward larger angle, <0 toward smaller, 0 = coast
void motorWrite(int signedPwm) {
  signedPwm = constrain(signedPwm, -255, 255);
  if (signedPwm > 0)      { ledcWrite(CH_IN1, signedPwm);  ledcWrite(CH_IN2, 0); }
  else if (signedPwm < 0) { ledcWrite(CH_IN1, 0);          ledcWrite(CH_IN2, -signedPwm); }
  else                    { ledcWrite(CH_IN1, 0);          ledcWrite(CH_IN2, 0); }
  pwmNow = signedPwm;
}

void motorStop() { motorWrite(0); }

bool limitReached(float target) {
  if (target <= ANGLE_OPEN + 1.0f && PIN_LIMIT_DOWN >= 0)
    return digitalRead(PIN_LIMIT_DOWN) == LOW;
  if (target >= ANGLE_SECURE - 1.0f && PIN_LIMIT_UP >= 0)
    return digitalRead(PIN_LIMIT_UP) == LOW;
  return false;
}

// ============================================================
//  Publishing
// ============================================================
const char* stateName() {
  if (state == ST_FAULT)  return "fault";
  if (state == ST_MOVING) return "moving";
  if (fabsf(angle - ANGLE_SECURE) < ANGLE_TOL * 2) return "secure";
  if (fabsf(angle - ANGLE_OPEN)   < ANGLE_TOL * 2) return "open";
  return "between";
}

void publishState(bool retained = true) {
  StaticJsonDocument<320> d;
  d["device"] = DEVICE_ID;
  d["state"]  = stateName();
  d["angle"]  = roundf(angle * 10) / 10.0f;
  d["target"] = targetAngle;
  d["moving"] = (state == ST_MOVING);
  d["pwm"]    = pwmNow;
  if (faultReason.length()) d["fault"] = faultReason;
  d["rssi"]   = WiFi.RSSI();
  d["uptime"] = (uint32_t)(millis() / 1000);
  d["fw"]     = FW_VERSION;

  char buf[320];
  size_t n = serializeJson(d, buf);
  mqtt.publish(T_STATE.c_str(), (uint8_t*)buf, n, retained);
  lastStateMs = millis();
}

void publishEvent(const char* type, const char* detail) {
  StaticJsonDocument<200> d;
  d["device"] = DEVICE_ID;
  d["evt"]    = type;
  if (detail) d["detail"] = detail;
  d["ts"]     = (uint32_t)(millis() / 1000);
  char buf[200];
  size_t n = serializeJson(d, buf);
  mqtt.publish(T_EVT.c_str(), (uint8_t*)buf, n, false);
}

// ============================================================
//  Motion control - soft start, soft stop, stall detection
// ============================================================
void startMove(float target) {
  targetAngle    = constrain(target, ANGLE_OPEN, ANGLE_SECURE);
  faultReason    = "";
  state          = ST_MOVING;
  moveStartMs    = millis();
  stallMarkMs    = millis();
  stallMarkAngle = angle;
  if (PIN_BUZZER >= 0) tone(PIN_BUZZER, 2000, 150);   // pre-motion warning
  publishEvent("move_start", nullptr);
}

void enterFault(const char* why) {
  motorStop();
  state = ST_FAULT;
  faultReason = why;
  publishEvent("fault", why);
  publishState();
}

void controlTick() {
  if (state != ST_MOVING) { if (pwmNow != 0) motorStop(); return; }

  float error = targetAngle - angle;

  // ---- arrived ----
  if (fabsf(error) <= ANGLE_TOL || limitReached(targetAngle)) {
    motorStop();
    state = ST_IDLE;
    publishEvent("move_done", nullptr);
    publishState();
    return;
  }

  // ---- timeout ----
  if (millis() - moveStartMs > MOVE_TIMEOUT_MS) { enterFault("timeout"); return; }

  // ---- stall / obstruction ----
  if (millis() - stallMarkMs > STALL_WINDOW_MS) {
    if (fabsf(angle - stallMarkAngle) < STALL_MIN_DEG) { enterFault("obstruction"); return; }
    stallMarkMs    = millis();
    stallMarkAngle = angle;
  }

  // ---- speed profile: full speed far away, taper inside APPROACH_BAND ----
  float frac   = fminf(1.0f, fabsf(error) / APPROACH_BAND);
  int   wanted = PWM_MIN + (int)((PWM_MAX - PWM_MIN) * frac);
  if (error < 0) wanted = -wanted;

  // ---- ramp limiter: this is what turns a 0.5 s slam into a soft move ----
  int delta = wanted - pwmNow;
  if (delta >  RAMP_STEP) delta =  RAMP_STEP;
  if (delta < -RAMP_STEP) delta = -RAMP_STEP;
  motorWrite(pwmNow + delta);
}

// ============================================================
//  Command handling
// ============================================================
void onCommand(char* topic, byte* payload, unsigned int len) {
  StaticJsonDocument<320> d;
  if (deserializeJson(d, payload, len)) { publishEvent("rejected", "bad_json"); return; }

  // --- auth: shared token ---
  const char* tok = d["token"] | "";
  if (strcmp(tok, CMD_TOKEN) != 0) { publishEvent("rejected", "bad_token"); return; }

  // --- replay guard: counter must strictly increase ---
  uint32_t n = d["n"] | 0;
  if (n <= lastCmdCounter) { publishEvent("rejected", "replay"); return; }
  lastCmdCounter = n;
  prefs.putUInt("cmdn", lastCmdCounter);

  const char* cmd = d["cmd"] | "";

  if      (!strcmp(cmd, "open"))   startMove(ANGLE_OPEN);
  else if (!strcmp(cmd, "close"))  startMove(ANGLE_SECURE);
  else if (!strcmp(cmd, "goto"))   startMove(d["angle"] | ANGLE_SECURE);
  else if (!strcmp(cmd, "stop"))   { motorStop(); state = ST_IDLE; publishState(); }
  else if (!strcmp(cmd, "status")) publishState();
  else if (!strcmp(cmd, "clear"))  { faultReason = ""; state = ST_IDLE; publishState(); }
  else if (!strcmp(cmd, "cal")) {
    // Put the barrier where you want "0" to be, then send cal.
    float raw;
    if (mpuReadAngle(raw)) { angleOffset = ANGLE_SIGN * raw; angle = 0; }
    prefs.putFloat("aoff", angleOffset);
    publishEvent("calibrated", nullptr);
    publishState();
  }
  else publishEvent("rejected", "unknown_cmd");
}

// ============================================================
//  Connectivity
// ============================================================
void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    delay(250);
    if (PIN_LED >= 0) digitalWrite(PIN_LED, !digitalRead(PIN_LED));
  }
  if (PIN_LED >= 0) digitalWrite(PIN_LED, WiFi.status() == WL_CONNECTED);
}

void ensureMqtt() {
  if (mqtt.connected()) return;
  static uint32_t nextTry = 0;
  if (millis() < nextTry) return;

  // Last will: the broker publishes this if we drop off without saying goodbye.
  String will = String("{\"device\":\"") + DEVICE_ID + "\",\"online\":false}";

  if (mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASS,
                   T_ONLINE.c_str(), 1, true, will.c_str())) {
    String hello = String("{\"device\":\"") + DEVICE_ID +
                   "\",\"online\":true,\"fw\":\"" + FW_VERSION + "\"}";
    mqtt.publish(T_ONLINE.c_str(), hello.c_str(), true);
    mqtt.subscribe(T_CMD.c_str(), 1);
    publishState();
  } else {
    nextTry = millis() + 3000;   // backoff
  }
}

// ============================================================
void setup() {
  Serial.begin(115200);
  if (PIN_LED >= 0)        pinMode(PIN_LED, OUTPUT);
  if (PIN_BUZZER >= 0)     pinMode(PIN_BUZZER, OUTPUT);
  if (PIN_LIMIT_DOWN >= 0) pinMode(PIN_LIMIT_DOWN, INPUT_PULLUP);
  if (PIN_LIMIT_UP   >= 0) pinMode(PIN_LIMIT_UP,   INPUT_PULLUP);

  motorSetup();

  prefs.begin("parkbnb", false);
  lastCmdCounter = prefs.getUInt("cmdn", 0);
  angleOffset    = prefs.getFloat("aoff", ANGLE_OFFSET);

  if (!mpuBegin()) Serial.println("[WARN] MPU6050 not responding - check wiring");
  for (int i = 0; i < 40; i++) { updateAngle(); delay(10); }   // settle the filter

  // TLS. setInsecure() skips certificate validation - fine on the bench,
  // NOT acceptable in the field. See README "Security roadmap".
  netClient.setInsecure();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onCommand);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);

  ensureWifi();
  Serial.printf("Parkbnb %s fw %s  ip=%s\n", DEVICE_ID, FW_VERSION,
                WiFi.localIP().toString().c_str());
}

void loop() {
  ensureWifi();
  ensureMqtt();
  mqtt.loop();

  if (millis() - lastTickMs >= CONTROL_TICK_MS) {
    lastTickMs = millis();
    updateAngle();
    controlTick();
  }

  // heartbeat so the app can tell a live device from a stale retained message
  if (millis() - lastStateMs > 10000) publishState();
}
