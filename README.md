# M321 LB2: Verteilte TODO-App

Gruppe **Leona, Zachary, Naima, Dexter** · Modul 321 «Verteilte Systeme programmieren» · TBZ AP23a

Eine TODO-Applikation aus **vier eigenständigen Backend-Services**, einem gemeinsamen **Web-Frontend** und einem **Reverse Proxy / Loadbalancer**.
Jeder Service läuft in **zwei Instanzen**. Abgestürzte Container startet Docker bzw. Kubernetes automatisch neu.

| Komponente | Verantwortlich | Ordner | Aufgabe |
|---|---|---|---|
| Benutzer-Service | Leona | [`services/user-service`](services/user-service) | Registrieren, Login (JWT), Profil, Konto löschen |
| TODO-Service | Dexter | [`services/todo-service`](services/todo-service) | TODOs CRUD, Status, Priorität, Kategorie, Filter/Suche |
| Kategorien-Service | Naima | [`services/category-service`](services/category-service) | Kategorien CRUD mit Farbe, Soft-Delete, Prüf-Endpunkt |
| Statistik-Service | Zachary | [`services/stats-service`](services/stats-service) | Anzahl offen/erledigt, Ø Erledigungsdauer, pro Kategorie |
| Frontend | alle (je eine Seite) | [`frontend`](frontend) | eine Weboberfläche für alles, Desktop + Mobile |
| Reverse Proxy | Dexter + Leona | [`gateway`](gateway) | nginx: einziger Einstieg, Lastverteilung, Failover |
| Ausfalltests | Naima + Zachary | [`scripts/ha-test.sh`](scripts/ha-test.sh) | dokumentierte HA-Tests |

**Termine:** Abgabe Projektarbeit **Mo 26.10.2026** · Testing (freiwillig, Zusatzpunkte) und **Demo Mo 02.11.2026**

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/dokumentation.md](docs/dokumentation.md) | **Abgabe-Dokumentation** (Aufbau gemäss Auftrag LB2) |
| [docs/schnittstellen.md](docs/schnittstellen.md) | API-Verträge aller Services, JWT-Format, Fehlerformat |
| [docs/testprotokoll.md](docs/testprotokoll.md) | Testumgebung, Testfälle, Ergebnisse, Ausfalltests |
| [docs/architektur.md](docs/architektur.md) | Die Architektur auf einer Seite erklärt |
| [docs/praesentation.md](docs/praesentation.md) | Ablauf Präsentation + Demo, wer zeigt was |
| `docs/erklaerung-<name>.md` | Erklär-Doku pro Person: [Leona](docs/erklaerung-leona.md) · [Dexter](docs/erklaerung-dexter.md) · [Naima](docs/erklaerung-naima.md) · [Zachary](docs/erklaerung-zachary.md) |
| [planung_projektarbeit.md](planung_projektarbeit.md) | ursprüngliche Planung (von der Lehrperson freigegeben) |

## Tech-Stack (kurz begründet)

- **Node.js 22 + Express 5** für alle Services: eine Sprache für Frontend und Backend, wenig Code, kleiner Speicherbedarf (gemessen 16–28 MB RAM pro Instanz).
  Express 5 leitet Fehler aus `async`-Funktionen automatisch an die Fehlerbehandlung weiter.
- **PostgreSQL 17**: *eine* DB-Instanz, aber pro Service eine eigene Datenbank mit eigenem Benutzer («database per service»).
  Beide Instanzen eines Services teilen dieselbe Datenbank. Das braucht HA, sonst hätte jede Instanz andere Daten.
- **nginx** als Reverse Proxy + Loadbalancer. Er liefert auch das Frontend aus: ein Einstiegspunkt, kein CORS-Problem.
- **Frontend ohne Framework** (HTML, CSS, JavaScript-Module): kein Build-Schritt, jede Person versteht ihre Seite.
- **JWT (HS256)** für die Anmeldung: Jeder Service prüft das Token selbst, ohne den Benutzer-Service zu fragen.
- **Docker Compose** (Hauptvariante) und **Kubernetes-Manifeste** (microk8s auf LernMAAS). Beides ist getestet.

## Schnellstart (Docker Compose, z. B. auf einer LernMAAS-VM)

Voraussetzung: Docker mit Compose-Plugin (auf der LernMAAS-VM vorinstalliert).

```bash
git clone <repo-url> m321 && cd m321
./scripts/init-env.sh            # erzeugt .env mit zufälligen Passwörtern + JWT-Secret (nie committen!)
docker compose up -d --build     # baut und startet alles (dauert beim ersten Mal ~2 Minuten)
docker compose ps                # alle Container sollten "healthy" sein
```

Danach im Browser: **http://<vm-ip>:8080** → «Registrieren».
Optional Demo-Daten: `./scripts/demo-daten.sh` → Login `demo@example.com` / `demo12345`.

Stoppen: `docker compose down` (Daten bleiben im Volume `db-data`). Alles inkl. Daten löschen: `docker compose down -v`.

### Konfiguration (`.env`)

| Variable | Bedeutung |
|---|---|
| `GATEWAY_PORT` | Port des Reverse Proxy auf der VM (Standard 8080) |
| `JWT_SECRET` | gemeinsames Secret für die JWT-Signatur, für alle Services gleich |
| `JWT_TTL_SECONDS` | Gültigkeit eines Logins (Standard 3600 = 1 h) |
| `POSTGRES_PASSWORD` | Passwort des DB-Administrators |
| `USER_DB_PASSWORD`, `TODO_DB_PASSWORD`, `CATEGORY_DB_PASSWORD` | je ein DB-Benutzer pro Service |

Weitere Variablen pro Service (in `docker-compose.yml` gesetzt): `DATABASE_URL`, `TODO_SERVICE_URL`, `CATEGORY_SERVICE_URL`, `SERVICE_TIMEOUT_MS` (Standard 2000), `PORT` (Standard 3000).

## Variante: jeder Service auf seiner eigenen VM (N01)

Jeder Service hat eine eigene `docker-compose.yml` mit eigener Datenbank und lässt sich **einzeln** starten:

```bash
# auf Leonas VM                          # auf Dexters VM
cd services/user-service                 cd services/todo-service
docker compose --env-file ../../.env up -d --build      # analog category-service, stats-service
```

| Service | Port | braucht |
|---|---|---|
| user-service | 8081 | `TODO_SERVICE_URL`, `CATEGORY_SERVICE_URL` |
| todo-service | 8082 | `CATEGORY_SERVICE_URL` |
| category-service | 8083 | – |
| stats-service | 8084 | `TODO_SERVICE_URL`, `CATEGORY_SERVICE_URL` |

Die Adressen der anderen Services werden als Umgebungsvariable mitgegeben, z. B.
`CATEGORY_SERVICE_URL=http://10.4.31.11:8083 docker compose --env-file ../../.env up -d`.
Ohne Angabe sucht der Service die anderen auf derselben VM (Ports 8081–8084).
**Wichtig:** Alle VMs brauchen dasselbe `JWT_SECRET` (gleiche `.env` verteilen, nicht per Git).

Das Gateway mit dem Frontend läuft dann z. B. auf einer VM und kennt pro Service zwei Instanzen:

```bash
cd gateway
USER_UPSTREAM_1=10.4.31.10:8081 USER_UPSTREAM_2=10.4.31.10:8081 \
TODO_UPSTREAM_1=10.4.31.12:8082 TODO_UPSTREAM_2=10.4.31.12:8082 \
CATEGORY_UPSTREAM_1=10.4.31.11:8083 CATEGORY_UPSTREAM_2=10.4.31.11:8083 \
STATS_UPSTREAM_1=10.4.31.13:8084 STATS_UPSTREAM_2=10.4.31.13:8084 \
docker compose up -d --build
```

(IP-Adressen sind Beispiele. Läuft ein Service auf zwei VMs, trägt man bei `_1` und `_2` die beiden VMs ein: echte HA über VMs hinweg.)

## Variante: Kubernetes (microk8s auf LernMAAS)

```bash
./scripts/k8s-deploy.sh          # baut Images, importiert sie in microk8s, legt Secret aus .env an, wendet deploy/k8s an
# -> http://<vm-ip>:30080
microk8s kubectl -n todo-app get pods
```

Für k3s (LernMAAS-Variante `m321k3s`): `KUBECTL="kubectl" CTR="sudo k3s ctr" ./scripts/k8s-deploy.sh`.
Ressourcenbedarf gemessen: das ganze System inkl. k3s braucht ~0.9 GB RAM. Das passt auf die 3.5-GB-VM.

## Tests

```bash
# Unit-Tests (ohne laufendes System)
(cd services/user-service && npm install && npm test)        # analog todo-service, stats-service

# API-Tests gegen das laufende System (35 Testfälle, ein File pro Service)
BASE_URL=http://<vm-ip>:8080 node --test tests/api/
# ohne Node auf der VM:
docker run --rm --network host -v "$PWD/tests:/tests" node:22-alpine node --test /tests/api/

# Ausfalltests (HA), auf der VM mit Docker Compose
./scripts/ha-test.sh
# Ausfalltests Kubernetes
BASE_URL=http://localhost:30080 ./scripts/k8s-ha-test.sh
```

Ergebnisse: [docs/testprotokoll.md](docs/testprotokoll.md).

## Ordnerstruktur

```
├── docker-compose.yml        Gesamtsystem (2 Instanzen pro Service, DB, Gateway)
├── .env.example              Vorlage für Secrets (echte .env ist in .gitignore)
├── services/
│   ├── user-service/         Leona    (src/, test/, Dockerfile, docker-compose.yml für Einzelstart)
│   ├── todo-service/         Dexter
│   ├── category-service/     Naima
│   └── stats-service/        Zachary
├── frontend/                 index.html, css/, js/api.js (API-Client), js/app.js (Router), js/pages/<Seite>.js
├── gateway/                  nginx-Konfiguration (Template) + Dockerfile, docker-compose.yml für Einzelstart
├── deploy/
│   ├── db/                   PostgreSQL-Image mit Init-Skript (3 Datenbanken, 3 Benutzer)
│   └── k8s/                  Kubernetes-Manifeste (kustomize)
├── tests/api/                API-Tests pro Service + End-to-End-Ablauf
├── scripts/                  init-env, demo-daten, ha-test, k8s-deploy, k8s-ha-test
└── docs/                     Dokumentation, Schnittstellen, Testprotokoll, Erklär-Dokus
```

## Wichtige Endpunkte (über den Proxy)

| URL | Was |
|---|---|
| `http://<vm-ip>:8080/` | Frontend |
| `/api/auth/login`, `/api/users` | Benutzer-Service |
| `/api/todos` | TODO-Service |
| `/api/categories` | Kategorien-Service |
| `/api/stats` | Statistik-Service |
| `/api/health/{user,todo,category,stats}` | Health jedes Services |

Alle Details: [docs/schnittstellen.md](docs/schnittstellen.md).
