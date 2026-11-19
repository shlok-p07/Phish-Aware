#!/bin/bash
# Pulls the images the stack currently points at and (re)starts everything.
#
# Runs on the instance, from two places: once at the end of first boot, and
# every time the SSM State Manager association "phishaware-deploy" fires, which
# CloudFormation triggers whenever `cdk deploy` publishes new images. Safe to
# run any number of times; concurrent runs queue on a lock.
set -euo pipefail

APP=/opt/phishaware
exec 9>/var/lock/phishaware-deploy.lock
flock 9

# The association can fire before first-boot setup has installed Docker.
for _ in $(seq 1 90); do
  [ -f "$APP/.bootstrapped" ] && break
  sleep 10
done
if [ ! -f "$APP/.bootstrapped" ]; then
  echo "Host setup has not finished after 15 minutes; see /var/log/cloud-init-output.log" >&2
  exit 1
fi

# REGION, PARAM_PREFIX and MODEL_BUCKET, written by user data.
# shellcheck source=/dev/null
. "$APP/host.env"

param() {
  aws ssm get-parameter --region "$REGION" --name "$PARAM_PREFIX/$1" \
    --with-decryption --query Parameter.Value --output text
}

WEB_IMAGE=$(param web-image)
ML_IMAGE=$(param ml-image)
SITE_ADDRESS=$(param site-address)
# "none", or hostnames that redirect to SITE_ADDRESS (www.<domain> for a bare domain).
SITE_ALIASES=$(param site-aliases)

umask 077

# The app's secrets, pushed by infra/scripts/push-env.sh. Without them the app
# cannot reach MongoDB, so stop here rather than start something broken.
if ! param web-env > "$APP/web.env.tmp"; then
  rm -f "$APP/web.env.tmp"
  echo "SSM parameter $PARAM_PREFIX/web-env is missing. Run infra/scripts/push-env.sh first." >&2
  exit 1
fi
# The host owns these three: the ML service is on the compose network, and the
# public origin is whatever Caddy serves.
grep -vE '^[[:space:]]*(export[[:space:]]+)?(ML_SERVICE_URL|APP_BASE_URL|NEXT_PUBLIC_SITE_URL)=' \
  "$APP/web.env.tmp" > "$APP/web.env" || true
rm -f "$APP/web.env.tmp"
{
  echo "ML_SERVICE_URL=http://ml:8001"
  echo "APP_BASE_URL=https://$SITE_ADDRESS"
  echo "NEXT_PUBLIC_SITE_URL=https://$SITE_ADDRESS"
} >> "$APP/web.env"

# Optional ML overrides; the service's defaults are fine without them.
if ! param ml-env > "$APP/ml.env" 2>/dev/null; then
  echo "ENVIRONMENT=production" > "$APP/ml.env"
fi

printf 'WEB_IMAGE=%s\nML_IMAGE=%s\n' "$WEB_IMAGE" "$ML_IMAGE" > "$APP/images.env"

mkdir -p "$APP/caddy"
{
  printf '%s {\n\tencode zstd gzip\n\treverse_proxy web:3000\n}\n' "$SITE_ADDRESS"
  if [ "$SITE_ALIASES" != "none" ]; then
    printf '\n%s {\n\tredir https://%s{uri} permanent\n}\n' "$SITE_ALIASES" "$SITE_ADDRESS"
  fi
} > "$APP/caddy/Caddyfile"
chmod 0644 "$APP/caddy/Caddyfile"
chmod 0755 "$APP/caddy"

# The model artifact is not in the image or the repo; infra/scripts/upload-model.sh
# puts it in S3. Without it the ML service still starts, and onboarding falls
# back to diagnostic-quiz accuracy.
aws s3 sync "s3://$MODEL_BUCKET/models_store/" "$APP/models_store/" \
  --region "$REGION" --delete --only-show-errors

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${WEB_IMAGE%%/*}"

cd "$APP"
docker compose --env-file images.env pull --quiet
docker compose --env-file images.env up -d --remove-orphans
# Picks up a changed Caddyfile without dropping connections; a no-op otherwise.
docker compose --env-file images.env exec -T caddy caddy reload --config /etc/caddy/Caddyfile \
  || echo "Caddy reload failed; a freshly started Caddy has already read the new file." >&2
# Old image versions are the main thing that fills the disk.
docker image prune -af > /dev/null

echo "Deployed $WEB_IMAGE and $ML_IMAGE at https://$SITE_ADDRESS"
