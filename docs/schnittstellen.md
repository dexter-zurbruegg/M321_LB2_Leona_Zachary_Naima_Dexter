# Schnittstellen (API-Verträge)

Dieses Dokument ist der gemeinsame Vertrag zwischen den vier Services und dem Frontend.
Wer eine Schnittstelle ändert, muss das mit allen abstimmen, die sie benutzen (siehe Tabelle «Wer ruft wen auf»).

## 1. Gemeinsame Regeln

| Thema | Vereinbarung |
|---|---|
| Protokoll | HTTP/1.1 mit JSON (`Content-Type: application/json`), UTF-8 |
| Einstiegspunkt | Browser und Tests rufen nur den Reverse Proxy auf: `http://<host>:8080/api/...`. Der Proxy entfernt `/api` und leitet an den Service weiter (z. B. `/api/todos` → todo-service `/todos`). |
| Service-Ports | Jeder Service hört intern auf Port `3000`. Einzeln gestartet (N01): user `8081`, todo `8082`, category `8083`, stats `8084`. |
| IDs | UUID v4 als String, z. B. `"3f2b9c1e-8d4a-4f6b-9c2e-1a2b3c4d5e6f"` |
| Zeiten | ISO-8601 in UTC, z. B. `"2026-10-20T08:15:00.000Z"` |
| Statuswerte TODO | `open` (offen), `in_progress` (in Bearbeitung), `done` (erledigt) |
| Prioritäten TODO | `low`, `medium` (Standard), `high` |
| Namen der Felder | camelCase (`categoryId`, `createdAt`) |
| Fremde Daten | Gehört ein Objekt einem anderen Benutzer, antwortet der Service mit **404** (nicht 403). So verrät er nicht, dass es existiert (N02). |
| Korrelations-ID | Der Proxy setzt `X-Request-Id`. Jeder Service loggt sie und gibt sie bei Aufrufen an andere Services weiter. Jede Antwort enthält `X-Request-Id` und `X-Instance` (Container/Pod, der geantwortet hat). |

### 1.1 Authentifizierung: JWT-Format (Leona → alle)

Nach dem Login erhält das Frontend ein **JSON Web Token**. Es wird bei jedem geschützten Aufruf mitgeschickt:

```
Authorization: Bearer <token>
```

| Teil | Wert |
|---|---|
| Algorithmus | `HS256` (HMAC mit SHA-256). Alle Services kennen dasselbe Secret `JWT_SECRET` aus der `.env` bzw. dem Kubernetes-Secret. |
| Claim `sub` | ID des Benutzers (UUID). **Die einzige Quelle für die Benutzer-ID.** Eine `userId` im Body oder in der URL wird nie akzeptiert. |
| Claim `email` | E-Mail-Adresse (nur Information) |
| Claim `iss` | `user-service`. Andere Aussteller werden abgelehnt. |
| Claims `iat` / `exp` | Ausgestellt / gültig bis (Unix-Sekunden). Gültigkeit: `JWT_TTL_SECONDS`, Standard 3600 s = 1 Stunde. |

Beispiel-Payload:

```json
{ "sub": "3f2b9c1e-8d4a-4f6b-9c2e-1a2b3c4d5e6f", "email": "lea@example.com", "iat": 1792483200, "exp": 1792486800, "iss": "user-service" }
```

Jeder Service prüft das Token selbst (Signatur, Ablaufzeit, Aussteller), ohne den Benutzer-Service zu fragen.
Fehlt das Token oder ist es ungültig, folgt `401 UNAUTHORIZED`.

**Abmelden:** Das Token ist zustandslos. Beim Abmelden löscht das Frontend es aus dem `localStorage`.
`POST /auth/logout` bestätigt nur (204). Ein gestohlenes Token bliebe bis `exp` gültig. Deshalb ist die Gültigkeit kurz (1 h).

### 1.2 Fehlerformat (alle Services)

Jede Fehlerantwort hat dieselbe Form. `message` ist auf Deutsch und kann direkt im Frontend angezeigt werden (F10).

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Der Titel muss 1 bis 200 Zeichen lang sein" } }
```

| HTTP | `code` (Beispiele) | Bedeutung |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON` | Eingabe ungültig |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | nicht angemeldet / Token ungültig / Login falsch |
| 403 | `WRONG_PASSWORD` | aktuelles Passwort falsch (Profiländerung) |
| 404 | `NOT_FOUND`, `TODO_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `USER_NOT_FOUND` | existiert nicht **oder gehört jemand anderem** |
| 409 | `EMAIL_TAKEN`, `CATEGORY_EXISTS` | Konflikt (doppelt) |
| 422 | `CATEGORY_NOT_FOUND` | TODO verweist auf eine fremde/gelöschte Kategorie |
| 500 | `INTERNAL` | unerwarteter Fehler (Details nur im Log) |
| 503 | `DEPENDENCY_UNAVAILABLE`, `SERVICE_UNAVAILABLE` | ein benötigter Service ist nicht erreichbar |

### 1.3 Health-Endpunkte (alle Services)

| Endpunkt | Antwort | Wofür |
|---|---|---|
| `GET /health` | `200 {"status":"ok","service":"todo-service","instance":"…","db":"ok"}`, bei DB-Problem `503` | Docker-Healthcheck, Kubernetes-readinessProbe |
| `GET /health/live` | `200` solange der Prozess läuft | Kubernetes-livenessProbe |

Über den Proxy: `GET /api/health/user`, `/api/health/todo`, `/api/health/category`, `/api/health/stats`.

### 1.4 Aufrufe zwischen Services, Timeouts, Ausfälle

| Wer ruft wen auf | Endpunkt | Zweck | Bei Ausfall |
|---|---|---|---|
| todo-service → category-service | `GET /categories/{id}` | Gehört die Kategorie dem Benutzer und ist sie aktiv? | TODO **mit** Kategorie speichern: `503`. TODOs anzeigen und ohne Kategorie speichern: funktioniert weiter. |
| stats-service → todo-service | `GET /todos` | Alle TODOs des Benutzers für die Auswertung | `503` mit Meldung «Der TODO-Service ist gerade nicht erreichbar …» |
| stats-service → category-service | `GET /categories?includeDeleted=true` | Namen und Farben für «pro Kategorie» | Statistik kommt trotzdem, `categoriesAvailable: false`, Namen `null` |
| user-service → todo-service | `DELETE /todos` | Konto löschen: alle TODOs weg | `503`, Konto bleibt bestehen (nichts halb gelöscht) |
| user-service → category-service | `DELETE /categories` | Konto löschen: alle Kategorien weg | wie oben |

- Der aufrufende Service schickt das **Token des Benutzers** mit. So prüft der aufgerufene Service selbst, wem die Daten gehören.
- **Timeout 2 s** pro Aufruf (`SERVICE_TIMEOUT_MS`). Bei einem Verbindungsfehler folgt **ein zweiter Versuch** (die andere Instanz kann antworten). Nach einem Timeout gibt es keinen zweiten Versuch.
- Adressen sind konfigurierbar: `TODO_SERVICE_URL`, `CATEGORY_SERVICE_URL` (Standard: `http://todo-service:3000` usw.).

---

## 2. Benutzer-Service (Leona)

Datenbank `users`: `id, email (eindeutig), password_hash (bcrypt), display_name, created_at, updated_at`

| Methode & Pfad | Auth | Body | Erfolg | Fehler |
|---|---|---|---|---|
| `POST /users` | – | `{ "email", "password" (≥ 8), "displayName" (1–50) }` | `201` Benutzer | 400, 409 `EMAIL_TAKEN` |
| `POST /auth/login` | – | `{ "email", "password" }` | `200 { "token", "expiresAt", "user" }` | 401 `INVALID_CREDENTIALS` |
| `POST /auth/logout` | ✔ | – | `204` | 401 |
| `GET /users/me` | ✔ | – | `200` Benutzer | 401, 404 (Konto gelöscht) |
| `PATCH /users/me` | ✔ | `{ "displayName"?, "email"?, "password"?, "currentPassword"? }` | `200` Benutzer | 400, 403 `WRONG_PASSWORD`, 409 |
| `DELETE /users/me` | ✔ | – | `204` | 401, 503 |

- Für eine neue E-Mail oder ein neues Passwort braucht es `currentPassword`.
- `DELETE /users/me` (Regel 5.3.3): löscht zuerst alle TODOs und Kategorien über deren Services, danach das Konto. Danach ist kein Login mehr möglich.

Benutzer-Objekt (nie mit Passwort oder Hash):

```json
{ "id": "3f2b…", "email": "lea@example.com", "displayName": "Lea", "createdAt": "2026-10-20T08:00:00.000Z", "updatedAt": "2026-10-20T08:00:00.000Z" }
```

## 3. TODO-Service (Dexter)

Datenbank `todos`: `id, user_id, title, description, status, priority, category_id (ohne Fremdschlüssel), created_at, updated_at, completed_at`

| Methode & Pfad | Body / Query | Erfolg | Fehler |
|---|---|---|---|
| `GET /todos` | Query optional: `status`, `priority`, `categoryId`, `q` (Suche im Titel) | `200 [TODO, …]` | 400 |
| `POST /todos` | `{ "title" (1–200), "description"?, "status"?, "priority"?, "categoryId"? }` | `201` TODO | 400, 422, 503 |
| `GET /todos/{id}` | – | `200` TODO | 404 |
| `PATCH /todos/{id}` | beliebige Felder aus POST; `"categoryId": null` entfernt die Kategorie | `200` TODO | 400, 404, 422, 503 |
| `DELETE /todos/{id}` | – | `204` | 404 |
| `DELETE /todos` | – (alle eigenen TODOs, nur für Konto löschen) | `204` | 401 |

Alle Endpunkte brauchen ein gültiges Token.

- **Sortierung:** unerledigte zuerst, dann Priorität (hoch → tief), dann neueste zuerst.
- **Status (Regel 5.3.4):** Wechsel auf `done` setzt `completedAt` auf jetzt. Wechsel weg von `done` setzt `completedAt` auf `null`.
- **Kategorie (F06, Regel 5.3.1):** höchstens eine pro TODO. Wird `categoryId` gesetzt oder geändert, fragt der Service den Kategorien-Service. Bei `404` folgt `422 CATEGORY_NOT_FOUND`. Bleibt die Kategorie gleich, wird sie nicht neu geprüft. So bleibt ein TODO mit einer inzwischen gelöschten Kategorie bearbeitbar.

```json
{ "id": "9a1c…", "title": "M321 Doku", "description": "", "status": "done", "priority": "high",
  "categoryId": "77e0…", "createdAt": "2026-10-20T08:00:00.000Z", "updatedAt": "2026-10-20T10:00:00.000Z",
  "completedAt": "2026-10-20T10:00:00.000Z" }
```

## 4. Kategorien-Service (Naima)

Datenbank `categories`: `id, user_id, name, color, created_at, updated_at, deleted_at`. Ein Name ist pro Benutzer unter den aktiven Kategorien eindeutig, ohne Rücksicht auf Gross-/Kleinschreibung.

| Methode & Pfad | Body / Query | Erfolg | Fehler |
|---|---|---|---|
| `GET /categories` | Query optional: `includeDeleted=true` | `200 [Kategorie, …]` (nach Name sortiert) | 401 |
| `POST /categories` | `{ "name" (1–40), "color"? ("#rrggbb", Standard "#2f6fed") }` | `201` Kategorie | 400, 409 `CATEGORY_EXISTS` |
| `GET /categories/{id}` | – | `200` Kategorie, **nur wenn eigen und aktiv** | 404 |
| `PATCH /categories/{id}` | `{ "name"?, "color"? }` | `200` Kategorie | 400, 404, 409 |
| `DELETE /categories/{id}` | – | `204` (Soft-Delete) | 404 |
| `DELETE /categories` | – (alle eigenen, endgültig, nur für Konto löschen) | `204` | 401 |

- `GET /categories/{id}` ist der **Prüf-Endpunkt für den TODO-Service**: `200` heisst «darf zugeordnet werden», `404` heisst «nein».
- **Löschen (Regel 5.3.2):** Soft-Delete. `deletedAt` wird gesetzt, der Datensatz bleibt. Bestehende TODOs behalten ihre `categoryId`, das Frontend zeigt die Kategorie durchgestrichen. Neue Zuordnungen sind nicht mehr möglich.

```json
{ "id": "77e0…", "name": "Schule", "color": "#2f6fed", "createdAt": "…", "updatedAt": "…", "deletedAt": null }
```

## 5. Statistik-Service (Zachary)

Keine eigene Datenbank. Er rechnet bei jeder Anfrage mit den aktuellen Daten von TODO- und Kategorien-Service.

| Methode & Pfad | Erfolg | Fehler |
|---|---|---|
| `GET /stats` | `200` Statistik | 401, 503 (TODO-Service nicht erreichbar) |

```json
{
  "open": 2, "inProgress": 1, "done": 3, "total": 6,
  "averageCompletionSeconds": 5400,
  "completedLast7Days": 2,
  "categoriesAvailable": true,
  "byCategory": [
    { "categoryId": "77e0…", "name": "Schule", "color": "#2f6fed", "deleted": false,
      "open": 1, "inProgress": 0, "done": 2, "total": 3, "averageCompletionSeconds": 3600 },
    { "categoryId": null, "name": "Ohne Kategorie", "color": null, "deleted": false,
      "open": 1, "inProgress": 1, "done": 1, "total": 3, "averageCompletionSeconds": 9000 }
  ]
}
```

- **F07:** `open`, `inProgress`, `done` zählen die TODOs nach Status.
- **F08:** `averageCompletionSeconds` ist der Durchschnitt von `completedAt − createdAt` über alle **aktuell** erledigten TODOs. `null` heisst «Keine Daten». Das Frontend zeigt dann genau diesen Text.
