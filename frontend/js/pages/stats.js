// Seite "Statistik" (Zachary, Statistik-Service): Anzahl offen/erledigt (F07), Ø Erledigungsdauer (F08).
import { api } from '../api.js';
import { esc, loading, message } from '../ui.js';

// 7260 Sekunden -> "2 Std. 1 Min."
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return 'Keine Daten';
  if (seconds < 60) return `${seconds} Sek.`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days && `${days} T.`, hours && `${hours} Std.`, minutes && `${minutes} Min.`].filter(Boolean).join(' ') || '0 Min.';
}

function categoryTable(rows) {
  if (!rows.length) return '<p class="empty">Noch keine TODOs.</p>';
  const name = (r) => (r.name === null ? 'Unbekannte Kategorie' : esc(r.name) + (r.deleted ? ' (gelöscht)' : ''));
  return `<div class="table-wrap"><table>
    <thead><tr><th>Kategorie</th><th>Offen</th><th>In Bearb.</th><th>Erledigt</th><th>Ø Dauer</th></tr></thead>
    <tbody>${rows
      .map((r) => `<tr>
        <td><span class="dot" style="background:${r.color ?? '#bbb'}"></span>${name(r)}</td>
        <td>${r.open}</td><td>${r.inProgress}</td><td>${r.done}</td><td>${formatDuration(r.averageCompletionSeconds)}</td>
      </tr>`)
      .join('')}</tbody></table></div>`;
}

export async function renderStats(el) {
  el.innerHTML = `<h1>Statistik</h1><div id="body">${loading()}</div>`;
  const body = el.querySelector('#body');
  let s;
  try {
    s = await api('/stats');
  } catch (err) {
    body.innerHTML = '';
    return message(body, err.message);
  }
  const tile = (value, label) => `<div class="card stat"><div class="value">${value}</div><div class="label">${label}</div></div>`;
  body.innerHTML = `
    <div class="stats">
      ${tile(s.open, 'Offen')}
      ${tile(s.inProgress, 'In Bearbeitung')}
      ${tile(s.done, 'Erledigt')}
      ${tile(s.total, 'Total')}
    </div>
    <div class="stats">
      <div class="card stat">
        <div class="value" id="avg">${formatDuration(s.averageCompletionSeconds)}</div>
        <div class="label">Ø Zeit von Erstellung bis Erledigung</div>
      </div>
      ${tile(s.completedLast7Days, 'Erledigt in den letzten 7 Tagen')}
    </div>
    <div class="card">
      <h2>Pro Kategorie</h2>
      ${s.categoriesAvailable ? '' : '<div class="msg warn">Kategorienamen sind gerade nicht verfügbar, die Zahlen stimmen trotzdem.</div>'}
      ${categoryTable(s.byCategory)}
    </div>`;
}
