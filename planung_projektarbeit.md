## Projektvorschlag – Verteilte TODO-Applikation

### 1. Beschreibung des verteilten Systems

Wir möchten eine verteilte TODO-Applikation entwickeln. Die Anwendung soll es Benutzern ermöglichen, ihre persönlichen Aufgaben zu erstellen, zu organisieren und deren Erledigung zu verwalten.

Das System wird in mehrere voneinander getrennte Systemkomponenten aufgeteilt. Jede Komponente übernimmt einen bestimmten Aufgabenbereich und wird von einem Gruppenmitglied entwickelt. Die einzelnen Komponenten sollen über definierte Schnittstellen miteinander kommunizieren.

Durch diese Aufteilung entsteht ein verteiltes System, bei dem die einzelnen Komponenten unabhängig voneinander entwickelt und betrieben werden können.

### 2. Aufgaben und Anforderungen des Systems

Die TODO-Applikation soll folgende Anforderungen erfüllen:

* Benutzer können erstellt, bearbeitet und gelöscht werden.
* Benutzer können sich am System anmelden.
* Benutzer können eigene TODOs erstellen, anzeigen, bearbeiten und löschen.
* TODOs können als offen oder erledigt markiert werden.
* TODOs können verschiedenen Kategorien zugeordnet werden.
* Kategorien können erstellt, bearbeitet und gelöscht werden.
* Das System soll Statistiken über die TODOs erstellen können, beispielsweise die Anzahl offener und erledigter TODOs.
* Die durchschnittliche Zeit zwischen der Erstellung und der Erledigung eines TODOs soll ausgewertet werden können.
* Die einzelnen Systemkomponenten sollen über definierte Schnittstellen miteinander kommunizieren.
* Die Komponenten sollen möglichst unabhängig voneinander betrieben werden können.
* Es sollen geeignete Massnahmen zur Erhöhung der Verfügbarkeit einzelner Systemkomponenten umgesetzt werden können.

### 3. Aufteilung in Systemkomponenten

Wir teilen die Anwendung in vier Systemkomponenten auf:

| Systemkomponente     | Aufgaben                                                                                                               | Zuständig |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| Benutzerverwaltung   | Benutzer erstellen, bearbeiten und löschen sowie Anmeldung der Benutzer                                                | Leona    |
| TODO-Verwaltung      | TODOs erstellen, anzeigen, bearbeiten, löschen und als erledigt markieren                                              | Dexter    |
| Kategorienverwaltung | Kategorien erstellen, bearbeiten und löschen sowie die Zuordnung von TODOs zu Kategorien ermöglichen                   | Naima    |
| Statistik            | Daten der TODOs auswerten und Statistiken wie offene/erledigte TODOs und durchschnittliche Bearbeitungsdauer erstellen | Zachary    |

Die einzelnen Komponenten werden später über gemeinsam definierte Schnittstellen miteinander verbunden. Dadurch können die Gruppenmitglieder ihre jeweilige Komponente weitgehend unabhängig entwickeln und anschliessend in das Gesamtsystem integrieren.

### 4. Bestehende Software

Wir verwenden keine bestehende Software als Basis, sondern entwickeln die Anwendung selbst.

Daher gibt es keine bestehende Applikation, die als ZIP-Datei abgegeben werden muss.