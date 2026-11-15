#pragma once
// ============================================================
//  Parkbnb ESP32 — configuration
//  Copy your own values here. Do NOT commit real secrets.
// ============================================================

// ---------- Identity ----------
#define DEVICE_ID       "pb-001"          // unique per unit
#define FW_VERSION      "1.0.0"

// ---------- WiFi ----------
#define WIFI_SSID       "YOUR_WIFI"
#define WIFI_PASS       "YOUR_WIFI_PASSWORD"

// ---------- MQTT broker (HiveMQ Cloud free tier) ----------
#define MQTT_HOST       "xxxxxxxx.s1.eu.hivemq.cloud"
#define MQTT_PORT       8883              // TLS
#define MQTT_USER       "parkbnb-device"
#define MQTT_PASS       "YOUR_BROKER_PASSWORD"

// ---------- Command authentication ----------
// Shared secret that every command must carry. Prototype-grade:
// see README "Security roadmap" before shipping to real users.
#define CMD_TOKEN       "change-me-to-a-long-random-string"

// ---------- Motor driver pins ----------
// Works with DRV8871 / L298N (EN tied high) / BTS7960 (RPWM+LPWM).
// Forward = PWM on IN1, IN2 low.  Reverse = the opposite.
#define PIN_MOTOR_IN1   25
#define PIN_MOTOR_IN2   26

// ---------- Optional hardware (-1 = not fitted) ----------
#define PIN_LIMIT_DOWN  -1                // limit switch at 0 deg
#define PIN_LIMIT_UP    -1                // limit switch at 90 deg
#define PIN_LED         2
#define PIN_BUZZER      -1
#define PIN_CURRENT     -1                // analog pin of ACS712/INA-style sense

// ---------- IMU (MPU6050 over I2C) ----------
#define PIN_SDA         21
#define PIN_SCL         22
#define MPU_ADDR        0x68

// Mounting correction. Use the "cal" command to set ANGLE_OFFSET at runtime;
// flip ANGLE_SIGN if the angle counts the wrong way.
#define ANGLE_SIGN      1.0f
#define ANGLE_OFFSET    0.0f

// ---------- Motion tuning ----------
#define ANGLE_TOL        3.0f     // deg — close enough to the target
#define PWM_MIN          90       // just enough to overcome static friction
#define PWM_MAX          230      // top speed
#define APPROACH_BAND    35.0f    // deg — start slowing down inside this band
#define RAMP_STEP        6        // PWM change allowed per control tick (soft start)
#define MOVE_TIMEOUT_MS  8000     // hard stop if the move takes longer than this
#define STALL_WINDOW_MS  700      // no angle change in this window = obstruction
#define STALL_MIN_DEG    1.0f
#define CONTROL_TICK_MS  20

// ---------- Named positions ----------
#define ANGLE_OPEN       0.0f     // barrier flat  (car can pass)
#define ANGLE_SECURE     90.0f    // barrier up    (space locked)

// ---------- Over-The-Air (OTA) Updates ----------
#define OTA_ENABLED      true
#define OTA_PORT         3232
#define OTA_PASS         "parkbnb-ota-2026"

