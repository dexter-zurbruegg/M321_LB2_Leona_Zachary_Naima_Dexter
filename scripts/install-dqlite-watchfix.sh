#!/bin/sh
# Rolling repair for MicroK8s 1.35.6 / k8s-dqlite v1.8.1.
# Build official v1.8.1 with deploy/ha/k8s-dqlite-watch.patch (upstream PR #365):
#   git clone --branch v1.8.1 https://github.com/canonical/k8s-dqlite.git
#   cd k8s-dqlite && git apply /path/to/k8s-dqlite-watch.patch
#   bash hack/deps.sh && make bin/static/k8s-dqlite
#   GOTOOLCHAIN=go1.24.13 hack/static-go-build.sh -o bin/static/k8s-dqlite ./k8s-dqlite.go
#   GOTOOLCHAIN=go1.24.13 hack/static-go-test.sh -p 1 -timeout 180s ./test -run TestWatch
# Installed build SHA256: 2fe34ebb74d621963816f39e22cfabad5d2a0f0071f40605bcc66e236fc9cc7e
# Run on ONE VM at a time: sudo sh install-dqlite-watchfix.sh BINARY SHA256
# The snap is unchanged. Rollback: move this drop-in out of its directory,
# systemctl daemon-reload, restart the two services. No datastore restore needed.
set -eu
[ "$(id -u)" = 0 ]
[ "$#" = 2 ] || { echo 'Expected binary path and verified SHA256' >&2; exit 1; }
printf '%s  %s\n' "$2" "$1" | sha256sum --check --status
systemctl stop m321-watchdog.timer 2>/dev/null || true
for i in $(seq 1 45); do
  systemctl is-active --quiet m321-watchdog.service || break
  sleep 2
done
if systemctl is-active --quiet m321-watchdog.service; then
  systemctl start m321-watchdog.timer
  exit 1
fi
install -d -m 755 /usr/local/lib/m321
install -m 755 "$1" /usr/local/lib/m321/k8s-dqlite-watchfix
install -d -m 755 /etc/systemd/system/snap.microk8s.daemon-k8s-dqlite.service.d
cat > /etc/systemd/system/snap.microk8s.daemon-k8s-dqlite.service.d/m321-watchfix.conf <<'UNIT'
[Service]
ExecStart=
ExecStart=/usr/local/lib/m321/k8s-dqlite-watchfix --storage-dir=/var/snap/microk8s/current/var/kubernetes/backend/ --listen=unix:///var/snap/microk8s/current/var/kubernetes/backend/kine.sock:12379
UNIT
systemctl daemon-reload
systemctl restart snap.microk8s.daemon-k8s-dqlite
sleep 3
systemctl restart snap.microk8s.daemon-kubelite
for i in $(seq 1 25); do
  if /snap/bin/microk8s kubectl get --raw /readyz --request-timeout=3s >/dev/null 2>&1 && python3 /usr/local/sbin/m321-watchdog.py --check; then
    systemctl start m321-watchdog.timer
    echo 'API and watch healthy after upstream repair'
    exit 0
  fi
  sleep 2
done
echo 'API has not recovered; inspect logs and rollback the drop-in if required' >&2
exit 1
