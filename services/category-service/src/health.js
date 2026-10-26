// /health/live  = Prozess läuft (Kubernetes livenessProbe)
// /health       = Service UND Datenbank bereit (Docker-Healthcheck, Kubernetes readinessProbe)
const express = require('express');
const { pool } = require('./db');
const { INSTANCE } = require('./http');

module.exports = function health(service) {
  const router = express.Router();
  router.get('/health/live', (req, res) => res.json({ status: 'ok', service, instance: INSTANCE }));
  router.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', service, instance: INSTANCE, db: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', service, instance: INSTANCE, db: 'unreachable' });
    }
  });
  return router;
};
