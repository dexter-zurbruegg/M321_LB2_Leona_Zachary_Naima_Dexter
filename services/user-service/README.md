# user-service (Leona)

Registrieren, Login (JWT), Profil ändern, Konto löschen. Vertrag: `docs/schnittstellen.md` (Abschnitt 2 und 1.1).
Node 22 · Express 5 · PostgreSQL (eigene Datenbank pro Service) · Port 8081 (im Container 3000).

## Auf der LernMAAS-VM starten (Variante 2)
```bash
cd ~/m321/services/user-service && TODO_SERVICE_URL=http://10.4.31.13:8082 CATEGORY_SERVICE_URL=http://10.4.31.11:8083 docker compose --env-file ../../.env up -d --build
```
Nach ca. 20 s: `docker compose ps && curl -s localhost:8081/health`
Erwartet: beide Container `(healthy)` und `{"status":"ok","service":"user-service",…,"db":"ok"}`.

## Tests
```bash
npm ci
npm test                                   # 4 Unit-Tests; die 14 Integrationstests werden ohne Datenbank übersprungen
TEST_DATABASE_URL=postgres://app:pw@localhost:5432/users_test npm test     # alle 18 Tests, brauchen eine leere PostgreSQL-Datenbank
```
Die Integrationstests ersetzen TODO- und Kategorien-Service durch Fake-Server. Sie löschen die Tabelle `users` der Test-Datenbank.
