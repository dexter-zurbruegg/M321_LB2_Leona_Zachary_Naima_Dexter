// Kleine Helfer für alle Seiten: HTML escapen, Meldungen, Ladezustand, Formulare.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const loading = (text = 'Wird geladen …') => `<p class="loading">${esc(text)}</p>`;

export function message(el, text, kind = 'error') {
  el.innerHTML = text ? `<div class="msg ${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${esc(text)}</div>` : '';
}

// Formular absenden: Button sperren (Ladezustand), Fehler anzeigen, danach wieder freigeben.
export function onSubmit(form, msgEl, handler) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button && (button.disabled = true);
    message(msgEl, '');
    try {
      await handler(Object.fromEntries(new FormData(form)));
    } catch (err) {
      message(msgEl, err.message);
    } finally {
      button && (button.disabled = false);
    }
  });
}

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '');

export const STATUS_LABELS = { open: 'Offen', in_progress: 'In Bearbeitung', done: 'Erledigt' };

export const PRIORITY_LABELS = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };
