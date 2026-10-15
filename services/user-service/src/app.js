// Benutzer-Service (Leona): Registrierung, Login (JWT), Profil ändern, Konto löschen.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { requireAuth, SECRET } = require('./auth');
const { callService } = require('./client');
const { HttpError, requestContext, notFound, errorHandler } = require('./http');
const health = require('./health');

const TOKEN_TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS || 3600);
const TODO_URL = process.env.TODO_SERVICE_URL || 'http://todo-service:3000';
const CATEGORY_URL = process.env.CATEGORY_SERVICE_URL || 'http://category-service:3000';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toJson(row) {
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at, updatedAt: row.updated_at };
}

function validateEmail(email) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 200) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Bitte eine gültige E-Mail-Adresse eingeben');
  }
  return email.trim().toLowerCase();
}
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 100) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Das Passwort muss mindestens 8 Zeichen lang sein');
  }
  return password;
}
function validateName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 50) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Der Anzeigename muss 1 bis 50 Zeichen lang sein');
  }
  return name.trim();
}

async function findMe(req) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'USER_NOT_FOUND', 'Dieses Konto existiert nicht mehr');
  return rows[0];
}

const app = express();
app.use(express.json());
app.use(requestContext('user-service'));
app.use(health('user-service'));

// F01: Registrieren
app.post('/users', async (req, res) => {
  const email = validateEmail(req.body?.email);
  const password = validatePassword(req.body?.password);
  const displayName = validateName(req.body?.displayName);
  const hash = await bcrypt.hash(password, 10); // N03: nur der bcrypt-Hash wird gespeichert
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING *',
      [email, hash, displayName],
    );
    res.status(201).json(toJson(rows[0]));
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'EMAIL_TAKEN', 'Diese E-Mail-Adresse ist bereits registriert');
    throw err;
  }
});

// F02: Anmelden -> JWT
app.post('/auth/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  // Gleiche Meldung für "E-Mail unbekannt" und "Passwort falsch": verrät nicht, welche Konten existieren.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-Mail oder Passwort ist falsch');
  }
  const token = jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL_SECONDS,
    issuer: 'user-service',
  });
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  res.json({ token, expiresAt, user: toJson(user) });
});

// F02: Abmelden. Das JWT ist zustandslos: das Frontend löscht es. Der Endpunkt existiert für einen klaren Ablauf.
app.post('/auth/logout', requireAuth, (req, res) => res.status(204).end());

app.get('/users/me', requireAuth, async (req, res) => {
  res.json(toJson(await findMe(req)));
});

// F01: Bearbeiten. E-Mail- oder Passwort-Änderung braucht das aktuelle Passwort.
app.patch('/users/me', requireAuth, async (req, res) => {
  const user = await findMe(req);
  const body = req.body || {};
  const displayName = body.displayName !== undefined ? validateName(body.displayName) : user.display_name;
  const email = body.email !== undefined ? validateEmail(body.email) : user.email;
  let hash = user.password_hash;
  if (body.password !== undefined || email !== user.email) {
    if (!(await bcrypt.compare(String(body.currentPassword || ''), user.password_hash))) {
      throw new HttpError(403, 'WRONG_PASSWORD', 'Das aktuelle Passwort ist falsch');
    }
    if (body.password !== undefined) hash = await bcrypt.hash(validatePassword(body.password), 10);
  }
  try {
    const { rows } = await pool.query(
      'UPDATE users SET display_name = $1, email = $2, password_hash = $3, updated_at = now() WHERE id = $4 RETURNING *',
      [displayName, email, hash, user.id],
    );
    res.json(toJson(rows[0]));
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'EMAIL_TAKEN', 'Diese E-Mail-Adresse ist bereits registriert');
    throw err;
  }
});

// F01 + Regel 5.3.3: Konto löschen. Zuerst TODOs und Kategorien beim jeweiligen Service löschen,
// erst danach das Konto. Ist ein Service nicht erreichbar, bleibt das Konto bestehen (503) -> nichts halb gelöscht.
app.delete('/users/me', requireAuth, async (req, res) => {
  await findMe(req);
  const opts = { method: 'DELETE', token: req.token, requestId: req.id };
  await callService('Der TODO-Service', `${TODO_URL}/todos`, opts);
  await callService('Der Kategorien-Service', `${CATEGORY_URL}/categories`, opts);
  await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
  res.status(204).end();
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
