# Naimas Demo-Sprechzettel

Stand: 26.10.2026. Heute erneut geprüft: vier Nodes Ready, alle fünf Deployments 2/2, PostgreSQL 3/3 healthy und 35/35 API-Tests bestanden. Die VM-Ausfalltests stammen vom 24.10.; heute wurde kein neuer Ausfall ausgelöst.

## 1. Einstieg in deinen Worten

«Unsere App verwaltet persönliche Aufgaben. Leona übernimmt Benutzer und Anmeldung, Dexter die TODOs, ich die Kategorien und Zachary die Statistik. Mein Verantwortungsbereich umfasst Kategorien mit Name und Farbe, Eingabeprüfung, Schutz der eigenen Daten und die Schnittstelle für die anderen Services. Die Kategorienseite gehört ebenfalls dazu.

Die Services laufen in einem gemeinsamen Kubernetes-Cluster aus vier VMs. Jeder App-Service und das Gateway laufen zweimal auf verschiedenen VMs. Ein Service ist deshalb nicht fest an die VM seiner Autorin gebunden. Die Datenhaltung ist über drei PostgreSQL-Instanzen repliziert.»

Die Unterstützung durch Codex bei Prüfung, Korrekturen, Tests und Doku ist in der PDF angegeben. Beschreibe deinen Verantwortungsbereich und was du selbst verstanden und wiederholt hast; erfinde keine alleinige Entwicklung oder persönliche Testdurchführung.

## 2. Vorbereitung

- Schulnetz oder Schul-VPN verbinden.
- App: http://10.4.31.11:30080
- Ersatz: http://10.4.31.13:30080, http://10.4.31.16:30080, http://10.4.31.17:30080.
- Eigenes Demo-Konto, neue Kategorienamen pro Probe und privates Browserfenster für zweiten Benutzer vorbereiten.
- PDF und Testnachweise lokal öffnen.
- In Windows PowerShell anmelden: `ssh ubuntu@10.4.31.11`. Dein VM-Passwort wird bei der Eingabe nicht angezeigt. Keine Passwörter oder Tokens präsentieren.

## 3. Den Cluster zeigen

Nach der SSH-Anmeldung auf der VM:

```bash
microk8s kubectl get nodes
microk8s kubectl -n todo-app get deployments
microk8s kubectl -n todo-app get pods -l app=category-service -o wide
microk8s kubectl -n todo-app get cluster todo-pg
microk8s kubectl -n todo-app get pvc
```

| Ausgabe | Erklärung |
|---|---|
| Vier Nodes Ready | Unsere vier VMs bilden einen Cluster. |
| Deployments jeweils 2/2 | Von jedem Service und dem Gateway sind zwei Instanzen bereit. |
| Kategorie-Pods mit verschiedenen NODE-Werten | Meine beiden laufenden Instanzen sind auf verschiedene VMs verteilt. |
| PostgreSQL drei Instanzen, drei bereit | Eine Primärinstanz und zwei Standbys halten replizierte Daten. |
| Daten-PVCs Bound | Die Daten sind auf persistenten VM-Datenträgern gespeichert. |

Heute lagen die Kategorie-Pods auf .13 und .16. Die Platzierung kann sich ändern: in der Demo die aktuelle Ausgabe lesen.

«Ein Pod enthält unseren laufenden Container. Ein Deployment hält die gewünschte Anzahl Pods bereit. Ein Kubernetes-Service bietet eine stabile interne Adresse, auch wenn einzelne Pods wechseln.»

## 4. Die komplette App bedienen

| Schritt | Bedienung | Erklärung / erwartetes Ergebnis |
|---|---|---|
| 1 | Demo-Benutzer registrieren und anmelden. | Leona stellt nach erfolgreichem Login ein signiertes Token aus. Die anderen Services prüfen es und erkennen den Benutzer. |
| 2 | Leere Statistik zeigen. | Null Aufgaben; ohne erledigte Aufgaben keine berechenbare durchschnittliche Erledigungsdauer. |
| 3 | Kategorie «Demo Schule 01» mit Farbe erstellen. | Mein Service prüft Name/Farbe und speichert die Kategorie mit der Benutzer-ID aus dem Token. |
| 4 | Gleichen Namen mit anderer Grossschreibung erneut anlegen. | Duplikat wird abgewiesen. Ein eindeutiger Datenbankindex schützt die Regel auch bei gleichzeitigen Anfragen. |
| 5 | Namen und Farbe ändern, erneut laden. | Änderung ist gespeichert und bleibt sichtbar. |
| 6 | TODO «LB2 Demo vorbereiten» mit dieser Kategorie anlegen. | Dexters Service fragt bei meinem Service nach, ob die Kategorie aktiv ist und diesem Benutzer gehört. |
| 7 | TODO auf in Bearbeitung, danach erledigt setzen; Suche/Filter zeigen. | Aufgaben, Status und Priorität gehören zu Dexters Teil. |
| 8 | Statistik öffnen. | Zachary liest TODOs und Kategorienamen über unsere APIs; die eine erledigte Aufgabe erscheint in der Auswertung. |
| 9 | Kategorie löschen, TODO und Statistik erneut anschauen. | Soft-Delete setzt deleted_at. Das TODO bleibt erhalten. Neue Zuordnungen zur gelöschten Kategorie sind nicht möglich; historische Auswertung bleibt möglich. |
| 10 | Zweiten Benutzer im privaten Fenster anmelden. | Eigene Listen sind getrennt. Zusätzlich prüfen die API-Tests, dass fremde IDs nicht gelesen, geändert oder gelöscht werden können. Leere Listen allein beweisen das noch nicht. |
| 11 | Optional Profil ändern, abmelden und wieder anmelden. | Weitere Benutzerfunktionen zeigen. Kontolöschung nur mit entbehrlichen Testdaten; Behandlung von Teilfehlern ist noch offen. |

## 5. Die Verbindungen erklären

```text
Browser -> Gateway :30080
           |-> Benutzer-Service (Leona) -> Datenbank users
           |-> TODO-Service (Dexter) -> Datenbank todos
           |      `-> Kategorien-Service: Kategorie prüfen
           |-> Kategorien-Service (Naima) -> Datenbank categories
           `-> Statistik-Service (Zachary)
                  |-> TODO-Service: Aufgaben lesen
                  `-> Kategorien-Service: Namen lesen
```

«Intern verwenden wir HTTP und JSON mit Kubernetes-Service-Namen, z. B. http://category-service:3000. Beim Anlegen eines TODOs fragt Dexter GET /categories/{id} mit dem Benutzer-Token ab. Mein Service antwortet für eine eigene aktive Kategorie mit 200. Fremde, gelöschte oder unbekannte Kategorien liefern 404. Dexter lehnt eine ungültige Zuordnung ab; ist mein Service nicht erreichbar, meldet er einen vorübergehenden Fehler.

Zachary liest Kategorien mit includeDeleted=true, damit historische Namen erhalten bleiben. Die Services lesen nicht direkt in den Datenbanken der anderen.»

Optional F12 → Netzwerk/Network öffnen und beim Anlegen einer Kategorie `POST /api/categories` zeigen: JSON mit Name/Farbe und Antwort 201. Den Authorization-Header geschlossen lassen. Interne Server-zu-Server-Aufrufe erscheinen nicht direkt im Browser-Netzwerkfenster.

Im Code vorbereiten:

- services/category-service/src/auth.js: Tokenprüfung, gültige Benutzer-ID und Ablaufzeit.
- services/category-service/src/: Kategorienroute, parametrisierte SQL-Abfrage und Schema vorher selbst lesen.
- frontend/js/pages/categories.js: Formular, API-Aufrufe und Fehlermeldungen.
- deploy/ha/30-app.yaml: replicas: 2, Anti-Affinität und Service-Adressen.

## 6. Datenhaltung in einfachen Worten

«Wir haben drei logische Datenbanken: users, todos und categories. Gemeinsam liegen sie in einem PostgreSQL-Cluster mit drei Instanzen. Es sind replizierte Kopien desselben Bestands auf drei VMs, keine getrennten Daten pro Person. Auf der vierten VM läuft momentan keine vierte Datenbankkopie. Die Anwendung schreibt über todo-pg-rw zur aktuellen Primärinstanz. Erfolgreiche Schreibvorgänge werden von der Primärinstanz und mindestens einem synchronen Standby bestätigt.»

- Persistenz: Daten überleben einen Container-/Pod-Neustart.
- Replikation: Daten werden auf weitere Datenbankinstanzen übertragen.
- Hochverfügbarkeit: Mehrere Instanzen und Umschaltung ermöglichen Betrieb nach Ausfällen.
- Backup: zusätzliche wiederherstellbare Sicherung. Replikation ersetzt kein Backup, weil auch versehentliches Löschen repliziert wird.

Die lokalen Datenträger bleiben an ihre VM gebunden. Eine Umschaltung nutzt eine bereits vorhandene Datenbankkopie auf einer anderen VM.

## 7. Funktionsnachweis

Heute bestanden 35/35 API-Tests: Benutzer, TODOs, Kategorien, Statistik und kompletter Ablauf. Das beweist die geprüften Fälle, nicht Fehlerfreiheit unter allen Bedingungen.

Wiederholen auf vorbereitetem Rechner mit Node.js 22+, aus dem vollständigen Repository, in PowerShell:

```powershell
$env:BASE_URL='http://10.4.31.11:30080'
node --test tests/api/category.test.js tests/api/flow.test.js tests/api/user.test.js tests/api/todo.test.js tests/api/stats.test.js
```

Erwartung: tests 35, pass 35, fail 0. Die Suite erstellt eigene Testkonten und Daten; nicht alle werden anschliessend gelöscht. Vorher einmal selbst proben.

Eine einfache Erreichbarkeits-/DB-Prüfung auf der VM:

```bash
curl --fail http://10.4.31.11:30080/api/health/category
```

Health allein ersetzt keine fachlichen Tests.

## 8. HA live zeigen

### Eine Kategorie-Instanz ersetzen

Bei gesundem Cluster und mit dem Team abgestimmt:

```bash
microk8s kubectl -n todo-app get pods -l app=category-service -o wide
```

Einen der zwei aktuellen Namen kopieren. Im nächsten Befehl NAME_EINES_KATEGORIE_PODS ersetzen; nur einen Pod löschen:

```bash
microk8s kubectl -n todo-app delete pod NAME_EINES_KATEGORIE_PODS
microk8s kubectl -n todo-app get pods -l app=category-service -o wide
```

Im Browser eine Kategorie anlegen und erneut laden. Danach wieder zwei bereite Pods zeigen. Kubernetes kann sehr schnell einen Ersatz erstellen. Eine gerade laufende Anfrage kann beim Entfernen unterbrochen werden; den tatsächlichen Verlauf erklären.

«Die zweite Instanz und der gemeinsame Datenbestand stehen weiter zur Verfügung. Kubernetes stellt die gewünschte Anzahl wieder her. Das zeigt Service-Redundanz und automatischen Pod-Ersatz; es ist noch kein ganzer VM-Ausfall.»

### Ganzen VM-Ausfall belegen

Am 24.10. wurde jede der vier VMs einzeln vollständig im IPv4-Netz isoliert. Nach einer Umschaltphase funktionierten Schreiben, Lesen und Statistik wieder, während die VM noch getrennt war. Alle 167 bestätigten Testkategorien blieben danach erhalten. Längste beobachtete Fehlerphase: ungefähr 81 Sekunden. Keine unterbrechungsfreie Verfügbarkeit und kein physischer Stromausfalltest.

Für die Live-Wiederholung muss das vorbereitete Skript ausserhalb der betroffenen VM laufen: Node.js 22+, Zugang zu allen VM-Adressen, vorbereiteter SSH-Schlüsselzugang und installiertes Isolationsskript mit automatischer Rücknahme sind nötig. Nur eine VM gleichzeitig. Vorher und nachher vier gesunde Nodes und drei gesunde Datenbankinstanzen prüfen.

Beispiel aus dem Repository:

```text
node scripts/cluster-failure-test.cjs 11
```

Unterbricht bewusst die Verbindung zu .11 für etwa zwei Minuten; gesamter Test mehrere Minuten. Voraussetzungen vorher proben, nicht erst während der benoteten Demo. Die Ausgabe `VM=DOWN ... write/read/stats=OK` belegt erfolgreiche Vorgänge während der Störung. Die abschliessende PASS-Zeile bestätigt auch den erhaltenen Datenbestand.

Eine bereits geladene Seite kann auf einen gesunden API-Einstieg wechseln. Beim erstmaligen Öffnen oder Neuladen einer ausgefallenen URL muss eine andere VM-Adresse verwendet werden. Eine gemeinsame ausfallsichere URL fehlt.

## 9. Fragen der Lehrperson

| Frage | Antwort |
|---|---|
| Warum Soft-Delete? | Vorhandene Aufgaben behalten ihren Zusammenhang, neue Zuordnungen werden verhindert. |
| Warum die Benutzer-ID aus dem Token? | Eine ID im Request-Body wäre frei manipulierbar. Ich verwende die signierte und geprüfte Identität. |
| Wie schützt du Daten? | JWT-Prüfung, Benutzerfilter, parametrisierte SQL-Abfragen und Eingabevalidierung. Fremde Datensätze liefern 404. |
| Was verhindert doppelte Namen? | Ein partieller eindeutiger Index pro Benutzer für aktive Kategorien; Grossschreibung wird ignoriert. Die API liefert 409. |
| Läuft dein Service auf deiner VM? | Er ist mein fachlicher Teil. Kubernetes verteilt seine Pods auf Cluster-VMs; ich zeige die aktuelle Platzierung. |
| Ist HA ohne Unterbrechung? | Nein. Die Tests zeigten eine Umschaltpause; danach funktionierten vollständige Abläufe noch während der VM-Isolation. |
| Was bleibt ungeprüft? | Unter anderem physischer Stromausfall, gleichzeitiger Mehrfachausfall und vollständiger Backup-Restore. |


## Dokumentation

Massgebend ist die [gemeinsame Dokumentation](dokumentation.md) auf main. [Testnachweise](testprotokoll.md) und [Betrieb](betrieb-cluster.md). Naimas separate lokale PDF ist eine ergänzende Fassung, keine zusätzliche Pflichtabgabe. Offene Prüfungen bleiben in der gemeinsamen Doku sichtbar.
