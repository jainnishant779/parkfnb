# ParkFNB ANPR service

Parking-management service: a phone camera feeds it pictures; it finds cars, gives each a bay, judges parking against the painted lines
(with a fitted 3D box), reads number plates, and shows everything on an operator console.  Runs on one small AWS EC2 box (CPU only).

**Taking this over? Start with [HANDOVER.md](HANDOVER.md)** (what runs on EC2, how to do UI work, how to deploy, rules, open work).

## Where things are

| Path | What |
|---|---|
| `app.py` | the FastAPI app: routes, live pipeline, registers wiring |
| `live.py`, `status.py`, `night.py` | per-camera session, bay status (VACANT / OCCUPIED / UNCERTAIN / STALE), night judgement |
| `occupancy.py`, `contact.py`, `calibration.py`, `cuboid_fit.py` | bay assignment, ground contact, site camera calibration, 3D box |
| `plate_ocr.py`, `arrivals.py`, `violations.py` | plate readers and voting, the arrivals and violations registers |
| `record.py`, `tools/eval_pilot.py`, `tools/replay_record.py`, `static/label.html` | record the lot, label it, score accuracy (see `docs/accuracy-test.md`) |
| `static/` | the console (`console.html`, `js/`, `css/`), the public live page, the phone camera page, the bay editor |
| `deploy/` | `update-ec2.sh` (deploy with auto-rollback), `setup-ec2.sh`, `parkfnb-anpr.service`, env table in `deploy/README.md` |
| `tests/`, `tools/e2e/` | ~980 pytest tests, and browser suites (`python tools/e2e/run_e2e.py <suite>`) |
| `weights/` | model weights (NOT in git: `best.pt`, `yolo11n-seg.pt`, `plate_ocr/*.onnx`) |
| `docs/` | `accuracy-test.md`, and the how-it-works document in Hinglish and English |

## Run, test, deploy

```
pip install -r requirements.txt            # and requirements-ocr.txt for plate reading
uvicorn app:app --port 8010                 # needs weights/ and a few env values (see deploy/README.md)
python -m pytest tests -q -p no:cacheprovider
```

Deploy (to the EC2 box; git is not used on the server): build a `.tgz` of the files in `deploy/` + code + `weights/`, `scp` it with
`deploy/update-ec2.sh`, then `sudo bash /tmp/update-ec2.sh file:///tmp/<bundle>.tgz <sha256>`.  It backs up the old code and rolls back by itself.
Never commit `.env`, keys or `.pem` files (they are git-ignored).

---
## The original purpose: the barrier

Reads a number plate from an image and asks the backend to open the barrier.

```
image  ->  YOLO11n  ->  plate crop  ->  OCR  ->  normalise  ->  backend  ->  MQTT  ->  ESP32
```

**This service never decides access.** It reports what it saw. The backend
checks the booking, the payment and the time window, and opens the gate.
If the camera cannot reach the backend, the gate stays shut.

---

## Setup

Weights go in `weights/best.pt` (not committed — 21 MB). Download from Colab:

```
MyDrive/ParkFNB/ParkFNB_Dataset/training_runs/
  yolo11n_vehicle_plate_v3/weights/best.pt
```

```bash
pip install ultralytics easyocr fastapi uvicorn httpx python-multipart opencv-python
# optional, reads plates better than EasyOCR:
pip install paddlepaddle paddleocr
```

## Run

```bash
cd parkfnb-anpr
uvicorn app:app --port 8008
```

Port 8008, not 5000 — the backend and the space optimizer both want 5000.

Open <http://localhost:8008>, drop in a photo, press **Open the gate**.

First start takes ~25s while the models load. `/health` returns
`model_loaded: true` when it is ready — poll that before demoing.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `ANPR_WEIGHTS` | `weights/best.pt` | |
| `ANPR_DEVICE` | `cpu` | `0` for GPU |
| `ANPR_IMGSZ` | `960` | 640 is ~2x faster, slightly worse |
| `ANPR_OCR` | `auto` | `easyocr` skips PaddleOCR entirely |
| `BACKEND_URL` | `http://localhost:5000` | |
| `ANPR_SERVICE_TOKEN` | `change-me-anpr-token` | must match the backend |
| `ANPR_DEVICE_ID` | `pb-001` | default barrier |

## Endpoints

| | |
|---|---|
| `GET /` | demo page |
| `GET /health` | readiness |
| `POST /detect` | read a plate, decide nothing |
| `POST /gate-event` | read a plate, ask the backend to open |
| `POST /normalise` | run the plate normaliser on a string |

```bash
curl -F "image=@demo_car.jpg" localhost:8008/detect
curl -F "image=@demo_car.jpg" -F device_id=pb-001 localhost:8008/gate-event
```

## Plate normalisation

OCR confuses `O`/`0` and `I`/`1`. The fix is applied **by position**, because
a blanket `O -> 0` turns the `MP` state code into `M0` and matches nothing.

```
MH 04 DB 6948
LL DD LL DDDD
^^ letters      ^^^^ digits
```

Measured on a real read: OCR returned `MHO4DB6948`, normalisation produced
`MH04DB6948`, which matched the booking.

The same function exists in `backend/src/controllers/anprAccessController.js`
and runs again there. The camera's output is never trusted.

## Performance

4-core laptop CPU, no GPU:

| | |
|---|---|
| Model load | ~23 s (once, at startup) |
| Detection @960 | ~290 ms |
| Detection + OCR | ~900 ms |

Fast enough for gate entry, and it is the number that makes the
edge-deployment case concrete.

## Camera input

Today the browser posts the image. An ESP32-CAM can post to the same
`/gate-event` endpoint with no change here — the camera is just an input.

## Demo

Two runs, and the second is the better one:

1. A plate with a live paid booking -> **ALLOW**, barrier opens
2. A plate with no booking -> **DENY**, refusal written to `AccessAuditLog`

Anything can open a gate. Refusing correctly is the product.
