#!/usr/bin/env bash
#
# One time, ON the server, as root:   sudo bash install-deploy-access.sh <public-key-file>
#
# Lets the GitHub deploy key (and nothing else) install new code:
#   1. /usr/local/bin/parkfnb-deploy       the forced command (parkfnb-deploy.sh)
#   2. /usr/local/sbin/parkfnb-update.sh   the installer, PINNED here: a bundle cannot replace it.  After a change to
#                                          deploy/update-ec2.sh in the repo, run this script again to update the pinned copy.
#   3. one line in /home/ubuntu/.ssh/authorized_keys that ties the key to the forced command
# To take the access away again: delete the line that ends in "parkfnb-github-deploy" from that file.
#
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"
pub="${1:?usage: sudo bash install-deploy-access.sh <public-key-file>}"
key="$(cat "$pub")"
case "$key" in ssh-ed25519\ *) ;; *) echo "That is not an ed25519 public key." >&2; exit 1 ;; esac

install -m 755 -o root -g root "$here/parkfnb-deploy.sh" /usr/local/bin/parkfnb-deploy
install -m 755 -o root -g root "$here/../update-ec2.sh" /usr/local/sbin/parkfnb-update.sh

auth=/home/ubuntu/.ssh/authorized_keys
blob="$(awk '{print $2}' <<<"$key")"
if grep -qF "$blob" "$auth"; then
  echo "The key is already in $auth: left as it is."
else
  printf 'command="/usr/local/bin/parkfnb-deploy",restrict %s\n' "$key" >> "$auth"
  echo "Key added to $auth (restricted to /usr/local/bin/parkfnb-deploy)."
fi
echo "Value for the GitHub secret DEPLOY_HOST_KEY (this server's own key; it stops anything else answering on its address):"
awk '{print $1" "$2}' /etc/ssh/ssh_host_ed25519_key.pub