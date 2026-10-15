#!/usr/bin/env bash
# Legt einen Demo-Benutzer mit Kategorien und TODOs an (für die Präsentation).
#   BASE_URL=http://<vm-ip>:8080 ./scripts/demo-daten.sh
# Login danach: demo@example.com / demo12345
set -euo pipefail
BASE_URL=${BASE_URL:-http://localhost:8080}
EMAIL=${EMAIL:-demo@example.com}
PASSWORD=${PASSWORD:-demo12345}

post() { curl -s -H 'content-type: application/json' ${TOKEN:+-H "authorization: Bearer $TOKEN"} -d "$2" "$BASE_URL/api$1"; }
patch() { curl -s -o /dev/null -X PATCH -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" -d "$2" "$BASE_URL/api$1"; }
id_of() { sed -n 's/^{"id":"\([^"]*\)".*/\1/p'; }

post /users "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"Demo\"}" >/dev/null
TOKEN=$(post /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "Login fehlgeschlagen"; exit 1; }

schule=$(post /categories '{"name":"Schule","color":"#2f6fed"}' | id_of)
haushalt=$(post /categories '{"name":"Haushalt","color":"#2e7d32"}' | id_of)
freizeit=$(post /categories '{"name":"Freizeit","color":"#c2185b"}' | id_of)

post /todos "{\"title\":\"M321 Präsentation üben\",\"priority\":\"high\",\"categoryId\":\"$schule\"}" >/dev/null
t=$(post /todos "{\"title\":\"Schnittstellen dokumentieren\",\"priority\":\"high\",\"categoryId\":\"$schule\"}" | id_of)
patch "/todos/$t" '{"status":"done"}'
t=$(post /todos "{\"title\":\"Ausfalltests protokollieren\",\"categoryId\":\"$schule\"}" | id_of)
patch "/todos/$t" '{"status":"in_progress"}'
t=$(post /todos "{\"title\":\"Wäsche waschen\",\"priority\":\"low\",\"categoryId\":\"$haushalt\"}" | id_of)
patch "/todos/$t" '{"status":"done"}'
post /todos "{\"title\":\"Einkaufen\",\"description\":\"Milch, Brot, Äpfel\",\"categoryId\":\"$haushalt\"}" >/dev/null
post /todos "{\"title\":\"Velo flicken\",\"priority\":\"low\",\"categoryId\":\"$freizeit\"}" >/dev/null
post /todos '{"title":"Zahnarzt anrufen"}' >/dev/null
echo "Demo-Daten angelegt. Login: $EMAIL / $PASSWORD"
