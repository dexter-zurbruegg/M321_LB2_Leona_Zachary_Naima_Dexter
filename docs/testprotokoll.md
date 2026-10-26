# Testprotokoll – gemeinsamer HA-Cluster

Stand 26.10.2026, App-Bezug f74f737. MicroK8s v1.35.6 auf vier Team-VMs, CloudNativePG 1.30.1, PostgreSQL 17 mit drei Instanzen, Namespace todo-app.

**Aktuell:** 35/35 API-Tests am 26.10.; vier Ready-Nodes, fünf Deployments je 2/2, DB 3/3. [API-Rohlog](api-2026-10-26.txt), [Clusterprüfung](cluster-2026-10-26.txt). Alle nachfolgend mit 24.10. bezeichneten Ausfall-/Unit-Prüfungen sind historische Nachweise, keine neuen Ausfälle heute. Die sieben Kategorie-API-Fälle sind Teil der 35, nicht zusätzlich.

Ausführung mit Codex-Unterstützung; keine persönliche Durchführung anderer Teammitglieder daraus ableiten. [Alter Bericht](testprotokoll-historisch.md) getrennt erhalten. Testclient: Node.js 22+, Schulnetz/VPN, zufällige eigene Testbenutzer; nicht alle Testkonten werden automatisch entfernt.

## Gemeinsame API-Testfälle


Legende: ✅ 35/35 am 26.10.2026 gegen den MicroK8s-Cluster auf Port 30080 bestanden.

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


## Definitionen und detaillierte Nachweise vom 24.10.


### Umgebung und Bewertungsmassstab

Die hier protokollierten Prüfungen wurden am 24.10.2026 durchgeführt. Der Cluster verwendet MicroK8s v1.35.6, Node.js 22 in den App-Containern, PostgreSQL 17 und CloudNativePG 1.30.1. Der abschliessend veröffentlichte Codebezug ist `f74f737`. Die Rohprotokolle nennen die tatsächlich ausgeführten Fälle und Ergebnisse. [Rohbelege](nachweise-2026-10-24.txt)

Die API-Tests verwenden getrennte zufällige Benutzer und durchlaufen das gemeinsame Gateway. Die JWT-Tests prüfen die Middleware mit einem ausschliesslich für Tests verwendeten Secret. Testdefinitionen und Ergebnisprotokoll sind hier zur Wiederholung zusammengeführt; daraus wird keine frühere, nicht belegte Planung der Tests abgeleitet.

Ein API-Test ist bestanden, wenn Status und fachlicher Zustand mit dem erwarteten Ergebnis übereinstimmen. Ein VM-Ausfalltest ist bestanden, wenn die Isolation tatsächlich beobachtet wird, noch während der Isolation wieder vollständige Abläufe gelingen, die VM zurückkehrt und alle bestätigten Kategorie-IDs anschliessend über alle vier Einstiege vorhanden sind. Eine vorübergehende Fehlerphase ist in diesen Ausfalltests zulässig und wird separat ausgewiesen.

### Fachliche Kategorieprüfungen

Gemeinsame Voraussetzung für TC-K01 bis TC-K07: erreichbarer Cluster, leere eigene Testdaten und ein gültiger Benutzer-Token, soweit der Test nicht gerade dessen Fehlen prüft. Datei: `tests/api/category.test.js`.

| ID | Durchführung | Soll | Ist am 24.10. |
|---|---|---|---|
| TC-K01 | Kategorie mit `#FF8800` anlegen, einzeln und als Liste lesen | 201; Farbe `#ff8800`; Kategorie vorhanden | Bestanden |
| TC-K02 | Ohne Farbe anlegen; Leerzeichenname und ungültige Farbe senden | Standardblau; ungültige Eingaben 400 | Bestanden |
| TC-K03 | „Arbeit“, dann „arbeit“ anlegen; erste löschen und erneut anlegen | 409 vor, 201 nach Soft-Delete | Bestanden |
| TC-K04 | Name und Farbe ändern | 200 und beide neuen Werte | Bestanden |
| TC-K05 | Löschen, normale Liste und Einzelabruf prüfen; gelöschte einblenden | 204; leer/404; gelöschter Datensatz sichtbar | Bestanden |
| TC-K06 | Zweiter Benutzer liest, ändert und löscht fremde Kategorie | Je 404; fremde Liste leer; Original unverändert | Bestanden |
| TC-K07 | Liste ohne Token und Einzelabruf mit ungültiger ID | 401 beziehungsweise 404 | Bestanden |

Die gemeinsamen Tests TC-T05–T07 prüfen zusätzlich Kategoriezuordnung, Ablehnung fremder/gelöschter Kategorien und den Erhalt eines TODOs nach Kategorie-Soft-Delete. TC-S04 prüft die Statistik nach Kategorie. TC-E01 prüft den gesamten Ablauf von Registrierung bis Statistik und Abmeldung. Alle diese Fälle sind im 35/35-Lauf enthalten.

### JWT Regressionstests

Datei: `services/category-service/test/auth.test.js`. Jeder ungültige Fall erwartet HTTP 401 aus der Middleware und keine übernommene Benutzeridentität. Das gültige Token muss die signierte Identität übernehmen.

| Fall | Erwartung | Ergebnis |
|---|---|---|
| Gültiges Token | Signierte UUID und Token werden übernommen | Bestanden |
| Ungültige oder fehlende Benutzer-ID | Ablehnung | 2/2 bestanden |
| Fehlende Ablaufzeit oder abgelaufenes Token | Ablehnung | 2/2 bestanden |
| Falscher Aussteller, Algorithmus oder Signatur | Ablehnung | 3/3 bestanden |
| Fehlendes oder beschädigtes Token | Ablehnung | 2/2 bestanden |

```bash
cd services/category-service
npm ci
npm test
cd ../..
BASE_URL=http://10.4.31.11:30080 node --test \
  tests/api/category.test.js tests/api/flow.test.js
```

Die JWT-Suite erreichte 10/10, die gesamte API-Suite 35/35 erfolgreiche Tests. Die sieben Kategorie-API-Fälle sind Teil dieser 35 und dürfen nicht nochmals zur Gesamtsumme addiert werden. Ein Abdeckungsbericht für alle Serverdateien wurde noch nicht erstellt; die Testanzahl allein ist kein Nachweis einer bestimmten Codeabdeckung.

### Vier einzelne VM Ausfälle

Vor jedem Versuch mussten alle vier Knoten und alle drei PostgreSQL-Instanzen gesund sein. Pro Versuch wurde genau eine VM für ungefähr zwei Minuten per Netzwerkregel isoliert. Ein vorher eingerichteter systemd-Timer stellte die Verbindung automatisch wieder her. Der Testclient blieb auf einer erreichbaren Seite des Netzes.

Das Skript legt ein eigenes Testkonto, eine Basiskategorie und ein TODO an. Es prüft zunächst alle vier Einstiege. Während der Störung versucht es über eine andere VM wiederholt, eine Kategorie zu erstellen, das bestehende TODO zu lesen und die Statistik abzurufen. Nach der Rückkehr vergleicht es die bestätigten Kategorie-IDs über alle vier Einstiege und versucht die Testdaten zu bereinigen.

| Getrennte VM | Dauerhaft vollständige Abläufe ab Testsekunde | Vollständige Abläufe während Isolation | Bestätigte Kategorien danach |
|---|---:|---:|---:|
| Naima .11 | 48,8 s | 25 | 47/47 |
| Dexter .13 | 73,5 s | 16 | 35/35 |
| Leona .16 | 85,4 s | 12 | 30/30 |
| Zachary .17 | 26,4 s | 34 | 55/55 |

Die Isolation beginnt ungefähr drei Sekunden nach Teststart und endet ungefähr bei Sekunde 120. Die zweite Spalte misst ab Teststart, nicht exakt ab Ausfallbeginn. Periodische Messungen und Request-Timeouts begrenzen die Genauigkeit. Insgesamt waren alle 167 bestätigten Testkategorien nach den vier Versuchen vorhanden; die längste beobachtete Fehlerphase betrug ungefähr 81 Sekunden.

Die spätere Wiedereingliederung einer zurückkehrenden Datenbankkopie konnte länger dauern als die Wiederherstellung der Anwendung. Vor dem nächsten Versuch wurde deshalb erneut der gesunde Gesamtzustand abgewartet.

Die Skripte sind `scripts/cluster-failure-test.cjs` und `scripts/isolate-vm-test.sh`. Für die Wiederholung benötigt der Testclient Node.js 22+, Zugriff auf alle Einstiege und vorbereiteten SSH-Schlüsselzugang als `ubuntu`. Das Isolationsskript muss auf der Ziel-VM unter dem im Testskript genannten Pfad bereitliegen. Ein Beispielaufruf ist `node scripts/cluster-failure-test.cjs 11`. Der Test ist eine bewusste Betriebsunterbrechung und wird mit dem Team abgestimmt.

Diese Versuche simulieren vollständige IPv4-Netzisolation der Ziel-VM. Sie sind kein Nachweis eines physischen Stromausfalls, eines gleichzeitigen Ausfalls mehrerer VMs oder einer Wiederherstellung nach Datenträgerverlust.

### Browsernachweis und historische Einzeltests

![Kategorienseite während der Netztrennung von Naimas VM](Naima-Browser-Ausfalltest.png)

*Abbildung 4: Während der Isolation von .11 wurde über die bereits geladene Oberfläche eine Kategorie erstellt und angezeigt. Die erste Statistik-Anfrage scheiterte noch; ein erneuter Aufruf funktionierte während der weiter bestehenden Isolation.*

Vor der Umstellung auf den Cluster wurden am separaten Kategorien-Compose-Stack sechs Prüfungen erfolgreich ausgeführt. Darunter waren ein Prozessabsturz mit Wiederanlauf nach ungefähr 0,98 Sekunden und ein DB-Container-Neustart mit erhaltenen Daten nach ungefähr 0,76 Sekunden. Diese Messungen betreffen den lokalen Einzelstack und sind nicht die Wiederherstellungszeiten eines VM-Ausfalls im Cluster.

### Gefundene Fehler und verbleibende Prüfungen

| Befund | Korrektur oder Status |
|---|---|
| Signierte Tokens ohne Ablaufzeit oder gültige Benutzer-ID wurden nicht ausreichend ausgeschlossen | Kategorien-Middleware ergänzt; zehn Regressionstests bestanden |
| Verwundbare transitive `body-parser`-Version im Kategorienservice | Lockfile aktualisiert; anschliessender Audit meldete keine Befunde im Kategorienservice |
| Lokale Vollstacks belegten keinen gemeinsamen VM-Betrieb | Gemeinsamer Cluster eingerichtet und über mehrere Einstiege getestet |
| Steuerungsebene erholte sich nach Netztrennung teilweise nicht | dqlite-Korrektur, versionsbezogene Einstellungen und koordinierter Watchdog eingesetzt |
| Kein gemessener Abdeckungsbericht | Offen; Serverdateien statt nur Testclient messen |
| Grenzwerte und konkurrierende Änderungen nicht umfassend geprüft | Zusätzliche automatisierte Fälle vorgesehen |

Für die ergänzende Testing-Abgabe sind folgende Prüfungen noch offen: Namen mit 1, 40 und 41 Zeichen; falsche Datentypen; PATCH nur eines Feldes; Namenskonflikt beim Umbenennen; beschädigtes JSON; endgültiges Löschen ohne Einfluss auf einen zweiten Benutzer; konkurrierende Änderungen und Löschung; gezielte Readiness-Prüfung bei DB-Ausfall; vollständiger Desktop-/Mobil-Ablauf der Kategorienseite. Diese Fälle werden nicht als bereits bestanden ausgegeben.


## Gemeinsame offene Fehlerfälle

Benutzer-/TODO-JWT erzwingen exp und gültiges UUID-sub noch nicht gleich streng. Kontolöschung ist nicht atomar: erfolgreiche Teillöschungen werden bei späterem Fehler nicht zurückgerollt. TC-U10 prüft den Normalfall. Physischer Stromausfall, Mehrfachausfall, kompletter Neuaufbau und Backup-Restore sind nicht als bestanden nachgewiesen.

[Rohbelege 24.10.](nachweise-2026-10-24.txt) · [Cluster 24.10.](cluster-2026-10-24.txt) · [Einzelstack](kategorien-einzelservice.txt)
