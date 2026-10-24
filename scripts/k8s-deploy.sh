#!/usr/bin/env bash
# Deployment auf Kubernetes (LernMAAS: microk8s). Baut die Images, lädt sie in den Cluster, legt das Secret an
# und wendet die Manifeste an. Danach: http://<vm-ip>:30080
#   ./scripts/k8s-deploy.sh                  # microk8s (Standard)
#   KUBECTL="kubectl" CTR="sudo k3s ctr" ./scripts/k8s-deploy.sh   # k3s (LernMAAS-Variante m321k3s)
set -euo pipefail
cd "$(dirname "$0")/.."
KUBECTL=${KUBECTL:-microk8s kubectl}
CTR=${CTR:-microk8s ctr}

# Das alte Einzel-Datenbank-Deployment darf den eingerichteten HA-Cluster nicht ersetzen.
if $KUBECTL get cluster.postgresql.cnpg.io todo-pg -n todo-app >/dev/null 2>&1; then
  echo "HA-Cluster todo-pg vorhanden: deploy/ha verwenden; dieses Skript ist nur fuer die lokale Variante." >&2
  exit 1
fi

[ -f .env ] || ./scripts/init-env.sh

echo "== Images bauen"
docker compose build

echo "== Images in den Cluster laden (kein Registry nötig)"
for img in db user-service todo-service category-service stats-service gateway; do
  docker save "todo-app/$img:1.0" | $CTR image import - >/dev/null
  echo "   todo-app/$img:1.0"
done

echo "== Namespace + Secret aus .env (Secrets landen nie im Repo)"
$KUBECTL apply -f deploy/k8s/00-namespace.yaml
$KUBECTL -n todo-app create secret generic todo-app-secrets --from-env-file=.env --dry-run=client -o yaml | $KUBECTL apply -f -

echo "== Manifeste anwenden"
$KUBECTL apply -k deploy/k8s
$KUBECTL -n todo-app rollout status deploy --timeout=180s
$KUBECTL -n todo-app get pods -o wide
echo "Fertig: http://<vm-ip>:30080"
