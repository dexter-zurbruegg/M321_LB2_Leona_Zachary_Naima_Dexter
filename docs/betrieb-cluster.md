# Installation und Betrieb des LernMAAS-Clusters

Stand: 26.10.2026. Diese Anleitung unterscheidet den **eingerichteten und geprüften Cluster** von einer Neuinstallation. Vollständiger Wiederaufbau aus leeren VMs und Backup-Restore wurden noch nicht abgenommen.

## Bestehenden Cluster prüfen

Schulnetz/VPN, SSH als ubuntu und MicroK8s-Berechtigung sind nötig. Repository auf allen vier VMs: `/home/ubuntu/m321-ha-20261024/repository`. Der ausgeführte App-Stand basiert auf `f74f737`; reine Doku-Commits erfordern keinen Container-Neustart.

```bash
ssh ubuntu@10.4.31.11
cd /home/ubuntu/m321-ha-20261024/repository
microk8s kubectl get nodes
microk8s kubectl -n todo-app get deployments
microk8s kubectl -n todo-app get pods -o wide
microk8s kubectl -n todo-app get cluster todo-pg
microk8s kubectl -n todo-app get pvc
microk8s kubectl apply --dry-run=server -k deploy/ha
curl --fail http://10.4.31.11:30080/api/health/category
```

Erwartet: vier Ready-Nodes, fünf Deployments 2/2, drei bereite PostgreSQL-Instanzen und gebundene Datenvolumes. Health allein ersetzt keinen Funktionstest.

## Konfiguration und Neuaufbau-Voraussetzungen

| Bestandteil | Datei / Voraussetzung |
|---|---|
| Vier MicroK8s-Knoten | Gegenseitige Erreichbarkeit, DNS, passende Ressourcen; v1.35.6 im geprüften Aufbau |
| Lokale Datenpfade / Node-Namen | `deploy/ha/10-storage.yaml`; Pfade und Berechtigungen vorbereiten, bestehende Daten erhalten |
| CloudNativePG | Operator und CRDs v1.30.1 vor den Cluster-/Database-Ressourcen installieren; `deploy/ha/operator-ha-patch.yaml` für Operator-Replikate |
| DNS | `deploy/ha/dns-ha-patch.yaml` für zwei CoreDNS-Replikate |
| Datenbank | `deploy/ha/20-postgres.yaml`: drei Instanzen, Rollen, drei Datenbanken |
| App/Gateway | `deploy/ha/30-app.yaml`: zwei Replikate, Probes, Anti-Affinität, NodePort 30080 |
| Images | Manifest-Images mit Tag `ha-20261024` auf jedem möglichen Ausführungsknoten bereitstellen; `imagePullPolicy: IfNotPresent` |
| Secrets | Private Datei: `JWT_SECRET`, `USER_DB_PASSWORD`, `TODO_DB_PASSWORD`, `CATEGORY_DB_PASSWORD`; niemals in Git |
| Secret-Übernahme | Nach angelegtem Namespace: `python3 scripts/ha-secrets.py /absoluter/pfad/zur/privaten.env`; bestehende Secrets nicht unkoordiniert ersetzen |
| Migration | Alte Daten sichern; users/todos/categories mit Eigentümern übernehmen und vergleichen; kein automatischer Neuaufbau-/Restore-Nachweis |

Nach erfüllten Voraussetzungen serverseitig mit `--dry-run=server` prüfen, dann `microk8s kubectl apply -k deploy/ha` und Bereitschaft kontrollieren. Das installiert weder Operator noch Images oder Hostkorrekturen. Es ist **kein vollständiger Ein-Befehl-Installer**.

Alte Compose-Stacks sind gestoppt, automatischer Neustart deaktiviert; Volumes und Migrationssicherungen bleiben erhalten. `scripts/k8s-deploy.sh` gehört zur älteren Einzel-Datenbank-Variante und verweigert bei vorhandenem `todo-pg` den Einsatz. Den aktiven Cluster nicht durch `deploy/k8s` oder einen Compose-Vollstack ersetzen.

## Korrektur der Steuerungsebene

Frühe Isolationstests zeigten hängende dqlite-Beobachtungen bzw. Kubernetes-Schreibzugriffe. Alle vier VMs verwenden k8s-dqlite v1.8.1 mit Upstream-Patch 365, gebaut mit Go 1.24.13. Upstream-Watch-Tests bestanden. Patch und Build-Hinweise: `deploy/ha/k8s-dqlite-watch.patch`, `scripts/install-dqlite-watchfix.sh`.

Binärdatei: `/usr/local/lib/m321/k8s-dqlite-watchfix`; SHA256 `2fe34ebb74d621963816f39e22cfabad5d2a0f0071f40605bcc66e236fc9cc7e`. Ein systemd-Drop-in wählt diese Datei, das originale Snap bleibt erhalten. Versionsbezogene Einstellungen: `deploy/ha/control-plane-compat.sh`.

`scripts/microk8s-watchdog.py` prüft echte Schreibzugriffe mit Änderungsmeldung. Timer ungefähr alle 15 s; notwendige Wiederherstellung über Lease mit gesundem Nachbarknoten koordiniert. Installation: `scripts/install-watchdog.sh`. Hoständerungen nur nacheinander mit Prüfung zwischen den VMs; kein normaler Demo-Schritt.

## Logs und Diagnose

```bash
microk8s kubectl -n todo-app logs deployment/category-service --all-pods=true --tail=100
microk8s kubectl -n todo-app get events --sort-by=.lastTimestamp
sudo systemctl status m321-watchdog.timer --no-pager
sudo journalctl -u m321-watchdog.service -n 40 --no-pager
```

JSON-Logs und `X-Request-Id` helfen beim Nachverfolgen; `X-Instance` nennt den antwortenden Pod. Keine Token/Secrets protokollieren.

## Lokale Entwicklungsvariante: Docker Compose

Auf separatem Entwicklungssystem mit Docker/Compose und Checkout von `main`:

```bash
./scripts/init-env.sh
docker compose up -d --build
docker compose ps
```

Standard: `http://localhost:8080`, lokale Variante mit einzelner PostgreSQL-Instanz. Separate Compose-Dateien erlauben Einzelstarts auf 8081–8084; Abhängigkeiten und gemeinsames JWT-Secret entsprechend setzen. Statistik benötigt keine DB. Diese Varianten wurden nicht alle am 26.10. erneut geprüft.

## Wiederherstellung und offene Aufgaben

Nach Störung Erreichbarkeit, Nodes, Pods, Primärinstanz und Readiness prüfen. Vor weiterem Ausfalltest vollständigen gesunden Zustand abwarten. Regelmässige Backups mit Restore-Probe bleiben offen. Disk-Auslastung mit überwachen, besonders auf .17. Voraussetzungen eines kompletten Neuaufbaus vor Durchführung separat prüfen.
