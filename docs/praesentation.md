# Präsentation und Demo: Ablauf

> **TL;DR:** ~20 Minuten, vier Teile. Jede Person zeigt **ihren Service live** im Browser und erklärt **eine** Sache im Code.
> Der Höhepunkt ist der **Ausfalltest live** (Instanz stoppen, alles läuft weiter). Für die Demo gibt es 6 Punkte, wenn **keine Pannen** passieren.
> Deshalb: vorher proben, Demo-Daten laden, Plan B bereithalten.

**Termine:** Abgabe Projektarbeit **Mo 26.10.2026** (Code + Dokumentation, via Teams) · **Demo Mo 02.11.2026** (dann auch die freiwillige Testing-Abgabe)

## 1. Ablauf (≈ 20 min)

| Zeit | Wer | Was | Zeigen |
|---:|---|---|---|
| 0:00 | **Dexter** | Einstieg: Was ist die App, wer hat was gebaut | README-Tabelle «Komponente → Person» |
| 1:30 | **Leona** | Architektur: Browser → nginx → 4 Services × 2 → je eigene DB; JWT als roter Faden | Diagramm aus `docs/architektur.md` |
| 4:00 | **Leona** | Benutzer-Service: registrieren, falsches Passwort, Token auf jwt.io, Hash in der DB | Browser + Terminal |
| 7:00 | **Naima** | Kategorien-Service: anlegen mit Farbe, Duplikat, Soft-Delete (TODO zeigt sie durchgestrichen) | Browser |
| 9:30 | **Dexter** | TODO-Service: anlegen mit Kategorie/Priorität, Status → erledigt, Filter/Suche; Prüfung beim Kategorien-Service im Code | Browser + `app.js` `checkCategory` |
| 12:30 | **Zachary** | Statistik: Kacheln, pro Kategorie, «Keine Daten»; Unit-Tests live (`npm test`) | Browser + Terminal |
| 15:00 | **Naima + Zachary** | **Hochverfügbarkeit live:** 1) Lastverteilung `X-Instance` 2) `docker stop todo-service-1` → App läuft 3) Absturz → Neustart in ~1.5 s 4) `./scripts/ha-test.sh` Ergebnis-Tabelle | Terminal + Browser |
| 18:30 | **Dexter** | Fazit: was gelernt (Fehler aus Ausfalltests), Grenzen (DB = Single Point of Failure), Ausblick | `docs/dokumentation.md` Kap. 5.4, 8 |
| 20:00 | alle | Fragen | – |

**Faustregel:** Wer redet, bedient auch. Die andere Person sagt nur, was als Nächstes kommt.

## 2. Vorbereitung (am Vortag und 15 min vorher)

```bash
# auf der Demo-VM
cd m321 && git pull && git checkout develop
docker compose up -d --build
docker compose ps                      # alle 10 "healthy"?
./scripts/demo-daten.sh                # Login: demo@example.com / demo12345
BASE_URL=http://localhost:8080 node --test tests/api/   # oder per Docker, siehe README → alles grün?
```

- [ ] VPN (WireGuard) verbunden, VM erreichbar: `http://<vm-ip>:8080`
- [ ] Browser: ein Tab angemeldet als Demo-Benutzer, ein privates Fenster für «Registrieren»
- [ ] Terminal mit grosser Schrift, zwei Fenster: (1) Befehle, (2) `docker compose logs -f gateway`
- [ ] jwt.io in einem Tab offen
- [ ] Befehle für den HA-Teil in einer Textdatei bereit zum Kopieren (unten)

## 3. Befehle für den HA-Teil (zum Kopieren)

```bash
# 1) Lastverteilung: abwechselnd zwei Container-IDs
for i in 1 2 3 4; do curl -s -D - -o /dev/null http://localhost:8080/api/health/todo | grep -i x-instance; done

# 2) Eine Instanz fällt aus → im Browser weiterarbeiten
docker stop todo-service-1
docker start todo-service-1

# 3) Absturz simulieren → Docker startet neu
docker exec category-service-2 sh -c 'kill -9 $(pgrep -f "node src/server.js")'
docker ps --filter name=category-service-2       # "Up 2 seconds"

# 4) Teilausfall: Kategorien ganz weg → TODOs gehen weiter (gelber Hinweis)
docker stop category-service-1 category-service-2
docker start category-service-1 category-service-2

# 5) alles automatisch mit Tabelle
./scripts/ha-test.sh
```

## 4. Plan B (falls etwas schiefgeht)

| Problem | Reaktion |
|---|---|
| VPN / VM nicht erreichbar | Lokal auf dem Laptop mit Docker Desktop: `docker compose up -d --build` (2 min). Vorher einmal ausprobieren! |
| Ein Container ist nicht `healthy` | `docker compose logs <name> --tail 20` zeigen und erklären. Meist DB noch nicht bereit: 10 s warten, `docker compose up -d` |
| Login geht nicht nach Neustart mit neuer `.env` | Token im Browser ist alt → abmelden/neu anmelden (anderes `JWT_SECRET` = alte Tokens ungültig, das ist korrekt so) |
| Demo hängt | Screenshots in `docs/img/` und Testprotokoll zeigen. Ruhig erklären, was passiert ist. Erklärte Pannen kosten weniger Punkte |

## 5. Wer kann welche Fragen beantworten

| Thema | Erste Ansprechperson |
|---|---|
| JWT, Passwörter, Abmelden, Konto löschen | Leona |
| Reverse Proxy, Lastverteilung, `upstream`, TODO-Logik, Fremdschlüssel | Dexter |
| Soft-Delete, Prüf-Endpunkt, partieller Index, Ausfalltests | Naima |
| Statistik-Berechnung, Timeouts, Unit-Tests, Kubernetes-Tests, Korrelations-ID | Zachary |
| Kubernetes-Manifeste (Probes, Replicas, Secret) | Zachary + Naima |
| LernMAAS, Installation | alle (jede Person hat es auf der eigenen VM gestartet) |

Die typischen Fragen mit Antworten stehen in der Erklär-Doku jeder Person (Abschnitt «Fragen der Lehrperson»).
