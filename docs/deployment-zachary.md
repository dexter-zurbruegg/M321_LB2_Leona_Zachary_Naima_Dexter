# Statistik auf LernMAAS deployen

Status: Anleitung vorbereitet; echte VM-Tests stehen noch aus. Die Angaben in
`erklaerung-zachary.md` über bereits gemessene HA-Ergebnisse sind keine Nachweise
für diesen Branch. Testresultate erst nach eigener Durchführung protokollieren.

## Verbindungen

Browser → Gateway → Statistik-VM:8084 → TODO-VM:8082 und Kategorien-VM:8083.
Der Statistik-Service besitzt keine Datenbank. Das Gateway und die anderen
Services werden durch die jeweiligen Teammitglieder bereitgestellt.
Container-Namen wie `todo-service` funktionieren ohne gemeinsames Netzwerk nicht
zwischen VMs. Hier die erreichbaren privaten VM-IPs oder DNS-Namen einsetzen.

## Konfiguration auf der Statistik-VM

Voraussetzung: Docker Engine mit Compose-Plugin, ausgecheckter Feature-Zachary.
Im Repository-Hauptverzeichnis `.env.example` nach `.env` kopieren. Setzen:

```dotenv
JWT_SECRET=<derselbe sichere Wert wie bei Leona, Dexter und Naima>
STATS_PORT=8084
TODO_SERVICE_URL=http://<TODO-VM-IP>:8082
CATEGORY_SERVICE_URL=http://<KATEGORIEN-VM-IP>:8083
SERVICE_TIMEOUT_MS=2000
```

Das Secret ausserhalb von Git austauschen. `.env` bleibt lokal.
Direkte URLs enthalten kein `/api`; bei Verwendung des gemeinsamen Gateways
stattdessen `http://<GATEWAY-IP>:8080/api` verwenden. Kein `localhost` für andere VMs.
Firewall: TCP 8084 von der Gateway-VM erlauben; ausgehend TODO:8082 und
Kategorien:8083 erlauben. Die Datenbanken werden vom Statistik-Service nicht angesprochen.

```sh
cd services/stats-service
docker compose --env-file ../../.env config --quiet
docker compose --env-file ../../.env up -d --build
docker compose --env-file ../../.env ps
curl -i http://localhost:8084/health
```

Health prüft nur den Statistik-Prozess; ausgefallene Abhängigkeiten werden bei
`/stats` gemeldet. Logs: `docker compose --env-file ../../.env logs --tail=100`.
Der Container verwendet Node 22 und startet nach einem Prozessabsturz automatisch neu.

## Integration mit dem Team

Dexter/Leona setzen am Gateway `STATS_UPSTREAM_1=<STATS-VM-IP>:8084`.
Für eine zweite Instanz auf einer weiteren VM dieselbe Konfiguration starten und
`STATS_UPSTREAM_2=<ZWEITE-STATS-VM-IP>:8084` setzen. Beide Instanzen sind zustandslos.
Zweimal dieselbe Instanz einzutragen bietet keine Redundanz. Die Dienst-URLs können
auf einen Loadbalancer zeigen, falls die abhängigen Services mehrere Instanzen haben.

Alle Services verwenden JWT HS256, issuer `user-service`, sub als Benutzer-UUID
und exp als Ablaufzeit. VM-Uhren synchronisieren. TODO liefert ein JSON-Array
mit `status`, `categoryId`, `createdAt`, `completedAt`; Kategorien ein Array mit
`id`, `name`, `color`, `deletedAt`. Grundlage: `schnittstellen.md`.

## Abnahme auf den echten VMs (noch offen)

1. Von der Statistik-VM die Health-Endpunkte der TODO- und Kategorien-VM aufrufen.
2. Über Leona registrieren/anmelden. Mit diesem Token testen (nicht in Git speichern):

```sh
curl -i -H "Authorization: Bearer $TOKEN" http://<STATS-VM-IP>:8084/stats
curl -i -H "Authorization: Bearer $TOKEN" http://<GATEWAY-IP>:8080/api/stats
```

3. Bekannte TODOs anlegen: 1 h und 3 h Erledigungsdauer ergeben 7200 Sekunden.
   Ein neuer Benutzer erhält total 0 und averageCompletionSeconds null.
   Ein zweiter Benutzer darf die TODOs des ersten nicht in seiner Statistik sehen.
4. Kategorien-Service gezielt abschalten: weiterhin 200, categoriesAvailable false.
5. TODO-Service abschalten: 503 mit deutscher Meldung innerhalb des Timeout-Budgets
   (bei Verbindungsfehler maximal zwei Versuche). Beide Services wieder starten.
6. Bei zwei Statistik-Instanzen eine stoppen: Gateway liefert weiter 200;
   X-Instance kontrollieren. Separat automatischen Wiederanlauf nach Prozessabsturz prüfen.
7. Datum, VM-Adressen, Commit, Soll/Ist, Antwortzeiten und Logs protokollieren.

Frontend-Integration ist erst vollständig, wenn das gemeinsame Frontend auch
`api.js`, `ui.js` und das Routing für `pages/stats.js` bereitstellt; diese gemeinsamen
Dateien liegen derzeit nicht auf diesem Branch.
