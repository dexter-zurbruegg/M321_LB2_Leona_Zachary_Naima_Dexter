# Gemeinsame Präsentation und Demo

Vorgesehener Ablauf für 02.11.2026; keine Behauptung, dass die Teamdemo schon geprobt wurde. Aktiver Cluster auf Port 30080; nicht die alten Compose-Demo-Befehle ausführen. [Ausführlicher Bedien- und Sprechzettel](demo-naima.md).

## Rollen und Ablauf (etwa 20 Minuten)

| Zeit | Wer | Vorführen / erklären |
|---|---|---|
| 0–2 min | Dexter | Zweck, Verantwortlichkeiten, main als vollständiger Abgabestand |
| 2–4 min | Leona | Architektur: vier VMs, Service-Adressen, zwei Pods je Service, drei DB-Instanzen |
| 4–6 min | Leona | Testkonto registrieren, Login, Profil; Tokenprinzip ohne echte Tokens zu veröffentlichen |
| 6–9 min | Naima | Kategorie/Farbe, Änderung, Duplikat ablehnen; Eingabe- und Besitzprüfung im Code |
| 9–11 min | Dexter | TODO mit Kategorie, Status/Priorität, Filter; Aufruf von Naimas Prüf-Endpunkt |
| 11–13 min | Zachary | Statistik, leeres Konto/keine Daten, erledigtes TODO, historische Kategorienamen |
| 13–14 min | Naima | Soft-Delete: vorhandenes TODO bleibt; zweiter Benutzer hat getrennte Daten |
| 14–18 min | Naima + Zachary | Geprobtes einzelnes Ausfallszenario, Fehlerphase sichtbar erklären, Erfolg während Störung, Rückkehr prüfen |
| 18–20 min | alle | Testnachweise, Grenzen, Fazit und Fragen |

## Vorbereiten und Gesundheitszustand zeigen

Schulnetz/VPN, eigenes Testkonto, zweites privates Browserfenster, lokale Nachweise, SSH-Terminal. Alle Einstiege bereithalten: http://10.4.31.11:30080 und .13/.16/.17. Keine persönlichen Daten oder Secrets präsentieren.

```bash
microk8s kubectl get nodes
microk8s kubectl -n todo-app get deployments
microk8s kubectl -n todo-app get pods -o wide
microk8s kubectl -n todo-app get cluster todo-pg
```

Erwartet: vier Ready-Nodes, fünf Deployments 2/2, DB 3/3. Pod-Platzierung kann wechseln; aktuelle Ausgabe erklären. Kein automatisches Umschalten der Schul-VMs auf einen anderen Stack für die Demo.

## Funktions- und Ausfallnachweis

Die API-Suite prüft 35 Fälle über das Gateway; Befehl im [Testprotokoll](testprotokoll.md). Ein Pod-Ersatz zeigt Service-Redundanz, beweist aber keinen ganzen VM-Ausfall. Ein einzelner Kategorie-Pod kann nach Anzeige des aktuellen Namens gezielt entfernt werden; Kubernetes erstellt Ersatz. Währenddessen im Browser arbeiten. Laufende Anfragen können scheitern.

Der vorbereitete VM-Test lautet `node scripts/cluster-failure-test.cjs 11`, von einem Testclient ausserhalb .11. Voraussetzungen: Node.js 22+, SSH-Schlüsselzugang als ubuntu, installiertes Isolationsskript, automatische Rücknahme, alle Nodes und Datenbankinstanzen vorher gesund. Nur eine VM gleichzeitig, mit dem Team abgestimmt. Ungefähr zwei Minuten Isolation, mehrere Minuten Gesamtlauf. Vorher proben; keine unvorbereitete Abschaltung während der benoteten Demo.

`VM=DOWN ... write/read/stats=OK` zeigt Erfolg während der Störung. Die PASS-Zeile prüft auch bestätigte Daten an allen Einstiegen. Anschliessend vier Ready-Nodes, App-Replikate und drei bereite DB-Instanzen kontrollieren. Die historische längste Fehlerphase betrug etwa 81 s; nicht durch Compose-Neustartzeiten ersetzen und keine Null-Unterbrechung behaupten.

## Plan bei Problemen

- Schulnetz/VPN prüfen; bei ausgefallener Einstiegsadresse eine andere VM-URL öffnen. Eine bereits geladene Seite kann ihre API-Adresse wechseln, Erstaufruf/Reload einer toten URL nicht.
- Fehlermeldung zeigen, Status/Logs prüfen; keine wiederholten unklaren Schreibvorgänge blind auslösen.
- Bei noch ungesundem Cluster keinen weiteren Ausfalltest starten; automatische Rücknahme abwarten und Zustand prüfen.
- Falls Live-Netz nicht verfügbar: lokale Doku, Screenshot und Rohprotokolle zeigen und klar als frühere Nachweise bezeichnen.
- Bekannte Grenzen nennen: JWT-Vertragsprüfung bei Benutzer/TODO, nichtatomare Kontolöschung, ausstehende Coverage/GUI-/Restore-Prüfungen.
