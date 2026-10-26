# Historischer Bericht

Angaben vom 15.10. zu k3s, Compose, GUI und Messzeiten wurden nicht erneut verifiziert. Aktuelle Resultate: [testprotokoll.md](testprotokoll.md). Historische Befehle nicht auf den aktiven Cluster übertragen.

# Testprotokoll: Verteilte TODO-App

Gruppe Leona · Zachary · Naima · Dexter · M321 LB2 · Testdurchführung 15.10.2026

## TL;DR

| Ebene | Anzahl | Ergebnis |
|---|---:|---|
| Unit-Tests (Leona 4, Dexter 3, Zachary 7) | 14 | ✅ 14/14 |
| API-Tests über den Proxy (Leona 10, Dexter 10, Naima 7, Zachary 5, End-to-End 3) | 35 | ✅ 35/35, in allen drei Betriebsarten |
| Ausfalltests Docker Compose | 6 | ✅ 6/6, dreimal hintereinander |
| Ausfalltests Kubernetes | 3 | ✅ 3/3 |
| Manuelle Tests Frontend (Desktop + Mobile) | 8 | ✅ 8/8 |

## 1. Testumgebung

| | |
|---|---|
| Host | Linux-VM (Debian 13, Docker 28, Docker Compose v2). Gleiche Software wie die LernMAAS-VM M321 (Ubuntu, Docker, microk8s) |
| System unter Test | Stand Branch `develop`, gestartet mit `docker compose up -d --build` (10 Container: 4 Services × 2 Instanzen, PostgreSQL 17, nginx 1.28) |
| Kubernetes | k3s v1.31 (gleiche Manifeste wie für microk8s), 2 Replicas pro Service + 2 Gateway-Pods |
| Verteilte Variante | jeder Service einzeln über seine eigene `docker-compose.yml` (Ports 8081–8084) + Gateway einzeln |
| Testwerkzeuge | Node.js Test-Runner (`node --test`) mit `fetch`, Bash + curl + Docker-CLI (Ausfalltests), Headless-Chrome (manuelle Abläufe, Screenshots) |
| Testdaten | Jeder Test legt eigene, zufällige Benutzer an (`<prefix>-<zufall>@example.com`), Tests beeinflussen sich nicht |

**Ausführen**

```bash
(cd services/user-service && npm install && npm test)    # Unit-Tests, analog todo-service, stats-service
BASE_URL=http://<vm-ip>:8080 node --test tests/api/       # API-Tests
./scripts/ha-test.sh                                      # Ausfalltests Compose
BASE_URL=http://<vm-ip>:30080 ./scripts/k8s-ha-test.sh   # Ausfalltests Kubernetes
```

## 2. Vorgehen

- **Unit-Tests** prüfen reine Logik ohne Netzwerk und Datenbank: JWT-Prüfung, Statuswechsel, Statistik-Berechnung mit bekannten Zeitwerten.
- **API-Tests** prüfen jeden Service über den echten Proxy, so wie das Frontend ihn benutzt. Jede Person hat ein eigenes Testfile zu ihrem Service.
  Getestet werden der Normalfall, die Validierung, die Zugriffsrechte (N02) und die Fachregeln aus der Planung (5.3.x).
- **Ausfalltests** stoppen oder beenden gezielt Container/Pods und messen, was der Benutzer davon merkt.
- **Manuelle Tests** prüfen den Ablauf im Browser auf Desktop und Mobile.

## 3. API-Testfälle

Legende: ✅ bestanden. Alle Tests bestanden am 15.10.2026 gegen Docker Compose, Kubernetes (k3s) und die verteilte Variante.

### 3.1 Benutzer-Service (Leona): `tests/api/user.test.js`

| ID | Anforderung | Vorgehen | Erwartet | Ergebnis |
|---|---|---|---|---|
| TC-U01 | F01, N03 | Registrieren mit gültigen Daten | 201, Antwort ohne Passwort/Hash | ✅ |
| TC-U02 | F01 | gleiche E-Mail nochmals registrieren | 409 `EMAIL_TAKEN` | ✅ |
| TC-U03 | F01, F10 | ungültige E-Mail, zu kurzes Passwort, leerer Name | 400 `VALIDATION_ERROR` mit verständlicher Meldung | ✅ |
| TC-U04 | F02 | Login, Token dekodieren | 200, JWT mit `alg=HS256`, `sub`=userId, `iss=user-service`, `exp>iat` | ✅ |
| TC-U05 | F02 | Login mit falschem Passwort | 401 `INVALID_CREDENTIALS` | ✅ |
| TC-U06 | F02, N02 | `/users/me` ohne Token und mit manipuliertem Token | jeweils 401 | ✅ |
| TC-U07 | F01 | Anzeigename ändern; E-Mail ohne aktuelles Passwort ändern | 200 bzw. 403 | ✅ |
| TC-U08 | F01 | Passwort ändern, mit altem und neuem Passwort anmelden | alt 401, neu 200 | ✅ |
| TC-U09 | F02 | Abmelden | 204 | ✅ |
| TC-U10 | F01, Regel 5.3.3 | Konto mit Kategorie + TODO löschen | 204; danach keine TODOs/Kategorien mehr, `/users/me` 404, Login 401 | ✅ |

### 3.2 TODO-Service (Dexter): `tests/api/todo.test.js`

| ID | Anforderung | Vorgehen | Erwartet | Ergebnis |
|---|---|---|---|---|
| TC-T01 | F03 | TODO nur mit Titel erstellen | 201, `status=open`, `priority=medium`, keine Kategorie, `completedAt=null` | ✅ |
| TC-T02 | F03, F10 | leerer Titel, Status «fertig», Priorität «sofort» | jeweils 400 `VALIDATION_ERROR` | ✅ |
| TC-T03 | F03 | bearbeiten (Titel, Beschreibung, Priorität), lesen, löschen, nochmals lesen | Änderungen gespeichert, nach Löschen 404 | ✅ |
| TC-T04 | F04, Regel 5.3.4 | open → in_progress → done → open | `completedAt` nur bei done gesetzt, beim Wiedereröffnen `null` | ✅ |
| TC-T05 | F06 | TODO mit eigener Kategorie erstellen, Kategorie entfernen | `categoryId` gesetzt, danach `null` | ✅ |
| TC-T06 | F06, N02 | TODO mit fremder bzw. gelöschter Kategorie erstellen | 422 `CATEGORY_NOT_FOUND` | ✅ |
| TC-T07 | Regel 5.3.2 | Kategorie eines TODOs löschen, TODO lesen und erledigen | TODO bleibt mit `categoryId`, Bearbeiten 200 | ✅ |
| TC-T08 | Z1–Z3 | 3 TODOs; Liste ohne Filter, Filter Status/Priorität/Kategorie, Suche «mathe», Suche «%» | richtige Treffer und Sortierung (offen + hoch zuerst), «%» findet nichts | ✅ |
| TC-T09 | N02 | fremdes TODO lesen, ändern, löschen; eigene Liste | jeweils 404, Liste leer, Original unverändert | ✅ |
| TC-T10 | F02 | Liste/Erstellen ohne Token | 401 | ✅ |

### 3.3 Kategorien-Service (Naima): `tests/api/category.test.js`

| ID | Anforderung | Vorgehen | Erwartet | Ergebnis |
|---|---|---|---|---|
| TC-K01 | F05 | Kategorie mit Farbe `#FF8800` erstellen, lesen, Liste | 201, Farbe als `#ff8800`, in Liste | ✅ |
| TC-K02 | F05, F10 | ohne Farbe; Name nur Leerzeichen; Farbe «rot» | Standardfarbe `#2f6fed`; 400; 400 | ✅ |
| TC-K03 | F05 | «Arbeit» und «arbeit»; nach Löschen nochmals «Arbeit» | 409 `CATEGORY_EXISTS`; danach 201 | ✅ |
| TC-K04 | F05 | Name und Farbe ändern | 200 mit neuen Werten | ✅ |
| TC-K05 | F05, Regel 5.3.2 | löschen, dann lesen, Liste, Liste mit `includeDeleted`, ändern | 204; 404; leer; 1 Eintrag mit `deletedAt`; 404 | ✅ |
| TC-K06 | N02 | fremde Kategorie lesen, ändern, löschen; eigene Liste | jeweils 404, Liste leer, Original unverändert | ✅ |
| TC-K07 | F02 | Liste ohne Token; ID «keine-uuid» | 401; 404 | ✅ |

### 3.4 Statistik-Service (Zachary): `tests/api/stats.test.js`

| ID | Anforderung | Vorgehen | Erwartet | Ergebnis |
|---|---|---|---|---|
| TC-S01 | F07, F08 | neuer Benutzer ohne TODOs | alle Zahlen 0, `averageCompletionSeconds=null` («Keine Daten») | ✅ |
| TC-S02 | F07 | 2× offen, 1× in Bearbeitung, 1× erledigt | `open=2, inProgress=1, done=1, total=4`, 1 erledigt in 7 Tagen | ✅ |
| TC-S03 | F08 | TODO erstellen, 2.1 s warten, erledigen | Durchschnitt zwischen 2 und 4 s | ✅ |
| TC-S04 | Z5 | Kategorie «Sport» mit erledigtem TODO + TODO ohne Kategorie | Eintrag «Sport» mit `done=1` und Eintrag «Ohne Kategorie» | ✅ |
| TC-S05 | N02, F02 | Benutzer A hat ein TODO, B fragt Statistik; ohne Token | B sieht `total=0`; 401 | ✅ |

### 3.5 Gesamtablauf (alle): `tests/api/flow.test.js`

| ID | Anforderung | Vorgehen | Erwartet | Ergebnis |
|---|---|---|---|---|
| TC-E01 | F09 | Registrieren → Login → Kategorie → TODO mit Kategorie → erledigen → Statistik → Abmelden | jeder Schritt erfolgreich, Statistik zeigt 1 erledigt in «Schule» | ✅ |
| TC-E02 | F09, F10 | Startseite laden; unbekannte API-Route | HTML mit «TODO-App»; 404 im JSON-Fehlerformat | ✅ |
| TC-E03 | Monitoring | beliebige Anfrage | Header `X-Request-Id` (32 Hex-Zeichen) und `X-Instance` vorhanden | ✅ |

## 4. Einzelstart und verteilte Variante (N01, N05)

| ID | Vorgehen | Erwartet | Ergebnis |
|---|---|---|---|
| TC-N01 | `docker compose --env-file ../../.env up -d --build` in jedem der vier Service-Ordner | jeder Service startet allein mit eigener DB, `GET :808x/health` → 200 | ✅ alle vier |
| TC-N02 | Gateway einzeln mit `*_UPSTREAM_*` auf die vier Services, dann alle API-Tests | 35/35 bestanden | ✅ |
| TC-N03 | Kubernetes-Manifeste anwenden (`deploy/k8s`), dann alle API-Tests gegen NodePort 30080 | alle Pods `Running`, 35/35 bestanden | ✅ |

## 5. Manuelle Tests Frontend (F09, F10, N07)

Durchgeführt im Browser (Chrome) mit 1280 × 860 (Desktop) und 390 × 844 (Smartphone).

| ID | Ablauf | Erwartet | Desktop | Mobile |
|---|---|---|---|---|
| TC-M01 | Registrieren | danach direkt angemeldet auf «TODOs» | ✅ | ✅ |
| TC-M02 | Falsches Passwort beim Login | rote Meldung «E-Mail oder Passwort ist falsch» | ✅ | ✅ |
| TC-M03 | Kategorien «Schule», «Haushalt» mit Farbe anlegen, umbenennen | erscheinen sofort, Farbe sichtbar | ✅ | ✅ |
| TC-M04 | TODOs mit Kategorie + Priorität anlegen, Status über Auswahl ändern | Badges, erledigte durchgestrichen und unten | ✅ | ✅ |
| TC-M05 | Filter und Suche | Liste aktualisiert sich (Suche nach 300 ms Pause) | ✅ | ✅ |
| TC-M06 | Statistik öffnen | Kacheln + Tabelle pro Kategorie, ohne erledigte «Keine Daten» | ✅ | ✅ |
| TC-M07 | Beide Kategorien-Instanzen stoppen, TODO-Seite öffnen | gelber Hinweis, TODOs sichtbar und bearbeitbar | ✅ | ✅ |
| TC-M08 | Abmelden, danach `#/todos` aufrufen | Umleitung auf «Anmelden» | ✅ | ✅ |

Screenshots: `docs/img/` (siehe Dokumentation, Anhang).

## 6. Ausfalltests Docker Compose (N06): `scripts/ha-test.sh`

Verantwortlich: Naima + Zachary. Das Skript legt einen Testbenutzer an, führt die Tests aus, startet alles wieder und gibt die Tabelle aus.

| Test | Vorgehen | Ergebnis (Durchlauf 3 von 3) | Status |
|---|---|---|---|
| HA-01 | 20× `GET /api/todos` | Antworten verteilt auf 2 Instanzen (10× / 10×) | ✅ |
| HA-02 | `docker stop todo-service-1`, dann 20× GET + 1× POST | 20/20 GET erfolgreich, POST → 201 | ✅ |
| HA-03 | Node-Prozess in `category-service-2` mit `kill -9` beenden | Docker startet neu (RestartCount 0 → 1), wieder gesund nach 1.3 s | ✅ |
| HA-04 | beide `category-service` stoppen | `GET /todos` → 200; TODO mit Kategorie → 503 mit Meldung «Der Kategorien-Service ist gerade nicht erreichbar …»; `/stats` → 200 mit `categoriesAvailable:false` | ✅ |
| HA-05 | beide `todo-service` stoppen, `GET /stats` | 503 nach 2022 ms: «Der TODO-Service ist gerade nicht erreichbar, bitte später erneut versuchen» | ✅ |
| HA-06 | `docker restart db` | 1 TODO vorher, 1 nachher; API sofort wieder bereit | ✅ |

Alle drei Durchläufe: 6/6. Die Zeiten für HA-03 lagen zwischen 1.1 und 1.5 s.

## 7. Ausfalltests Kubernetes (N06): `scripts/k8s-ha-test.sh`

| Test | Vorgehen | Ergebnis | Status |
|---|---|---|---|
| K8S-01 | `kubectl delete pod <todo-service-pod>`, gleichzeitig 20 Anfragen | 20/20 erfolgreich, wieder 2/2 Pods bereit nach 5 s | ✅ |
| K8S-02 | `kill -9` auf den Node-Prozess im Pod | Container neu gestartet (Restarts +1), wieder bereit nach 3 s | ✅ |
| K8S-03 | Datenbank-Pod löschen | 1 TODO vorher, 1 nachher (PersistentVolume); API nach 2 s wieder bereit | ✅ |

Beobachtung: Wird derselbe Container mehrmals kurz hintereinander beendet, wartet Kubernetes immer länger mit dem Neustart (CrashLoopBackOff, gemessen bis 33 s).
Das ist gewollt: So belastet ein dauernd abstürzender Container das System nicht.

## 8. Unit-Tests

| Service | Datei | Testfälle | Ergebnis |
|---|---|---|---|
| user-service (Leona) | `test/auth.test.js` | gültiges Token → userId aus `sub`; fehlendes, falsch signiertes, abgelaufenes Token → 401 | ✅ 4/4 |
| todo-service (Dexter) | `test/status.test.js` | erledigen setzt `completedAt`; wieder öffnen setzt zurück; erledigt bleibt erledigt | ✅ 3/3 |
| stats-service (Zachary) | `test/stats.test.js` | Zählung F07; Ø aus 1 h + 3 h = 2 h; keine Daten → `null`; wieder geöffnete zählen nicht; pro Kategorie; Kategorien-Service weg; letzte 7 Tage | ✅ 7/7 |

## 9. Gefundene und behobene Fehler

| # | Gefunden durch | Problem | Behebung |
|---|---|---|---|
| 1 | HA-02 | 1 von 20 Anfragen ging verloren, wenn eine Instanz stoppte (nginx kannte über DNS nur noch eine Instanz) | pro Service zwei feste Upstream-Einträge |
| 2 | HA-04 | Statistik antwortete mit 500, wenn der Kategorien-Service fehlte (Timeout brach das spätere Lesen der TODO-Antwort ab) | Antwort innerhalb des Timeouts vollständig lesen |
| 3 | HA-05 | Fehlermeldung kam erst nach 4 s statt 2 s (nginx wiederholte die 503 bei der zweiten Instanz) | `proxy_next_upstream` nur noch bei Verbindungsfehler/Timeout |
| 4 | HA-06 | Nach Ausfall beider Instanzen blieb ein Service bis zu 10 s gesperrt | `fail_timeout` von 10 s auf 3 s |
| 5 | HA-03 | `docker kill` startete den Container nicht neu (gilt als manueller Stopp) | Absturz realistisch simulieren: Prozess im Container beenden; `tini` als PID 1 |
| 6 | K8S-01 | 1 von 20 Anfragen ging beim Löschen eines Pods verloren | `preStop: sleep 3` |
| 7 | TC-E03 | `X-Request-Id` stand doppelt in der Antwort | nginx entfernt die Kopie des Services |
| 8 | Manueller Test | Navigation war vor dem Login sichtbar (CSS überschrieb `hidden`) | `[hidden] { display: none !important; }` |
