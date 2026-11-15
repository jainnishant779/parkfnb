# Parkbnb — ESP32 ↔ Cloud ↔ App

Working cloud link for the motorised prototype (30 RPM motor + driver + MPU6050 + ESP32).

```
 App / browser ──wss:8884──┐                    ┌──tls:8883── ESP32
                           ├──  MQTT broker  ───┤
 Backend (later) ──────────┘   (HiveMQ Cloud)   └── publishes state
```

The broker is the meeting point. Nothing needs a public IP, nothing needs port forwarding,
and the device works from behind any home router.

---

## 1. Broker setup (10 minutes, free)

1. Sign up at **console.hivemq.cloud** → create a free serverless cluster (100 devices free).
2. Copy the cluster hostname, e.g. `abc123def.s1.eu.hivemq.cloud`.
3. Under **Access Management**, create **two** credentials:
   - `parkbnb-device` — for the ESP32
   - `parkbnb-app` — for the app / browser
4. Free tier already gives TLS on **8883** (device) and secure WebSocket on **8884** (browser).

> Alternative if you prefer self-hosting: Mosquitto on a ₹400–800/month VPS. Same topics,
> same code — only the host and certificates change.

## 2. Flash the firmware

Arduino IDE → Boards Manager → **esp32** by Espressif.
Library Manager → **PubSubClient** and **ArduinoJson (v6)**.

Edit `parkbnb_esp32/config.h`:

| Field | What to put |
|---|---|
| `WIFI_SSID` / `WIFI_PASS` | your WiFi |
| `MQTT_HOST` | cluster hostname from step 1 |
| `MQTT_USER` / `MQTT_PASS` | the `parkbnb-device` credentials |
| `CMD_TOKEN` | a long random string — the app must send the same one |
| `PIN_MOTOR_IN1/IN2` | your driver inputs (DRV8871 / L298N / BTS7960 all work) |
| `DEVICE_ID` | unique per unit, e.g. `pb-001` |

Flash, then open Serial Monitor at **115200** — you should see the IP address.

## 3. Control it

Open `test_controller.html` in Chrome (just double-click the file). Fill in the host,
the `parkbnb-app` credentials, the device ID and the same `CMD_TOKEN`, press **Connect**.

You get live angle, state, PWM, fault and RSSI, plus Open / Secure / Stop buttons.
This page is the reference implementation for the mobile app — the app does exactly
these publishes and subscribes.

**First run:** put the barrier flat, press **Set zero**. That calibrates the IMU mounting
offset and stores it in flash. If the angle counts the wrong way, flip `ANGLE_SIGN` in
`config.h` and re-flash.

---

## 4. Topic contract (this is what the app codes against)

| Topic | Direction | Retained | Payload |
|---|---|---|---|
| `parkbnb/<id>/cmd` | app → device | no | `{"cmd":"open","token":"...","n":1234}` |
| `parkbnb/<id>/state` | device → app | **yes** | `{"state":"secure","angle":89.4,"target":90,"moving":false,"pwm":0,"rssi":-58,"uptime":812,"fw":"1.0.0"}` |
| `parkbnb/<id>/evt` | device → app | no | `{"evt":"fault","detail":"obstruction","ts":812}` |
| `parkbnb/<id>/online` | device → app | **yes** | `{"online":true}` — set to `false` automatically by the broker if the device dies |

**Commands:** `open` · `close` · `goto` (+`angle`) · `stop` · `status` · `clear` · `cal`

Every command needs `token` and `n`. `n` must be **strictly greater** than the last one the
device accepted — this is the replay guard, and it survives reboot (stored in NVS). The
browser client uses a timestamp-derived counter, so it never goes backwards.

`state` is retained, so an app that opens fresh immediately sees the current position
without waiting for the next heartbeat (device republishes every 10 s anyway).

---

## 5. What the firmware does beyond connectivity

- **Soft start / soft stop.** Your 30 RPM motor covers 90° in 0.5 s at full power — too
  fast and it hammers the end stops. `RAMP_STEP` limits PWM change per 20 ms tick and speed
  tapers inside `APPROACH_BAND`, giving a controlled 2–3 s move. Tune those two numbers.
- **Obstruction detection.** If the angle stops changing for `STALL_WINDOW_MS` while the
  motor is driving, it cuts power and reports `fault: obstruction`. Add a current sensor on
  `PIN_CURRENT` later for a faster, more reliable trip.
- **Move timeout** — hard cutoff at 8 s so a slipping coupling cannot cook the motor.
- **Absolute angle from gravity.** The accelerometer is read directly over I²C (no library).
  A gyro integrated alone would drift; gravity does not. Angle is smoothed with an EMA.
- **Limit switches optional.** Set `PIN_LIMIT_UP` / `PIN_LIMIT_DOWN` and they take priority
  over the IMU. For production these (₹20) are more robust than the IMU for position — keep
  the IMU for tamper/impact detection instead.

---

## 6. How the mobile app plugs in

Two honest options:

**A. App talks to the broker directly** (fastest to build, what `test_controller.html` does).
Fine for your own testing and a single-owner product. Flutter → `mqtt_client`,
React Native → `mqtt` over WebSocket.

**B. App talks to your backend, backend talks to the broker** (what the marketplace needs).
The app never holds the device token. Your server checks the booking is paid and current,
then publishes the command. This is the only version that can safely let a *stranger* open
someone's barrier, so plan for it before the pilot.

```
Phone ──HTTPS──> Parkbnb backend ──MQTT──> broker ──> ESP32
                  (booking, payment, access rules, audit log)
```

---

## 7. Security roadmap — before this touches a real user

The current build is **prototype-grade** and deliberately marked as such:

| Now | Before shipping |
|---|---|
| `netClient.setInsecure()` — TLS without certificate check | Pin the broker root CA (`setCACert`) |
| One shared `CMD_TOKEN` in firmware | Per-device credentials + server-signed, time-limited tokens (Ed25519/HMAC) |
| App may hold the token | Only the backend can command; app holds a booking token |
| Plain firmware | ESP32 **Secure Boot + Flash Encryption** so a stolen unit cannot be dumped |
| — | Signed OTA updates |

A parking lock is a security product; a shared secret compiled into every unit means one
extracted unit unlocks the whole fleet. Fix that before the pilot, not after.

---

## 8. The battery caveat (unchanged)

Always-connected WiFi averages ~15 mA → an 18650 lasts **about a week**. That is fine on
bench power for development. For the battery product the plan stays: **BLE for the unlock
(instant, the driver is standing right there) + WiFi bursts for sync**, or mains/solar for
an always-online unit. Build the cloud stack now; add the BLE fast path before field units.
