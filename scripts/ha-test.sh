#!/usr/bin/env bash
# Ausfalltests (N06) für die Docker-Compose-Variante. Verantwortlich: Naima + Zachary.
# Läuft auf der VM, auf der "docker compose up" gestartet wurde:
#   ./scripts/ha-test.sh                     (BASE_URL bei Bedarf setzen, Standard http://localhost:8080)
# Gibt am Ende eine Markdown-Tabelle aus, die direkt ins Testprotokoll (docs/testprotokoll.md) passt.
set -uo pipefail

BASE_URL=${BASE_URL:-http://localhost:8080}
RESULTS=()

c() { echo "$1"; }                                  # Containername, z. B. todo-service-1
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
record() { RESULTS+=("| $1 | $2 | $3 | $4 |"); printf '   -> %s: %s\n' "$4" "$3"; }
status() { curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" "$@"; }
now_ms() { date +%s%3N; }
# nach einem "docker start" warten, bis der Service über den Proxy wieder antwortet
wait_ok() { until [ "$(status "$BASE_URL/api/$1")" = 200 ]; do sleep 0.5; done; }

# Testbenutzer anlegen (ohne jq: Token mit sed aus der JSON-Antwort holen)
EMAIL="ha-$(date +%s)@example.com"
curl -s -o /dev/null -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"geheim1234\",\"displayName\":\"HA\"}" "$BASE_URL/api/users"
TOKEN=$(curl -s -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"geheim1234\"}" \
  "$BASE_URL/api/auth/login" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "Login fehlgeschlagen - läuft das System unter $BASE_URL?"; exit 1; }
CAT_ID=$(curl -s -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"name":"HA-Test"}' \
  "$BASE_URL/api/categories" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')

# ---------------------------------------------------------------------------------------------
say "HA-01 Lastverteilung: 20 Anfragen an den TODO-Service, welche Instanz antwortet?"
instances=$(for i in $(seq 20); do
  curl -s -D - -o /dev/null -H "authorization: Bearer $TOKEN" "$BASE_URL/api/todos" | sed -n 's/^[Xx]-[Ii]nstance: *//p' | tr -d '\r'
done | sort | uniq -c | awk '{printf "%s× %s, ", $1, $2}' | sed 's/, $//')
echo "   $instances"
n=$(echo "$instances" | grep -o '×' | wc -l)
record HA-01 "20x GET /api/todos" "Antworten verteilt auf $n Instanzen ($instances)" "$([ "$n" -ge 2 ] && echo OK || echo FEHLER)"

# ---------------------------------------------------------------------------------------------
say "HA-02 Eine Instanz fällt aus: todo-service-1 stoppen, 20 Anfragen müssen trotzdem klappen"
docker stop "$(c todo-service-1)" >/dev/null
ok=0; for i in $(seq 20); do [ "$(status "$BASE_URL/api/todos")" = 200 ] && ok=$((ok+1)); done
code=$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"während Ausfall erstellt"}' "$BASE_URL/api/todos")
docker start "$(c todo-service-1)" >/dev/null; wait_ok todos
record HA-02 "todo-service-1 gestoppt, 20x GET + 1x POST" "$ok/20 GET erfolgreich, POST -> $code" "$([ $ok = 20 ] && [ "$code" = 201 ] && echo OK || echo FEHLER)"

# ---------------------------------------------------------------------------------------------
say "HA-03 Absturz: Node-Prozess in category-service-2 mit kill -9 beenden, Zeit bis wieder gesund"
target=$(c category-service-2)
before=$(docker inspect -f '{{.RestartCount}}' "$target")
start=$(now_ms)
docker exec "$target" sh -c 'kill -9 $(pgrep -f "node src/server.js")'
until docker exec "$target" wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1; do sleep 0.2; done
ms=$(( $(now_ms) - start ))
after=$(docker inspect -f '{{.RestartCount}}' "$target")
record HA-03 "kill -9 auf Node-Prozess" "Docker hat neu gestartet (RestartCount $before -> $after), wieder gesund nach $((ms/1000)).$(( (ms%1000)/100 )) s" "$([ "$after" -gt "$before" ] && echo OK || echo FEHLER)"

# ---------------------------------------------------------------------------------------------
say "HA-04 Kategorien-Service komplett weg (beide Instanzen): TODOs + Statistik laufen weiter"
docker stop "$(c category-service-1)" "$(c category-service-2)" >/dev/null
list=$(status "$BASE_URL/api/todos")
body=$(curl -s -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"title\":\"mit Kategorie\",\"categoryId\":\"$CAT_ID\"}" -w ' %{http_code}' "$BASE_URL/api/todos")
stats=$(curl -s -H "authorization: Bearer $TOKEN" "$BASE_URL/api/stats")
docker start "$(c category-service-1)" "$(c category-service-2)" >/dev/null; wait_ok categories
echo "   POST mit Kategorie: $body"
avail=$(echo "$stats" | grep -o '"categoriesAvailable":[a-z]*')
record HA-04 "beide category-service gestoppt" "GET /todos -> $list; POST mit Kategorie -> ${body##* } (verständliche Meldung); /stats -> $avail" \
  "$([ "$list" = 200 ] && [ "${body##* }" = 503 ] && [ "$avail" = '"categoriesAvailable":false' ] && echo OK || echo FEHLER)"

# ---------------------------------------------------------------------------------------------
say "HA-05 TODO-Service komplett weg: Statistik meldet verständlichen Fehler statt zu hängen"
docker stop "$(c todo-service-1)" "$(c todo-service-2)" >/dev/null
start=$(now_ms)
body=$(curl -s -H "authorization: Bearer $TOKEN" -w ' %{http_code}' "$BASE_URL/api/stats")
ms=$(( $(now_ms) - start ))
docker start "$(c todo-service-1)" "$(c todo-service-2)" >/dev/null; wait_ok todos
echo "   $body"
record HA-05 "beide todo-service gestoppt, GET /stats" "${body##* } nach ${ms} ms: $(echo "$body" | sed -n 's/.*"message":"\([^"]*\)".*/\1/p')" \
  "$([ "${body##* }" = 503 ] && [ $ms -lt 5000 ] && echo OK || echo FEHLER)"

# ---------------------------------------------------------------------------------------------
say "HA-06 Datenbank-Neustart (N04): Daten bleiben erhalten, Services verbinden sich neu"
count_before=$(curl -s -H "authorization: Bearer $TOKEN" "$BASE_URL/api/todos" | grep -o '"id"' | wc -l)
docker restart "$(c db)" >/dev/null
start=$(now_ms)
until [ "$(status "$BASE_URL/api/todos")" = 200 ]; do sleep 0.5; done
ms=$(( $(now_ms) - start ))
count_after=$(curl -s -H "authorization: Bearer $TOKEN" "$BASE_URL/api/todos" | grep -o '"id"' | wc -l)
record HA-06 "docker restart db" "$count_before TODOs vorher, $count_after nachher; API wieder bereit nach $((ms/1000)) s" \
  "$([ "$count_before" = "$count_after" ] && [ "$count_after" -gt 0 ] && echo OK || echo FEHLER)"

# warten, bis alles wieder gesund ist
sleep 12

echo
echo "| Test | Vorgehen | Ergebnis | Status |"
echo "|---|---|---|---|"
printf '%s\n' "${RESULTS[@]}"
