// Seite "Konto" (Leona, Benutzer-Service): Profil ändern, Passwort ändern, Konto löschen.
import { api, session } from '../api.js';
import { esc, loading, message, onSubmit } from '../ui.js';

export async function renderAccount(el) {
  el.innerHTML = `<h1>Konto</h1>${loading()}`;
  let user;
  try {
    user = await api('/users/me');
  } catch (err) {
    el.innerHTML = '<h1>Konto</h1><div id="msg"></div>';
    return message(el.querySelector('#msg'), err.message);
  }
  el.innerHTML = `
    <h1>Konto</h1>
    <div class="card">
      <h2>Profil</h2>
      <div id="msg-profile"></div>
      <form class="stack" id="profile">
        <label>Anzeigename <input name="displayName" value="${esc(user.displayName)}" maxlength="50" required></label>
        <label>E-Mail <input name="email" type="email" value="${esc(user.email)}" required></label>
        <label>Aktuelles Passwort (nur nötig, wenn du die E-Mail änderst) <input name="currentPassword" type="password" autocomplete="current-password"></label>
        <button class="primary" type="submit">Speichern</button>
      </form>
    </div>
    <div class="card">
      <h2>Passwort ändern</h2>
      <div id="msg-password"></div>
      <form class="stack" id="password">
        <label>Aktuelles Passwort <input name="currentPassword" type="password" autocomplete="current-password" required></label>
        <label>Neues Passwort (mind. 8 Zeichen) <input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <button class="primary" type="submit">Passwort ändern</button>
      </form>
    </div>
    <div class="card">
      <h2>Konto löschen</h2>
      <p class="meta">Löscht dein Konto mit allen TODOs und Kategorien. Das kann nicht rückgängig gemacht werden.</p>
      <div id="msg-delete"></div>
      <button class="danger" id="delete">Konto endgültig löschen</button>
    </div>`;

  onSubmit(el.querySelector('#profile'), el.querySelector('#msg-profile'), async ({ displayName, email, currentPassword }) => {
    const body = { displayName, email };
    if (currentPassword) body.currentPassword = currentPassword;
    await api('/users/me', { method: 'PATCH', body });
    message(el.querySelector('#msg-profile'), 'Profil gespeichert.', 'ok');
  });
  onSubmit(el.querySelector('#password'), el.querySelector('#msg-password'), async (data) => {
    await api('/users/me', { method: 'PATCH', body: data });
    el.querySelector('#password').reset();
    message(el.querySelector('#msg-password'), 'Passwort geändert.', 'ok');
  });
  el.querySelector('#delete').addEventListener('click', async (event) => {
    if (!confirm('Konto wirklich mit allen Daten löschen?')) return;
    event.target.disabled = true;
    try {
      await api('/users/me', { method: 'DELETE' });
      session.token = null;
      location.hash = '#/login';
    } catch (err) {
      message(el.querySelector('#msg-delete'), err.message);
      event.target.disabled = false;
    }
  });
}
