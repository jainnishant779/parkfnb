# ParkFNB camera node (AI-Thinker ESP32-CAM)

Takes one JPEG every 1.5 s and posts it to the ANPR server. The board only captures and uploads;
detection, plate reading and IN/OUT counting run on the server.

```
ESP32-CAM --Wi-Fi--> POST http://<laptop-LAN-IP>:8008/live/frame-raw?camera_id=gate-1
                     Content-Type: image/jpeg   X-Camera-Key: <key>   body = the JPEG
```

## 1. Server side
Start the server so other devices can reach it, with the camera key fixed:

```
set LIVE_CAMERA_KEY=choose-a-long-random-key
cd services\anpr
python -m uvicorn app:app --host 0.0.0.0 --port 8008
```

- Allow Python through Windows Firewall for **Private** networks when it asks.
- Find the laptop's address with `ipconfig` (IPv4, e.g. `192.168.1.20`). Laptop and ESP32 must be on
  the same Wi-Fi, 2.4 GHz.
- Devices on the network can only post frames and view `/live`. Bay layouts, setup pages, the camera
  key and plate text are reachable from the laptop itself only.

### Over the internet (EC2) instead of the laptop
Use HTTPS so the camera key cannot be read on the way: in `config.h` set `SERVER_HOST` to the server's
name, `SERVER_PORT 443` and `USE_HTTPS 1` (see `services/anpr/deploy/README.md`). The board checks the
server's certificate against the Let's Encrypt root in `root_ca.h` and gets the time over NTP first (the
certificate is only valid on the right date), so it needs internet access, not just the LAN. The server
side must use a Let's Encrypt certificate (the deploy script sets that up).

## 2. Settings
Edit `config.h`: Wi-Fi name/password, `SERVER_HOST` (laptop IP), `CAMERA_ID`, `CAMERA_KEY` (the same
key as `LIVE_CAMERA_KEY`). Do not commit your real Wi-Fi password or key.

## 3. Flash
Arduino IDE, board **AI Thinker ESP32-CAM** (esp32 core 3.x), PSRAM enabled.

The AI-Thinker board has no USB port, so use a USB-serial adapter (3.3 V logic):

| Adapter | ESP32-CAM |
|---|---|
| 5V | 5V |
| GND | GND |
| TX | U0R |
| RX | U0T |
| | **IO0 to GND** while flashing (remove it afterwards), then press RESET |

Open the Serial Monitor at 115200. You should see `Wi-Fi: up`, then `ok #1 ...` and two blinks of the
small red LED.

## 4. Mount and focus
- **Gate camera:** 2-3 m from where the car stops, pointing at the plate, slightly from the front and
  low. Plates need ~150 px across (see `FRAME_SIZE` in `config.h` for the distance at each resolution).
- Twist the lens ring to focus at the distance the plate will be (3-4 m); the sensor is fixed focus.
- Keep the sun out of the lens; a short shade helps the picture and the temperature.
- If the picture is upside down or mirrored: `CAM_VFLIP` / `CAM_HMIRROR`.
- On the laptop open `http://localhost:8008/occupancy?camera=gate-1`, press **Load Live Phone Frame**,
  draw the IN/OUT line (and bays if you want them), then watch `http://localhost:8008/live?camera_id=gate-1&plates=1`.

## 5. Heat and power
- It posts **snapshots**, not video: far cooler than the stock streaming demo. It also runs at 160 MHz and
  keeps the white flash LED off.
- Above 70 C (internal sensor, reads a few degrees off) it slows to one frame per 4 s; above 80 C it
  pauses until it cools. Settings are in `config.h`.
- Power it from a good 5 V supply (1 A), a short thick cable, and a 100-470 uF capacitor across 5V/GND
  near the board. Weak power causes resets and garbled pictures.
- Outdoors: a ventilated, waterproof box, in shade; add a small heatsink on the ESP32 module.
- It restarts itself if nothing has been delivered for 2 minutes.

## Troubleshooting
| Serial Monitor says | Meaning |
|---|---|
| `camera init failed` | Ribbon cable loose or power too weak. Reseat the camera, use a better supply. |
| `Camera probe failed ... 0x106 (ESP_ERR_NOT_SUPPORTED)` | The chip cannot talk to the sensor: the ribbon is loose or the wrong way round. Lift the connector latch, push the ribbon in fully (gold contacts toward the board), press the latch down. |
| `E BOD: Brownout detector was triggered`, then restarts | The 5 V supply cannot supply the camera's current spike. Use a separate 5 V / 1 A supply (common GND with the adapter), a short thick cable, and a 470 uF capacitor across 5V and GND. `XCLK_MHZ 10` and `WIFI_TX_POWER WIFI_POWER_11dBm` in `secrets.h` help a marginal supply; `DISABLE_BROWNOUT 1` only hides the problem and is for tests. |
| `cam_hal: FB-OVF` a few times at start | Harmless: the camera filled its buffers while the board was busy joining Wi-Fi. |
| `Wi-Fi: up ... signal -80 dBm` | Weak signal: move the board closer to the router or use the external-antenna version. |
| `Wi-Fi: not connected` | Wrong name/password, or the network is 5 GHz only. |
| `upload failed: HTTP -1` | Server unreachable: wrong `SERVER_HOST`, server started with `127.0.0.1` instead of `0.0.0.0`, or firewall. |
| `HTTP 403 (wrong CAMERA_KEY)` | `CAMERA_KEY` differs from `LIVE_CAMERA_KEY` on the server. |
| `HTTP 413` | Picture too big: raise `JPEG_QUALITY` (e.g. 14) or lower `FRAME_SIZE`. |
| `HOT ...: pausing` | Too hot: shade it, add airflow, raise `INTERVAL_MS`. |
