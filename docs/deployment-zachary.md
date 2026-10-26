# Statistik im gemeinsamen LernMAAS-Cluster

Stand 26.10.2026. Die frühere Anleitung mit getrennten VM-Ports 8082/8083/8084 ist durch den gemeinsamen MicroK8s-Betrieb ersetzt. Frontend, APIs und 35/35 Integrationstests sind im vollständigen Stand auf main enthalten.

`stats-service` läuft zweifach im Namespace todo-app. Die interne Kommunikation verwendet `http://todo-service:3000` und `http://category-service:3000`, mit dem Benutzer-JWT. Der Service hat keine eigene Datenbank. Das Gateway stellt `/api/stats` an allen vier VM-Adressen auf Port 30080 bereit.

```bash
microk8s kubectl -n todo-app get pods -l app=stats-service -o wide
microk8s kubectl -n todo-app logs deployment/stats-service --all-pods=true --tail=100
curl --fail http://10.4.31.17:30080/api/health/stats
```

Health prüft den Prozess; die fachliche Abfrage prüft die Abhängigkeiten. API-Tests TC-S01–S05 bestanden erneut am 26.10. Die Cluster-Ausfallnachweise stammen vom 24.10. Diese gemeinsamen Resultate ersetzen keine persönliche Testdurchführung oder individuelle Erklärung durch Zachary.

Konfiguration, Images, Secrets, Probes und Neuaufbau-Voraussetzungen: [Clusterbetrieb](betrieb-cluster.md). Messwerte und offene Tests: [Testprotokoll](testprotokoll.md). Demo: [Präsentation](praesentation.md). Separate Compose-Dateien bleiben für lokale Entwicklung verfügbar, sind nicht der aktive gemeinsame Betrieb.
