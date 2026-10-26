// Fachregel 5.3.4: completedAt wird beim Erledigen gesetzt und beim erneuten Öffnen zurückgesetzt.
const STATUSES = ['open', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];

function completedAtFor(oldStatus, newStatus, oldCompletedAt, now = new Date()) {
  if (newStatus !== 'done') return null; // offen oder in Bearbeitung -> nicht erledigt
  if (oldStatus === 'done') return oldCompletedAt; // war schon erledigt -> Zeitpunkt behalten
  return now; // jetzt erledigt
}

module.exports = { STATUSES, PRIORITIES, completedAtFor };
