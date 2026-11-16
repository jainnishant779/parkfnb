// ParkFNB ESP32-CAM (AI-Thinker) — settings.  Edit this file, not the sketch.
#pragma once

// Private values (Wi-Fi password, camera key) belong in secrets.h, which git ignores and which is
// read first.  Copy secrets.example.h to secrets.h and fill it in; whatever it defines wins over the
// defaults below.
#if __has_include("secrets.h")
#include "secrets.h"
#endif

// ---- Wi-Fi: 2.4 GHz only (the ESP32 cannot join 5 GHz) -------------------------------------------
#ifndef WIFI_SSID
#define WIFI_SSID "your-wifi-name"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "your-wifi-password"
#endif

// ---- The ANPR server ---------------------------------------------------------------------------------
// On the same Wi-Fi (a laptop running `uvicorn app:app --host 0.0.0.0 --port 8008`):
//     SERVER_HOST "192.168.1.20"  (ipconfig -> IPv4, not localhost)   SERVER_PORT 8008   USE_HTTPS 0
// On the internet (the EC2 server, behind Caddy with a Let's Encrypt certificate):
//     SERVER_HOST "3-7-139-193.sslip.io"  (or your own domain)         SERVER_PORT 443    USE_HTTPS 1
// With USE_HTTPS 1 the certificate is checked against the Let's Encrypt root in root_ca.h, so the
// camera key cannot be read or replayed by anyone on the way.  Plain HTTP is for a trusted LAN only.
#ifndef SERVER_HOST
#define SERVER_HOST "192.168.1.20"
#endif
#ifndef SERVER_PORT
#define SERVER_PORT 8008
#endif
#ifndef USE_HTTPS
#define USE_HTTPS   0
#endif

// What this camera is called on the server, and its key.  The key is LIVE_CAMERA_KEY on the server
// (printed when it starts, and shown at http://localhost:8008/live/setup).  Never publish it.
#ifndef CAMERA_ID
#define CAMERA_ID  "gate-1"
#endif
#ifndef CAMERA_KEY
#define CAMERA_KEY "CHANGE_ME"
#endif

// ---- Picture --------------------------------------------------------------------------------------
// Resolution decides how far away a number plate is still readable (we need ~150 px across the plate):
//   FRAMESIZE_VGA   640x480    plate readable up to ~1.7 m     coolest, smallest uploads
//   FRAMESIZE_SVGA  800x600    ~2 m                            default
//   FRAMESIZE_XGA   1024x768   ~2.7 m
//   FRAMESIZE_HD    1280x720   ~3.4 m   (16:9, like the phone page)
//   FRAMESIZE_UXGA  1600x1200  ~4.2 m                          hottest, biggest uploads
// (distances are estimates for the usual ~65 degree lens and a 0.5 m plate)
#define FRAME_SIZE   FRAMESIZE_SVGA
#define JPEG_QUALITY 12        // 10 (best, biggest) .. 63 (worst, smallest); 10-14 is a good range

// Turn these on if the picture is upside down or mirrored for how you mounted the board.
#define CAM_VFLIP   0
#define CAM_HMIRROR 0

// Exposure bias, -2..2.  -1 shortens the shutter a little, which cuts motion blur on moving cars.
#define AE_LEVEL 0

// ---- Weak power (USB port + FTDI adapter) ------------------------------------------------------------
// The camera and Wi-Fi draw sharp current spikes.  If the 5 V supply cannot keep up, the chip's
// brownout detector resets it over and over ("E BOD: Brownout detector was triggered").  The real fix
// is a proper 5 V / 1 A supply and a 470 uF capacitor across 5V and GND.  These help a marginal
// supply and are safe to leave on; DISABLE_BROWNOUT is for a quick test only.
#ifndef XCLK_MHZ
#define XCLK_MHZ 20            // camera clock; 10 draws less current and is plenty at one picture per second
#endif
#ifndef WIFI_TX_POWER
#define WIFI_TX_POWER WIFI_POWER_19_5dBm     // WIFI_POWER_11dBm halves the transmit spike; fine near the router
#endif
#ifndef DISABLE_BROWNOUT
#define DISABLE_BROWNOUT 0     // 1 = ignore voltage dips instead of resetting. Hides a power problem: pictures
                               // can come out corrupt or the board hang. For testing only, never for use.
#endif

// ---- Pace and heat ---------------------------------------------------------------------------------
// One snapshot per interval, not a video stream: far cooler, and the server handles about 1 frame/s.
#define INTERVAL_MS 1500

// Chip temperature from the ESP32's internal sensor (reads a few degrees off, use it as a trend).
// Above WARM_C the camera slows down; above HOT_C it pauses until it cools below RESUME_C.
#define WARM_C   70.0
#define HOT_C    80.0
#define RESUME_C 70.0
#define WARM_INTERVAL_MS 4000

// 160 MHz instead of 240 MHz: noticeably cooler, and plenty for snapshots.
#define CPU_MHZ 160

// Restart the board if nothing has been delivered for this long (Wi-Fi or server stuck).
#define NO_SUCCESS_RESTART_MS 120000UL
