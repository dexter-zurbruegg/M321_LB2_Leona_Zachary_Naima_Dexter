#!/bin/sh
# Auf jeder Team-VM aus diesem Repository aufrufen.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sudo install -m 755 "$script_dir/microk8s-watchdog.py" /usr/local/sbin/m321-watchdog.py
sudo tee /etc/systemd/system/m321-watchdog.service >/dev/null <<'UNIT'
[Unit]
Description=Recover MicroK8s dqlite watch stalls (upstream issue 364)
After=snap.microk8s.daemon-k8s-dqlite.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /usr/local/sbin/m321-watchdog.py
TimeoutStartSec=90
UNIT
sudo tee /etc/systemd/system/m321-watchdog.timer >/dev/null <<'UNIT'
[Unit]
Description=Check local Kubernetes watch delivery
[Timer]
OnBootSec=60s
OnUnitInactiveSec=15s
RandomizedDelaySec=3s
AccuracySec=1s
[Install]
WantedBy=timers.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now m321-watchdog.timer
sudo systemctl start --no-block m321-watchdog.service
