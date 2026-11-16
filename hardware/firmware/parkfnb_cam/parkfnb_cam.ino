/*
  ParkFNB camera node — AI-Thinker ESP32-CAM.

  Takes one JPEG every INTERVAL_MS and posts it to the ANPR server:

      POST http://<SERVER_HOST>:<SERVER_PORT>/live/frame-raw?camera_id=<CAMERA_ID>
      Content-Type: image/jpeg          X-Camera-Key: <CAMERA_KEY>          body = the JPEG

  The board only captures and uploads.  Detection, plate reading and counting happen on the
  server.  See README.md for wiring, flashing, mounting and heat.

  Arduino IDE: board "AI Thinker ESP32-CAM" (esp32 core 3.x), PSRAM enabled,
  partition scheme "Huge APP" or the default.
*/

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include "esp_camera.h"
#include "config.h"
#include "root_ca.h"
#if DISABLE_BROWNOUT
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#endif

// ---- AI-Thinker ESP32-CAM pin map -------------------------------------------------------------
#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22
#define FLASH_LED_GPIO   4     // the bright white LED: kept off, it is a heat and glare source
#define STATUS_LED_GPIO 33     // small red LED, active LOW

static String uploadUrl;
static unsigned long lastSuccessMs = 0;
static unsigned long lastCaptureMs = 0;
static bool paused = false;
static uint32_t sent = 0, failed = 0;

static void statusLed(bool on) { digitalWrite(STATUS_LED_GPIO, on ? LOW : HIGH); }

static void blink(int times, int ms) {
  for (int i = 0; i < times; i++) { statusLed(true); delay(ms); statusLed(false); delay(ms); }
}

// ---- camera ------------------------------------------------------------------------------------
static bool initCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM;  c.pin_d1 = Y3_GPIO_NUM;  c.pin_d2 = Y4_GPIO_NUM;  c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM;  c.pin_d5 = Y7_GPIO_NUM;  c.pin_d6 = Y8_GPIO_NUM;  c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM;
  c.pin_pclk = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM;
  c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM;
  c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM;
  c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = XCLK_MHZ * 1000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAME_SIZE;
  c.jpeg_quality = JPEG_QUALITY;
  if (psramFound()) {
    c.fb_count = 2;                      // two buffers + GRAB_LATEST: always the freshest picture
    c.fb_location = CAMERA_FB_IN_PSRAM;
    c.grab_mode = CAMERA_GRAB_LATEST;
  } else {
    c.fb_count = 1;                      // without PSRAM, fall back to a small picture
    c.fb_location = CAMERA_FB_IN_DRAM;
    c.frame_size = FRAMESIZE_VGA;
    c.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  }

  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    Serial.printf("camera init failed: 0x%x\n", err);
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();
  s->set_vflip(s, CAM_VFLIP);
  s->set_hmirror(s, CAM_HMIRROR);
  s->set_whitebal(s, 1);
  s->set_awb_gain(s, 1);
  s->set_exposure_ctrl(s, 1);
  s->set_aec2(s, 1);                     // better exposure algorithm
  s->set_ae_level(s, AE_LEVEL);
  s->set_gain_ctrl(s, 1);
  s->set_gainceiling(s, GAINCEILING_4X); // limit gain: less noise, less smear at dusk
  s->set_lenc(s, 1);                     // lens shading correction
  s->set_bpc(s, 1);
  s->set_wpc(s, 1);
  s->set_dcw(s, 1);
  return true;
}

// ---- Wi-Fi ------------------------------------------------------------------------------------
static bool connectWifi(unsigned long timeoutMs) {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.printf("Wi-Fi: connecting to %s\n", WIFI_SSID);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < timeoutMs) delay(250);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Wi-Fi: up, IP %s, signal %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
  }
  Serial.println("Wi-Fi: not connected");
  return false;
}

// ---- upload ------------------------------------------------------------------------------------
#if USE_HTTPS
static WiFiClientSecure netClient;      // kept between posts: one TLS handshake, not one per picture
#else
static WiFiClient netClient;
#endif
static HTTPClient http;

// The server's certificate is only valid at the right date, so a TLS connection needs the clock.
static bool ensureClock() {
#if USE_HTTPS
  if (time(nullptr) > 1700000000) return true;
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  unsigned long t0 = millis();
  while (time(nullptr) <= 1700000000 && millis() - t0 < 10000) delay(200);
  if (time(nullptr) <= 1700000000) { Serial.println("clock: no NTP time yet"); return false; }
  Serial.println("clock: synced");
#endif
  return true;
}

// Returns the HTTP status (202 = accepted), or a negative HTTPClient error.
static int postFrame(const uint8_t *buf, size_t len) {
  if (!ensureClock()) return -101;
  http.setTimeout(6000);
  http.setReuse(true);                                   // keep the connection open between pictures
  if (!http.begin(netClient, uploadUrl)) return -100;
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-Camera-Key", CAMERA_KEY);
  int code = http.POST(const_cast<uint8_t *>(buf), len);
  http.end();
  if (code != 202) netClient.stop();                     // a failed or stale connection: start fresh next time
  return code;
}

// ---- heat --------------------------------------------------------------------------------------
static unsigned long currentIntervalMs(float tempC) {
  return tempC >= WARM_C ? max((unsigned long)INTERVAL_MS, (unsigned long)WARM_INTERVAL_MS) : INTERVAL_MS;
}

void setup() {
#if DISABLE_BROWNOUT
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);             // test only: do not reset on a voltage dip
#endif
  Serial.begin(115200);
  delay(600);                                            // let the supply settle before the camera starts
  setCpuFrequencyMhz(CPU_MHZ);
  pinMode(FLASH_LED_GPIO, OUTPUT);
  digitalWrite(FLASH_LED_GPIO, LOW);
  pinMode(STATUS_LED_GPIO, OUTPUT);
  statusLed(false);

  Serial.printf("\nParkFNB camera '%s' starting (%d MHz, camera clock %d MHz%s)\n", CAMERA_ID,
                getCpuFrequencyMhz(), XCLK_MHZ, DISABLE_BROWNOUT ? ", BROWNOUT DETECTOR OFF" : "");

  if (!initCamera()) {                   // a bad ribbon or a weak supply: restart and try again
    blink(10, 80);
    delay(2000);
    ESP.restart();
  }

  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_TX_POWER);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

#if USE_HTTPS
  netClient.setCACert(ISRG_ROOT_X1);                     // refuse any server that does not prove who it is
  uploadUrl = String("https://") + SERVER_HOST;
  if (SERVER_PORT != 443) uploadUrl += String(":") + SERVER_PORT;
#else
  uploadUrl = String("http://") + SERVER_HOST + ":" + SERVER_PORT;
#endif
  uploadUrl += String("/live/frame-raw?camera_id=") + CAMERA_ID;
  Serial.printf("uploading to %s\n", uploadUrl.c_str());

  connectWifi(20000);
  lastSuccessMs = millis();
  blink(2, 150);                         // two blinks: up and running
}

void loop() {
  const float tempC = temperatureRead();

  // too hot: stop capturing until it has cooled
  if (tempC >= HOT_C) {
    if (!paused) Serial.printf("HOT %.1f C: pausing until below %.1f C\n", tempC, (float)RESUME_C);
    paused = true;
  } else if (paused && tempC <= RESUME_C) {
    Serial.printf("cooled to %.1f C: resuming\n", tempC);
    paused = false;
  }
  if (paused) { delay(5000); return; }

  if (millis() - lastCaptureMs < currentIntervalMs(tempC)) { delay(20); return; }
  lastCaptureMs = millis();

  if (!connectWifi(8000)) {
    failed++;
  } else {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb || fb->len == 0) {
      Serial.println("capture failed");
      failed++;
      if (fb) esp_camera_fb_return(fb);
    } else {
      int code = postFrame(fb->buf, fb->len);
      size_t len = fb->len;
      esp_camera_fb_return(fb);
      if (code == 202) {
        sent++;
        lastSuccessMs = millis();
        if (sent % 20 == 1)
          Serial.printf("ok  #%u  %u KB  %.1f C  rssi %d  heap %u\n", sent, (unsigned)(len / 1024),
                        tempC, WiFi.RSSI(), ESP.getFreeHeap());
      } else {
        failed++;
        Serial.printf("upload failed: HTTP %d%s\n", code,
                      code == 403 ? " (wrong CAMERA_KEY)" :
                      code == 413 ? " (picture too big: raise JPEG_QUALITY)" :
                      code == -101 ? " (no clock: TLS needs NTP time)" :
                      code == -1 && USE_HTTPS ? " (cannot connect: wrong SERVER_HOST, ports 80/443 closed, or certificate not accepted)" : "");
        blink(1, 60);
      }
    }
  }

  if (millis() - lastSuccessMs > NO_SUCCESS_RESTART_MS) {
    Serial.println("nothing delivered for too long: restarting");
    delay(200);
    ESP.restart();
  }
}
