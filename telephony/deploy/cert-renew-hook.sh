#!/bin/sh
# certbot deploy hook: publish the renewed certificate for the Asterisk
# container and restart it so the WSS transport picks up the new files.
set -e
DEST=/opt/cloudtel-telephony/deploy/certs
LINEAGE="${RENEWED_LINEAGE:-/etc/letsencrypt/live/__SIP_HOST__}"

install -d -m 755 "$DEST"
install -m 644 "$LINEAGE/fullchain.pem" "$DEST/fullchain.pem"
install -m 640 "$LINEAGE/privkey.pem" "$DEST/privkey.pem"
chown 1000:1000 "$DEST/fullchain.pem" "$DEST/privkey.pem"
docker restart cloudtel-asterisk >/dev/null
