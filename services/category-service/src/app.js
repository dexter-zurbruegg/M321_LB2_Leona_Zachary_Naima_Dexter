// Kategorien-Service (Naima): Kategorien CRUD + Prüf-Endpunkt für den TODO-Service.
const express = require('express');
const { pool } = require('./db');
const { requireAuth } = require('./auth');
const { HttpError, requestContext, notFound, errorHandler, isUuid } = require('./http');
const health = require('./health');

function toJson(row) {
  return { id: row.id, name: row.name, color: row.color, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at };
}

function validateName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Der Name muss 1 bis 40 Zeichen lang sein');
  }
  return name.trim();
}

// N02: nur eigene, nicht gelöschte Kategorien. Fremde oder gelöschte -> 404.
async function findOwnActive(req) {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Kategorie nicht gefunden');
  const { rows } = await pool.query(
    'SELECT * FROM categories WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [req.params.id, req.user.id],
  );
  if (!rows[0]) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Kategorie nicht gefunden');
  return rows[0];
}

// Farbe für die Anzeige im Frontend, als Hex-Wert #rrggbb. Ohne Angabe: Standardblau.
const DEFAULT_COLOR = '#2f6fed';
function validateColor(color) {
  if (color === undefined) return undefined;
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Die Farbe muss ein Hex-Wert wie #2f6fed sein');
  }
  return color.toLowerCase();
}

function duplicateName(err) {
  if (err.code === '23505') return new HttpError(409, 'CATEGORY_EXISTS', 'Eine Kategorie mit diesem Namen gibt es schon');
  return err;
}

const app = express();
app.use(express.json());
app.use(requestContext('category-service'));
app.use(health('category-service'));
app.use('/categories', requireAuth);

// F05: eigene Kategorien. ?includeDeleted=true liefert auch gelöschte (Frontend zeigt dann "(gelöscht)" beim TODO).
app.get('/categories', async (req, res) => {
  const includeDeleted = req.query.includeDeleted === 'true';
  const { rows } = await pool.query(
    `SELECT * FROM categories WHERE user_id = $1 ${includeDeleted ? '' : 'AND deleted_at IS NULL'} ORDER BY lower(name)`,
    [req.user.id],
  );
  res.json(rows.map(toJson));
});

app.post('/categories', async (req, res) => {
  const name = validateName(req.body?.name);
  const color = validateColor(req.body?.color) ?? DEFAULT_COLOR;
  try {
    const { rows } = await pool.query('INSERT INTO categories (user_id, name, color) VALUES ($1, $2, $3) RETURNING *', [
      req.user.id,
      name,
      color,
    ]);
    res.status(201).json(toJson(rows[0]));
  } catch (err) {
    throw duplicateName(err);
  }
});

// Prüf-Endpunkt für den TODO-Service (Dexter): 200 = gehört dem Benutzer und ist aktiv, sonst 404.
app.get('/categories/:id', async (req, res) => {
  res.json(toJson(await findOwnActive(req)));
});

app.patch('/categories/:id', async (req, res) => {
  const category = await findOwnActive(req);
  const body = req.body || {};
  const name = body.name !== undefined ? validateName(body.name) : category.name;
  const color = validateColor(body.color) ?? category.color;
  try {
    const { rows } = await pool.query(
      'UPDATE categories SET name = $1, color = $2, updated_at = now() WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, color, category.id, req.user.id],
    );
    res.json(toJson(rows[0]));
  } catch (err) {
    throw duplicateName(err);
  }
});

// Regel 5.3.2: Soft-Delete. Die Kategorie bleibt in der DB (deleted_at gesetzt), bestehende TODOs behalten ihre categoryId.
// Neue Zuordnungen sind nicht mehr möglich, weil GET /categories/:id jetzt 404 liefert.
app.delete('/categories/:id', async (req, res) => {
  const category = await findOwnActive(req);
  await pool.query('UPDATE categories SET deleted_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2', [
    category.id,
    req.user.id,
  ]);
  res.status(204).end();
});

// Regel 5.3.3: beim Löschen des Kontos ruft der Benutzer-Service dies auf -> alle eigenen Kategorien endgültig löschen.
app.delete('/categories', async (req, res) => {
  await pool.query('DELETE FROM categories WHERE user_id = $1', [req.user.id]);
  res.status(204).end();
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
