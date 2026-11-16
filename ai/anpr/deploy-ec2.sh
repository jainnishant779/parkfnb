#!/usr/bin/env bash
#
# Deploy the ANPR service to EC2.
#
#   ./deploy-ec2.sh 3.7.139.193 ~/Downloads/parkfnb1.pem
#
# Safe to re-run: it syncs the code, reinstalls only what changed, and
# restarts the service. First run takes ~10 minutes, mostly pip.
#
set -euo pipefail

HOST="${1:?usage: ./deploy-ec2.sh <public-ip> <path-to-key.pem>}"
KEY="${2:?usage: ./deploy-ec2.sh <public-ip> <path-to-key.pem>}"
USER="ubuntu"
APP="/opt/anpr"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=25 "$USER@$HOST")

say() { printf '\n\033[1;34m== %s\033[0m\n' "$1"; }

[ -f "$HERE/weights/best.pt" ] || {
  echo "weights/best.pt missing — download it from Drive first" >&2
  exit 1
}

say "1/6  System packages"
# libGL and libglib are needed by OpenCV; without them the import fails with
# a cryptic "libGL.so.1: cannot open shared object file".
"${SSH[@]}" bash -s <<'REMOTE'
set -e
sudo apt-get update -qq
sudo apt-get install -y -qq python3-venv python3-pip libgl1 libglib2.0-0 rsync >/dev/null
sudo mkdir -p /opt/anpr
sudo chown -R ubuntu:ubuntu /opt/anpr
REMOTE

say "2/6  Swap (the model peaks above what 2 GB comfortably holds)"
"${SSH[@]}" bash -s <<'REMOTE'
set -e
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap -q /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo "  2 GB swap added"
else
  echo "  swap already present"
fi
REMOTE

say "3/6  Code and model"
# scp rather than rsync: Git Bash on Windows ships without rsync, and the
# payload is small enough that re-copying costs nothing. The 21 MB model is
# skipped when the remote copy already matches.
SCP=(scp -q -i "$KEY" -o StrictHostKeyChecking=no)

"${SSH[@]}" "mkdir -p $APP/static $APP/weights"
"${SCP[@]}" "$HERE/app.py" "$HERE/detector.py" "$USER@$HOST:$APP/"
"${SCP[@]}" "$HERE/static/index.html" "$USER@$HOST:$APP/static/"
"${SCP[@]}" "$HERE/demo_car.jpg" "$HERE/deny_car.jpg" "$USER@$HOST:$APP/" || true

LOCAL_SUM=$(sha256sum "$HERE/weights/best.pt" | cut -d' ' -f1)
REMOTE_SUM=$("${SSH[@]}" "sha256sum $APP/weights/best.pt 2>/dev/null | cut -d' ' -f1" || true)
if [ "$LOCAL_SUM" = "$REMOTE_SUM" ]; then
  echo "  model already up to date"
else
  echo "  uploading weights (21 MB)..."
  "${SCP[@]}" "$HERE/weights/best.pt" "$USER@$HOST:$APP/weights/"
fi

say "4/6  Python environment"
# torch CPU-only is ~200 MB rather than the ~800 MB CUDA build, which matters
# on a 2 GB box and on install time.
"${SSH[@]}" bash -s <<'REMOTE'
set -e
cd /opt/anpr
[ -d venv ] || python3 -m venv venv
./venv/bin/pip install -q --upgrade pip
./venv/bin/pip install -q \
  --extra-index-url https://download.pytorch.org/whl/cpu \
  torch torchvision \
  ultralytics easyocr fastapi "uvicorn[standard]" httpx python-multipart \
  opencv-python-headless
echo "  installed"
REMOTE

say "5/6  Service"
"${SSH[@]}" bash -s <<'REMOTE'
set -e
sudo tee /etc/systemd/system/anpr.service >/dev/null <<'UNIT'
[Unit]
Description=ParkFNB ANPR service
After=network-online.target
Wants=network-online.target

[Service]
User=ubuntu
WorkingDirectory=/opt/anpr
EnvironmentFile=/opt/anpr/anpr.env
ExecStart=/opt/anpr/venv/bin/uvicorn app:app --host 0.0.0.0 --port 8008
Restart=always
RestartSec=5
# Loading YOLO plus OCR takes well over a minute on two vCPUs.
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
UNIT

if [ ! -f /opt/anpr/anpr.env ]; then
  cat > /opt/anpr/anpr.env <<'ENV'
ANPR_OCR=easyocr
ANPR_DEVICE=cpu
ANPR_IMGSZ=960
ANPR_SERVICE_TOKEN=parkfnb-anpr-demo-token
BACKEND_URL=https://parkfnb.onrender.com
ANPR_DEVICE_ID=pb-001
ENV
  echo "  wrote anpr.env"
else
  echo "  anpr.env kept (edit it on the server to change settings)"
fi

sudo systemctl daemon-reload
sudo systemctl enable -q anpr
sudo systemctl restart anpr
REMOTE

say "6/6  Waiting for the model to load"
# EasyOCR downloads its weights on first run, so the first start is the slow one.
for i in $(seq 1 40); do
  if curl -fsS --max-time 8 "http://$HOST:8008/health" 2>/dev/null | grep -q '"model_loaded":true'; then
    echo
    echo "  ready after ~$((i * 10))s"
    curl -s "http://$HOST:8008/health"
    echo
    echo
    echo "  Open:  http://$HOST:8008"
    echo
    echo "  Logs:  ssh -i $KEY $USER@$HOST 'journalctl -u anpr -f'"
    echo "  Env:   ssh -i $KEY $USER@$HOST 'sudo nano /opt/anpr/anpr.env'"
    exit 0
  fi
  printf '.'
  sleep 10
done

echo
echo "  Did not come up in ~7 minutes. Check the logs:"
echo "    ssh -i $KEY $USER@$HOST 'journalctl -u anpr -n 60 --no-pager'"
exit 1
