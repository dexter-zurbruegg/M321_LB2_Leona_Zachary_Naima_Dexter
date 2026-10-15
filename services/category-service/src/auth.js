// Prüft das JWT aus dem Header "Authorization: Bearer <token>".
// Die userId kommt IMMER aus dem geprüften Token (Claim "sub"), nie aus dem Request-Body (N02).
const jwt = require('jsonwebtoken');
const { HttpError } = require('./http');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET fehlt (siehe .env.example)');

function requireAuth(req, res, next) {
  const match = (req.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!match) return next(new HttpError(401, 'UNAUTHORIZED', 'Bitte zuerst anmelden'));
  try {
    const payload = jwt.verify(match[1], SECRET, { algorithms: ['HS256'], issuer: 'user-service' });
    req.user = { id: payload.sub, email: payload.email };
    req.token = match[1];
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHORIZED', 'Anmeldung ungültig oder abgelaufen, bitte neu anmelden'));
  }
}

module.exports = { requireAuth, SECRET };
