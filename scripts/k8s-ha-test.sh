#!/usr/bin/env bash
# Ausfalltests (N06) für die Kubernetes-Variante (microk8s). Verantwortlich: Naima + Zachary.
#   BASE_URL=http://<vm-ip>:30080 ./scripts/k8s-ha-test.sh
set -uo pipefail
BASE_URL=${BASE_URL:-http://localhost:30080}
KUBECTL=${KUBECTL:-microk8s kubectl}
k() { $KUBECTL -n todo-app "$@"; }
RESULTS=()
record() { RESULTS+=("| $1 | $2 | $3 | $4 |"); printf '   -> %s: %s\n' "$4" "$3"; }
status() { curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" "$@"; }
now_ms() { date +%s%3N; }
pod_of() { k get pods -l app="$1" -o jsonpath='{.items[0].metadata.name}'; }
ready_count() { k get deploy "$1" -o jsonpath='{.status.readyReplicas}'; }

EMAIL="k8s-ha-$(date +%s)@example.com"
curl -s -o /dev/null -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"geheim1234\",\"displayName\":\"HA\"}" "$BASE_URL/api/users"
TOKEN=$(curl -s -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"geheim1234\"}" \
  "$BASE_URL/api/auth/login" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "Login fehlgeschlagen - läuft das System unter $BASE_URL?"; exit 1; }
# ein Test-TODO anlegen (bei Bedarf wiederholen, falls gerade noch ein Rollout läuft)
until [ "$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"K8s-Test"}' "$BASE_URL/api/todos")" = 201 ]; do sleep 1; done

echo "== K8S-01 Pod löschen: Anfragen laufen weiter, Kubernetes ersetzt den Pod"
pod=$(pod_of todo-service)
k delete pod "$pod" --wait=false >/dev/null
start=$(now_ms); ok=0
for i in $(seq 20); do [ "$(status "$BASE_URL/api/todos")" = 200 ] && ok=$((ok+1)); done
until ! k get pod "$pod" >/dev/null 2>&1 && [ "$(ready_count todo-service)" = 2 ]; do sleep 0.5; done
ms=$(( $(now_ms) - start ))
record K8S-01 "kubectl delete pod $pod" "$ok/20 Anfragen OK während Ausfall, wieder 2/2 bereit nach $((ms/1000)) s" "$([ $ok = 20 ] && echo OK || echo FEHLER)"

echo "== K8S-02 Absturz: kill -9 im Container, Kubernetes startet den Container neu"
pod=$(pod_of category-service)
before=$(k get pod "$pod" -o jsonpath='{.status.containerStatuses[0].restartCount}')
start=$(now_ms)
k exec "$pod" -- sh -c 'kill -9 $(pgrep -f "node src/server.js")'
sleep 1
until [ "$(k get pod "$pod" -o jsonpath='{.status.containerStatuses[0].ready}')" = true ]; do sleep 0.5; done
ms=$(( $(now_ms) - start ))
after=$(k get pod "$pod" -o jsonpath='{.status.containerStatuses[0].restartCount}')
record K8S-02 "kill -9 in $pod" "Restarts $before -> $after, wieder bereit nach $((ms/1000)) s" "$([ "$after" -gt "$before" ] && echo OK || echo FEHLER)"

echo "== K8S-03 Datenbank-Pod löschen: Daten liegen im PersistentVolume und bleiben erhalten (N04)"
before=$(curl -s -H "authorization: Bearer $TOKEN" "$BASE_URL/api/todos" | grep -o '"id"' | wc -l)
k delete pod "$(pod_of db)" >/dev/null
start=$(now_ms)
until [ "$(status "$BASE_URL/api/todos")" = 200 ]; do sleep 1; done
ms=$(( $(now_ms) - start ))
after=$(curl -s -H "authorization: Bearer $TOKEN" "$BASE_URL/api/todos" | grep -o '"id"' | wc -l)
record K8S-03 "kubectl delete pod (db)" "$before TODOs vorher, $after nachher; API wieder bereit nach $((ms/1000)) s" "$([ "$before" = "$after" ] && [ "$after" -gt 0 ] && echo OK || echo FEHLER)"

echo
echo "| Test | Vorgehen | Ergebnis | Status |"
echo "|---|---|---|---|"
printf '%s\n' "${RESULTS[@]}"
