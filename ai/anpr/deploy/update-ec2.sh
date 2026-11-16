#!/usr/bin/env bash
#
# Update the ParkFNB live ANPR CODE on an instance that setup-ec2.sh already set up. Run ON the instance:
#
#   sudo bash update-ec2.sh <bundle-url> <bundle-sha256>
#
# It keeps the camera key, the admin token, the saved bays and the Python environment. It first saves
# the current code; if the new version does not start, it puts the old one back.
# If the bundle needs different libraries (requirements.txt changed) it stops and asks you to run
# setup-ec2.sh instead, without changing anything.
#
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
URL="${1:?usage: sudo bash update-ec2.sh <bundle-url> <bundle-sha256>}"
SHA="${2:?usage: sudo bash update-ec2.sh <bundle-url> <bundle-sha256>}"
APP=/opt/parkfnb-anpr
PORT=8010
RUN_USER=ubuntu
BACKUPS=/var/backups/parkfnb-anpr
TMP=/tmp/anpr-update.tgz

say() { printf '\n\033[1;34m== %s\033[0m\n' "$1"; }

[ -x "$APP/.venv/bin/python" ] || { echo "Not set up here yet: run setup-ec2.sh first." >&2; exit 1; }

say "1/5  Download and check"
curl -fsSL "$URL" -o "$TMP"
echo "$SHA  $TMP" | sha256sum -c - || { echo "Checksum does not match: nothing was changed." >&2; rm -f "$TMP"; exit 1; }

say "2/5  Same libraries?"
# Compared without line endings: a file saved on Windows (CRLF) and the same file from Linux (LF) are the same libraries.  Compared
# byte for byte, the first deploy from CI said "libraries changed" for a file whose text had not changed at all.
NEWREQ=$( (tar -xzOf "$TMP" requirements.txt 2>/dev/null || true) | tr -d '\r')
OLDREQ=$( (cat "$APP/requirements.txt" 2>/dev/null || true) | tr -d '\r')
OLDOCR=$( (cat "$APP/requirements-ocr.txt" 2>/dev/null || true) | tr -d '\r')
NEWOCR=$( (tar -xzOf "$TMP" requirements-ocr.txt 2>/dev/null || true) | tr -d '\r')
if [ "$NEWREQ" != "$OLDREQ" ] || [ "$NEWOCR" != "$OLDOCR" ]; then
  echo "The libraries changed in this version. Run setup-ec2.sh with this bundle instead; nothing was changed." >&2
  rm -f "$TMP"; exit 1
fi
echo "  unchanged"

say "3/5  Save the current code"
mkdir -p "$BACKUPS"
BK="$BACKUPS/code-$(date +%Y%m%d-%H%M%S).tgz"
tar -czf "$BK" -C "$APP" --exclude=.venv --exclude=weights .
ls -1t "$BACKUPS"/code-*.tgz | tail -n +4 | xargs -r rm -f          # keep the last three
echo "  saved to $BK"

say "4/5  Install the new code and restart"
tar -xzf "$TMP" -C "$APP"
chown -R "$RUN_USER:$RUN_USER" "$APP"
rm -f "$TMP"
systemctl restart parkfnb-anpr.service

say "5/5  Waiting for it to come up"
ok=no
for i in $(seq 1 60); do
  if curl -fs "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then ok=yes; break; fi
  sleep 3
done
if [ "$ok" != yes ]; then
  echo "The new version did not start. Putting the old code back." >&2
  journalctl -u parkfnb-anpr -n 20 --no-pager >&2 || true
  tar -xzf "$BK" -C "$APP"
  chown -R "$RUN_USER:$RUN_USER" "$APP"
  systemctl restart parkfnb-anpr.service
  echo "Rolled back to $BK" >&2
  exit 1
fi
curl -s "http://127.0.0.1:$PORT/health"; echo
free -m | awk 'NR==2 {printf "RAM: %d MB used, %d MB available\n", $3, $7}'
echo
echo "Updated. Saved bays, the key and the admin token are unchanged."
