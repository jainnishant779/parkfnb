#!/usr/bin/env bash
#
# Set up the ParkFNB live ANPR service on an Ubuntu EC2 instance.  Run ON the instance:
#
#   sudo bash setup-ec2.sh <bundle-url> <bundle-sha256> [--domain NAME] [--with-ocr] [--retire-old]
#
#   --domain NAME   public HTTPS name (default: <ip-with-dashes>.sslip.io, which needs no DNS)
#   --with-ocr      also install the plate reader (needs ~0.5 GB more RAM; not for a 2 GB box)
#   --retire-old    stop and disable the old `anpr` service (it holds ~0.7 GB of RAM)
#
# Safe to run again: it only changes what differs, and never overwrites the camera key.
#
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
URL="${1:?usage: sudo bash setup-ec2.sh <bundle-url> <bundle-sha256> [options]}"
SHA="${2:?usage: sudo bash setup-ec2.sh <bundle-url> <bundle-sha256> [options]}"
shift 2
DOMAIN=""; OCR=no; RETIRE=no
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:?--domain needs a name}"; shift 2 ;;
    --with-ocr) OCR=yes; shift ;;
    --retire-old) RETIRE=yes; shift ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

APP=/opt/parkfnb-anpr
DATA=/var/lib/parkfnb-anpr
ENVF=/etc/parkfnb-anpr.env
RUN_USER=ubuntu
PORT=8010

say() { printf '\n\033[1;34m== %s\033[0m\n' "$1"; }

say "0/9  This machine"
TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)
PUBIP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
[ -n "$DOMAIN" ] || { [ -n "$PUBIP" ] && DOMAIN="${PUBIP//./-}.sslip.io"; }
[ -n "$DOMAIN" ] || { echo "Could not work out the public address; pass --domain NAME." >&2; exit 1; }
echo "  public IP: ${PUBIP:-unknown}   HTTPS name: $DOMAIN"
free -m | awk 'NR==2 {printf "  RAM: %d MB total, %d MB available\n", $2, $7}'
df -h / | awk 'NR==2 {printf "  disk: %s free\n", $4}'

say "1/9  System packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates libglib2.0-0 libgl1 >/dev/null
if ! apt-get install -y -qq caddy >/dev/null 2>&1; then
  echo "  caddy is not in the Ubuntu repository here; adding Caddy's own"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gpg >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

say "2/9  Swap (a safety net on a small box)"
if [ -z "$(swapon --show --noheadings)" ]; then
  [ -f /swapfile ] || { fallocate -l 2G /swapfile; chmod 600 /swapfile; mkswap -q /swapfile; }
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  2 GB swap on"
else
  echo "  swap already present"
fi

say "3/9  The code and model weights"
curl -fsSL "$URL" -o /tmp/anpr-bundle.tgz
echo "$SHA  /tmp/anpr-bundle.tgz" | sha256sum -c - || { echo "Checksum does not match: not unpacking." >&2; exit 1; }
mkdir -p "$APP" "$DATA"
tar -xzf /tmp/anpr-bundle.tgz -C "$APP"
chown -R "$RUN_USER:$RUN_USER" "$APP" "$DATA"
rm -f /tmp/anpr-bundle.tgz
ls "$APP" | head -30 | tr '\n' ' '; echo

say "4/9  Python 3.12 (Ubuntu's own is too new for PyTorch)"
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | UV_UNMANAGED_INSTALL=/usr/local/bin sh >/dev/null
sudo -u "$RUN_USER" env HOME="/home/$RUN_USER" uv venv --python 3.12 "$APP/.venv" -q

say "5/9  Libraries (the slow step: PyTorch for CPU, a few minutes)"
PIP=(sudo -u "$RUN_USER" env HOME="/home/$RUN_USER" uv pip install --python "$APP/.venv/bin/python" -q)
"${PIP[@]}" torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cpu
"${PIP[@]}" -r "$APP/requirements.txt"
if [ "$OCR" = yes ]; then "${PIP[@]}" -r "$APP/requirements-ocr.txt"; fi
sudo -u "$RUN_USER" env HOME="/home/$RUN_USER" uv cache clean -q || true

say "6/9  Settings (the camera key is made once and kept)"
if [ ! -f "$ENVF" ]; then
  KEY=$(python3 -c "import secrets; a='abcdefhjkmnprstuvwxyz23456789'; print(''.join(secrets.choice(a) for _ in range(12)))")
  OCRSET=none; [ "$OCR" = yes ] && OCRSET=auto
  cat > "$ENVF" <<EOF
LIVE_CAMERA_KEY=$KEY
ANPR_DATA_DIR=$DATA
ANPR_OCR=$OCRSET
OMP_NUM_THREADS=2
MALLOC_ARENA_MAX=2
EOF
  chmod 600 "$ENVF"
  echo "  wrote $ENVF"
else
  echo "  $ENVF already exists: kept as it is"
fi
# the admin sign-in token (added to an existing file too, so older installs gain it)
if ! grep -q '^ANPR_ADMIN_TOKEN=' "$ENVF"; then
  ADMIN=$(python3 -c "import secrets; a='abcdefhjkmnprstuvwxyz23456789'; print(''.join(secrets.choice(a) for _ in range(28)))")
  echo "ANPR_ADMIN_TOKEN=$ADMIN" >> "$ENVF"
  echo "  admin token created"
fi

say "7/9  Service and HTTPS"
install -m 644 "$APP/deploy/parkfnb-anpr.service" /etc/systemd/system/parkfnb-anpr.service
systemctl daemon-reload
if [ "$RETIRE" = yes ] && systemctl list-unit-files anpr.service >/dev/null 2>&1; then
  systemctl disable --now anpr.service || true
  echo "  old anpr.service stopped and disabled"
fi
# Let's Encrypt only (Caddy would otherwise fall back to ZeroSSL, a different certificate chain, and
# the ESP32 only trusts Let's Encrypt's root).
cat > /etc/caddy/Caddyfile <<EOF
{
    acme_ca https://acme-v02.api.letsencrypt.org/directory
}

$DOMAIN {
    request_body {
        max_size 4MB
    }
    reverse_proxy 127.0.0.1:$PORT
}
EOF
systemctl enable --now parkfnb-anpr.service
systemctl restart parkfnb-anpr.service
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy

say "8/9  Waiting for the model to load"
ok=no
for i in $(seq 1 60); do
  if curl -fs "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then ok=yes; break; fi
  sleep 3
done
if [ "$ok" != yes ]; then
  echo "The service did not come up in 3 minutes. Last log lines:" >&2
  journalctl -u parkfnb-anpr -n 25 --no-pager >&2
  exit 1
fi
curl -s "http://127.0.0.1:$PORT/health"; echo

say "9/9  HTTPS check (not fatal: it needs ports 80 and 443 open in the Security Group)"
https=no
for i in $(seq 1 20); do
  if curl -fsS -o /dev/null --max-time 10 "https://$DOMAIN/live/state" 2>/dev/null; then https=yes; break; fi
  sleep 4
done
if [ "$https" = yes ]; then
  echo "  https://$DOMAIN works (certificate issued)"
else
  echo "  https://$DOMAIN is not answering yet. Open inbound 80 and 443 in the Security Group;"
  echo "  Caddy keeps retrying by itself. Check later with:  curl -sS https://$DOMAIN/live/state"
  echo "  and see why with:  journalctl -u caddy -n 30 --no-pager"
fi

say "Done"
KEY=$(grep '^LIVE_CAMERA_KEY=' "$ENVF" | cut -d= -f2)
ADMIN=$(grep '^ANPR_ADMIN_TOKEN=' "$ENVF" | cut -d= -f2)
free -m | awk 'NR==2 {printf "RAM now: %d MB used, %d MB available\n", $3, $7}'
cat <<EOF

Public viewer (anyone):    https://$DOMAIN/live
Phone camera link:         https://$DOMAIN/live/camera?camera_id=phone-1&key=$KEY
ESP32 (config.h):          SERVER_HOST "$DOMAIN"   SERVER_PORT 443   USE_HTTPS 1   CAMERA_KEY "$KEY"
ADMIN sign-in (mark bays): https://$DOMAIN/admin?token=$ADMIN

Keep the key and the admin link private; they are stored in $ENVF (root only).
Open ports 80 and 443 in the instance's Security Group (inbound, anywhere) so HTTPS works.
Do NOT open 8008 or $PORT.
EOF
