// TODO-Service (Dexter): TODOs CRUD, Status, Kategoriezuordnung.
const express = require('express');
const { pool } = require('./db');
const { requireAuth } = require('./auth');
const { callService } = require('./client');
const { STATUSES, PRIORITIES, completedAtFor } = require('./status');
const { HttpError, requestContext, notFound, errorHandler, isUuid } = require('./http');
const health = require('./health');

// Sortierung: unerledigte zuerst, dann nach Priorität (hoch zuerst), dann neueste zuerst.
const ORDER = "status = 'done', CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC";
const CATEGORY_URL = process.env.CATEGORY_SERVICE_URL || 'http://category-service:3000';

function toJson(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function validateTitle(title) {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Der Titel muss 1 bis 200 Zeichen lang sein');
  }
  return title.trim();
}
function validateDescription(desc) {
  if (desc === undefined || desc === null) return '';
  if (typeof desc !== 'string' || desc.length > 2000) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Die Beschreibung darf höchstens 2000 Zeichen lang sein');
  }
  return desc;
}
function validatePriority(priority) {
  if (!PRIORITIES.includes(priority)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Priorität muss einer dieser Werte sein: ${PRIORITIES.join(', ')}`);
  }
  return priority;
}
function validateStatus(status) {
  if (!STATUSES.includes(status)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Status muss einer dieser Werte sein: ${STATUSES.join(', ')}`);
  }
  return status;
}

// F06 + Regel 5.3.1: Die Kategorie muss dem Benutzer gehören und aktiv sein.
// Wir fragen den Kategorien-Service (Naima) mit dem Token des Benutzers. Er antwortet 404 bei fremden/gelöschten Kategorien.
async function checkCategory(req, categoryId) {
  if (categoryId === null) return null; // TODO ohne Kategorie ist erlaubt
  if (!isUuid(categoryId)) throw new HttpError(400, 'VALIDATION_ERROR', 'categoryId muss eine UUID oder null sein');
  const res = await callService('Der Kategorien-Service', `${CATEGORY_URL}/categories/${categoryId}`, {
    token: req.token,
    requestId: req.id,
  });
  if (res.status === 404) {
    throw new HttpError(422, 'CATEGORY_NOT_FOUND', 'Diese Kategorie existiert nicht oder wurde gelöscht');
  }
  if (!res.ok) throw new HttpError(502, 'CATEGORY_CHECK_FAILED', 'Kategorie konnte nicht geprüft werden');
  return categoryId;
}

async function findOwn(req) {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'TODO_NOT_FOUND', 'TODO nicht gefunden');
  // N02: immer nach id UND user_id suchen. Fremde TODOs sind "nicht gefunden" (verrät nicht, dass sie existieren).
  const { rows } = await pool.query('SELECT * FROM todos WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'TODO_NOT_FOUND', 'TODO nicht gefunden');
  return rows[0];
}

const app = express();
app.use(express.json());
app.use(requestContext('todo-service'));
app.use(health('todo-service'));
app.use('/todos', requireAuth);

// F03: Liste. Zusatzfeatures: Filter nach Status / Kategorie / Priorität und Suche im Titel (?q=).
// Wird auch vom Statistik-Service genutzt (ohne Filter = alle TODOs des Benutzers).
app.get('/todos', async (req, res) => {
  const where = ['user_id = $1'];
  const params = [req.user.id];
  if (req.query.status) {
    params.push(validateStatus(req.query.status));
    where.push(`status = $${params.length}`);
  }
  if (req.query.priority) {
    params.push(validatePriority(req.query.priority));
    where.push(`priority = $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${String(req.query.q).replace(/[\\%_]/g, '\\$&')}%`); // Platzhalter % und _ maskieren
    where.push(`title ILIKE $${params.length}`);
  }
  if (req.query.categoryId) {
    if (!isUuid(req.query.categoryId)) throw new HttpError(400, 'VALIDATION_ERROR', 'categoryId muss eine UUID sein');
    params.push(req.query.categoryId);
    where.push(`category_id = $${params.length}`);
  }
  const { rows } = await pool.query(`SELECT * FROM todos WHERE ${where.join(' AND ')} ORDER BY ${ORDER}`, params);
  res.json(rows.map(toJson));
});

// F03: Erstellen
app.post('/todos', async (req, res) => {
  const body = req.body || {};
  const title = validateTitle(body.title);
  const description = validateDescription(body.description);
  const status = body.status === undefined ? 'open' : validateStatus(body.status);
  const priority = body.priority === undefined ? 'medium' : validatePriority(body.priority);
  const categoryId = await checkCategory(req, body.categoryId ?? null);
  const completedAt = completedAtFor(null, status, null);
  const { rows } = await pool.query(
    `INSERT INTO todos (user_id, title, description, status, priority, category_id, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.user.id, title, description, status, priority, categoryId, completedAt],
  );
  res.status(201).json(toJson(rows[0]));
});

app.get('/todos/:id', async (req, res) => {
  res.json(toJson(await findOwn(req)));
});

// F03/F04/F06: Bearbeiten, Status ändern, Kategorie setzen/entfernen
app.patch('/todos/:id', async (req, res) => {
  const todo = await findOwn(req);
  const body = req.body || {};
  const title = body.title !== undefined ? validateTitle(body.title) : todo.title;
  const description = body.description !== undefined ? validateDescription(body.description) : todo.description;
  const status = body.status !== undefined ? validateStatus(body.status) : todo.status;
  const priority = body.priority !== undefined ? validatePriority(body.priority) : todo.priority;
  let categoryId = todo.category_id;
  // Nur prüfen, wenn sich die Kategorie ändert: ein TODO mit inzwischen gelöschter Kategorie bleibt bearbeitbar.
  if (body.categoryId !== undefined && body.categoryId !== todo.category_id) {
    categoryId = await checkCategory(req, body.categoryId);
  }
  const completedAt = completedAtFor(todo.status, status, todo.completed_at);
  const { rows } = await pool.query(
    `UPDATE todos SET title = $1, description = $2, status = $3, priority = $4, category_id = $5, completed_at = $6,
       updated_at = now()
     WHERE id = $7 AND user_id = $8 RETURNING *`,
    [title, description, status, priority, categoryId, completedAt, todo.id, req.user.id],
  );
  res.json(toJson(rows[0]));
});

app.delete('/todos/:id', async (req, res) => {
  const todo = await findOwn(req);
  await pool.query('DELETE FROM todos WHERE id = $1 AND user_id = $2', [todo.id, req.user.id]);
  res.status(204).end();
});

// Regel 5.3.3: alle eigenen TODOs löschen. Wird vom Benutzer-Service beim Löschen des Kontos aufgerufen.
app.delete('/todos', async (req, res) => {
  await pool.query('DELETE FROM todos WHERE user_id = $1', [req.user.id]);
  res.status(204).end();
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
