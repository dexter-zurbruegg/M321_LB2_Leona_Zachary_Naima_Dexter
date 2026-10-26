# M321 LB2: Verteilte TODO-App

Leona · Zachary · Naima · Dexter | TBZ AP23a | Stand 26.10.2026

**Abgabestand: `main`** enthält die vollständige Anwendung, den geprüften HA-Clusterstand und die aktualisierte gemeinsame Doku. Der Integrationsbranch `ha-cluster-repair` wurde dafür nach `main` übernommen; `develop` kann älter sein. Geprüfter App-Bezug: `f74f737`. Reine Doku-Commits ändern den laufenden App-Code nicht.

## Anwendung öffnen

Im Schulnetz/VPN: **http://10.4.31.11:30080**. Alternativen: http://10.4.31.13:30080, http://10.4.31.16:30080 und http://10.4.31.17:30080.

Vier MicroK8s-VMs, vier Backend-Services und Gateway mit je zwei Pods auf unterschiedlichen VMs. CloudNativePG repliziert drei fachliche Datenbanken über drei PostgreSQL-Instanzen. Statistik hat keine eigene DB. Eine geladene Seite kann den API-Einstieg wechseln; beim Reload einer ausgefallenen URL ist eine andere Adresse nötig.

| Komponente | Verantwortlich | Code |
|---|---|---|
| Benutzer, Login, Profil | Leona | [user-service](services/user-service) |
| TODOs, Zuordnung, Gateway | Dexter; Gateway mit Leona | [todo-service](services/todo-service), [gateway](gateway) |
| Kategorien, Farbe, Soft-Delete | Naima | [category-service](services/category-service) |
| Statistik | Zachary | [stats-service](services/stats-service) |
| Frontend | jeweilige Fachseite durch zuständige Person | [frontend](frontend) |
| Cluster / Ausfallnachweise | gemeinsame Integration; Korrekturen mit Codex-Unterstützung dokumentiert | [deploy/ha](deploy/ha), [Tests](docs/testprotokoll.md) |

## Dokumentation

- **[Gemeinsame Abgabe-Dokumentation](docs/dokumentation.md)**: Titelbild, Planung, Anforderungen, Architektur, vier Komponenten, HA, Betrieb, Tests und Fazit.
- [Architektur](docs/architektur.md) · [Schnittstellen](docs/schnittstellen.md) · [Clusterbetrieb und Installationsvoraussetzungen](docs/betrieb-cluster.md)
- [Testfälle und Nachweise](docs/testprotokoll.md) · [Präsentation und Demo](docs/praesentation.md)
- [Naimas ausführliche Komponente](docs/naima-umsetzung-tests.md) · [Demo-Sprechzettel](docs/demo-naima.md)
- [Ursprüngliche Planung](planung_projektarbeit.md): Planung, nicht automatisch heutiger Betriebsstand.

Individuelle Beschreibungen sind Teil der gemeinsamen Doku. Persönliche Erklärdateien sind ergänzende Lernhilfen. Jede Person prüft und verantwortet ihr Kapitel.

## Nachweis und Grenzen

26.10.: vier Ready-Nodes, fünf Deployments je 2/2, PostgreSQL 3/3 gesund, **35/35 API-Tests**. 24.10.: **10/10 Kategorien-JWT-Tests**, vier einzelne VM-Netzisolationen, alle **167 bestätigten Testkategorien erhalten**. Längste gemessene Fehlerphase etwa **81 s**, keine Null-Unterbrechung.

Offen: einheitlich strenge JWT-Vertragsprüfung bei Benutzer/TODO, Kontolöschung bei Teilfehlern, zusätzliche Grenzfall-/GUI-Tests und umfassende Codeabdeckung. Physischer Stromausfall, Mehrfachausfall, kompletter Neuaufbau und Backup-Restore sind nicht als bestanden nachgewiesen.

## Prüfen und entwickeln

```bash
microk8s kubectl get nodes
microk8s kubectl -n todo-app get deployments
microk8s kubectl -n todo-app get cluster todo-pg
BASE_URL=http://10.4.31.11:30080 node --test tests/api/category.test.js tests/api/flow.test.js tests/api/user.test.js tests/api/todo.test.js tests/api/stats.test.js
```

API-Testclient: Node.js 22+, Schulnetz/VPN, Repository als Arbeitsverzeichnis. Tests legen eigene Benutzer an; nicht alle Daten werden automatisch entfernt. Unit-Tests: `npm ci` und `npm test` im jeweiligen Service-Ordner.

Lokales Compose auf Port 8080 bleibt für Entwicklung erhalten. **Aktiver gemeinsamer Betrieb: `deploy/ha`**, nicht `deploy/k8s` oder `scripts/k8s-deploy.sh`. [Betriebsanleitung](docs/betrieb-cluster.md).

Projektabgabe: 26.10.2026. Demo und optionale Testing-Abgabe: 02.11.2026; genaue Teams-Frist beachten.
