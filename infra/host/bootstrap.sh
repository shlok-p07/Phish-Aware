#!/bin/bash
# First-boot setup for the PhishAware host (Amazon Linux 2023). The CDK stack
# prepends the files under /opt/phishaware and host.env before this runs.
set -euxo pipefail

APP=/opt/phishaware

# --- Swap. A t4g.small has 2 GiB of RAM, and the awareness model alone is a
# --- ~515 MB artifact; swap keeps a load spike from OOM-killing a container.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap defaults 0 0' >> /etc/fstab
fi

# --- Docker, with log rotation so container logs cannot fill the volume.
dnf install -y docker
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
systemctl enable --now docker

# --- Docker Compose v2 plugin (not packaged for AL2023), pinned and checksummed.
COMPOSE_VERSION=v2.29.7
COMPOSE_ASSET="docker-compose-linux-$(uname -m)"
PLUGINS=/usr/libexec/docker/cli-plugins
mkdir -p "$PLUGINS"
cd /tmp
curl -fsSLO "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/$COMPOSE_ASSET"
curl -fsSLO "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/$COMPOSE_ASSET.sha256"
sha256sum -c "$COMPOSE_ASSET.sha256"
install -m 0755 "$COMPOSE_ASSET" "$PLUGINS/docker-compose"
rm -f "$COMPOSE_ASSET" "$COMPOSE_ASSET.sha256"
docker compose version

# --- Daily readiness check. Replaces the Vercel cron: it proves the app can
# --- read MongoDB, and keeps a free-tier Atlas cluster from pausing.
cat > /etc/systemd/system/phishaware-readyz.service <<'UNIT'
[Unit]
Description=PhishAware readiness check (keeps Atlas awake)
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -o /dev/null --max-time 30 http://127.0.0.1:3000/api/readyz
UNIT
cat > /etc/systemd/system/phishaware-readyz.timer <<'UNIT'
[Unit]
Description=Run the PhishAware readiness check daily

[Timer]
OnCalendar=*-*-* 07:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now phishaware-readyz.timer

mkdir -p "$APP/models_store"
chmod 700 "$APP"
chmod 0755 "$APP/deploy.sh"
touch "$APP/.bootstrapped"

# First deploy. If the env parameter has not been pushed yet this fails, and the
# association runs it again after push-env.sh; first boot itself still succeeds.
"$APP/deploy.sh" || echo "First deploy did not complete; it will run again on the next deploy."
