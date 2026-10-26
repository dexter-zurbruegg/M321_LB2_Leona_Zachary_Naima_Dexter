#!/usr/bin/env bash
# Ausfalltests (N06) für die Docker-Compose-Variante. Verantwortlich: Naima + Zachary.
# Läuft auf der VM, auf der "docker compose up" gestartet wurde:
#   ./scripts/ha-test.sh                     (BASE_URL bei Bedarf setzen, Standard http://localhost:8080)
# Gibt am Ende eine Markdown-Tabelle aus, die direkt ins Testprotokoll (docs/testprotokoll.md) passt.
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:8080}
RESULTS=()
STOPPED=()
FAILED=0
TOKEN=''
# Jeder Netzwerkaufruf und jede Wiederherstellung hat ein Zeitlimit.
curl() { command curl --connect-timeout 2 --max-time 12 "$@"; }
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [ "${#STOPPED[@]}" -gt 0 ]; then
    docker start "${STOPPED[@]}" >/dev/null || rc=1
  fi
  if [ -n "$TOKEN" ]; then
    # Nur das in diesem Lauf erzeugte Testkonto und dessen Daten entfernen.
    if ! wait_ok categories || ! wait_ok todos; then
      echo 'Testkonto konnte wegen fehlender Dienste nicht bereinigt werden.' >&2
      rc=1
    else
      code=$(status -X DELETE "$BASE_URL/api/users/me") || code=000
      [ "$code" = 204 ] || { echo "Testkonto-Bereinigung: HTTP $code" >&2; rc=1; }
    fi
  fi
  printf '\n| Test | Vorgehen | Ergebnis | Status |\n|---|---|---|---|\n'
  [ "${#RESULTS[@]}" -eq 0 ] || printf '%s\n' "${RESULTS[@]}"
  [ "$FAILED" -eq 0 ] || rc=1
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
stop_for_test() { STOPPED+=("$@"); docker stop "$@" >/dev/null; }
# Auf einer Einzelservice-Installation nicht versehentlich andere Container stoppen.
for target in todo-service-1 todo-service-2 category-service-1 category-service-2 db; do
  [ "$(docker inspect -f '{{.State.Running}}' "$target")" = true ] || { echo "$target läuft nicht; Abbruch vor dem Test." >&2; exit 1; }
  [ "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$target")" = todo-app ] || { echo "Unerwartetes Compose-Projekt: $target" >&2; exit 1; }
done

c() { echo "$1"; }                                  # Containername, z. B. todo-service-1
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
record() { RESULTS+=("| $1 | $2 | $3 | $4 |"); printf '   -> %s: %s\n' "$4" "$3"; if [ "$4" != OK ]; then FAILED=1; fi; }
status() { curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" "$@"; }
now_ms() { date +%s%3N; }
# nach einem "docker start" warten, bis der Service über den Proxy wieder antwortet
wait_ok() {
  local deadline=$((SECONDS+60)) code
  while (( SECONDS < deadline )); do
    code=$(status "$BASE_URL/api/$1") || code=000
    [ "$code" != 200 ] || return 0
    sleep 0.5
  done
  echo "Timeout beim Warten auf $1" >&2
  return 1
}

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
stop_for_test "$(c todo-service-1)"
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
STOPPED+=("$target")
docker exec "$target" sh -c 'kill -9 $(pgrep -f "node src/server.js")' || true
deadline=$((SECONDS+60))
until [ "$(docker inspect -f '{{.RestartCount}}' "$target")" -gt "$before" ] && docker exec "$target" wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1; do
  (( SECONDS < deadline )) || { echo "Timeout: $target startet nicht neu" >&2; exit 1; }
  sleep 0.2
done
ms=$(( $(now_ms) - start ))
after=$(docker inspect -f '{{.RestartCount}}' "$target")
record HA-03 "kill -9 auf Node-Prozess" "Docker hat neu gestartet (RestartCount $before -> $after), wieder gesund nach $((ms/1000)).$(( (ms%1000)/100 )) s" "$([ "$after" -gt "$before" ] && echo OK || echo FEHLER)"

# ---------------------------------------------------------------------------------------------
say "HA-04 Kategorien-Service komplett weg (beide Instanzen): TODOs + Statistik laufen weiter"
stop_for_test "$(c category-service-1)" "$(c category-service-2)"
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
stop_for_test "$(c todo-service-1)" "$(c todo-service-2)"
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
STOPPED+=("$(c db)")
docker restart "$(c db)" >/dev/null
start=$(now_ms)
wait_ok todos
ms=$(( $(now_ms) - start ))
count_after=$(curl -s -H "authorization: Bearer $TOKEN" "$BASE_URL/api/todos" | grep -o '"id"' | wc -l)
record HA-06 "docker restart db" "$count_before TODOs vorher, $count_after nachher; API wieder bereit nach $((ms/1000)) s" \
  "$([ "$count_before" = "$count_after" ] && [ "$count_after" -gt 0 ] && echo OK || echo FEHLER)"

# warten, bis alles wieder gesund ist
sleep 12

# EXIT-Trap stellt Dienste wieder her, bereinigt Testdaten und gibt die Tabelle aus.
