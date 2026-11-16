#!/usr/bin/env bash
#
# The ONLY thing the GitHub deploy key can do on this server (installed as /usr/local/bin/parkfnb-deploy, see install-deploy-access.sh).
# sshd runs it for every connection of that key, whatever the client asked for, and hands the client's request in SSH_ORIGINAL_COMMAND:
#
#   ssh <host> ping                            -> prints "pong" (a connection test)
#   ssh <host> "deploy <sha256>" < bundle.tgz  -> checks the bundle against the sha256 and installs it with the PINNED installer
#
# Anything else is refused.  There is no shell, no file copy and no port forwarding for this key.
#
set -uo pipefail

cmd="${SSH_ORIGINAL_COMMAND:-}"
log() { logger -t parkfnb-deploy -- "$*" 2>/dev/null || true; echo "$*" >&2; }

case "$cmd" in
  ping) echo pong; exit 0 ;;
  "deploy "*) sha="${cmd#deploy }" ;;
  *) log "refused: that command is not allowed"; exit 2 ;;
esac
[[ "$sha" =~ ^[0-9a-f]{64}$ ]] || { log "refused: the argument is not a sha256"; exit 2; }

umask 077
dir=/var/tmp/parkfnb-deploy
mkdir -p "$dir" && chmod 700 "$dir"
f="$dir/$sha.tgz"

# At most 100 MB from the client (a normal bundle is about 16 MB); more is cut off and then fails the checksum.
head -c 100000000 > "$f"
got="$(sha256sum "$f" | cut -d' ' -f1)"
if [ "$got" != "$sha" ]; then rm -f "$f"; log "refused: the bundle does not match its checksum"; exit 3; fi

# Only plain files, and only inside the app folder: no absolute paths, no "..", no links.
if tar -tzf "$f" 2>/dev/null | grep -Eq '(^/|(^|/)\.\.(/|$))' || tar -tvzf "$f" 2>/dev/null | grep -Eq '^[lh]'; then
  rm -f "$f"; log "refused: the bundle has an unsafe path or a link"; exit 4
fi

log "installing bundle $sha"
if sudo /usr/bin/bash /usr/local/sbin/parkfnb-update.sh "file://$f" "$sha"; then rc=0; else rc=$?; fi
rm -f "$f"
log "finished with exit code $rc"
exit "$rc"