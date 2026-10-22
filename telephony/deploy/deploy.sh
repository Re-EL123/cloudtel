#!/usr/bin/env bash
# Deploy the CloudTel telephony stack on a Docker host.
#
# Prerequisites:
#   - Docker + Compose v2
#   - A TLS certificate for $SIP_DOMAIN in /etc/letsencrypt/live/$SIP_DOMAIN
#   - Ports 8089/tcp and 10000-20000/udp reachable from the internet
#
# Usage: cp .env.example .env && edit .env && ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "deploy: .env is required (copy .env.example)" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${SIP_DOMAIN:?SIP_DOMAIN is required}"
: "${PUBLIC_IP:?PUBLIC_IP is required}"
: "${ARI_PASSWORD:?ARI_PASSWORD is required}"
: "${PBX_API_PASSWORD:?PBX_API_PASSWORD is required}"

if [[ ! -f "/etc/letsencrypt/live/${SIP_DOMAIN}/fullchain.pem" ]]; then
  echo "deploy: missing certificate for ${SIP_DOMAIN}." >&2
  echo "        issue one first, e.g.:" >&2
  echo "        sudo certbot certonly --webroot -w /var/www/certbot -d ${SIP_DOMAIN}" >&2
  exit 1
fi

# Copy the certificate to a path the unprivileged Asterisk user can read.
install -d -m 755 certs
install -m 644 "/etc/letsencrypt/live/${SIP_DOMAIN}/fullchain.pem" certs/fullchain.pem
install -m 640 "/etc/letsencrypt/live/${SIP_DOMAIN}/privkey.pem" certs/privkey.pem
chown 1000:1000 certs/fullchain.pem certs/privkey.pem

render() {
  sed -i \
    -e "s|__SIP_HOST__|${SIP_DOMAIN}|g" \
    -e "s|__PUBLIC_IP__|${PUBLIC_IP}|g" \
    -e "s|__ARI_PASSWORD__|${ARI_PASSWORD}|g" \
    "$1"
}

render asterisk/pjsip.conf
render asterisk/ari.conf

docker compose pull asterisk
docker compose build pbx-admin ari-bridge
docker compose up -d --remove-orphans
docker compose ps
