// Seiten "Anmelden" und "Registrieren" (Leona, Benutzer-Service).
import { api, session } from '../api.js';
import { onSubmit } from '../ui.js';

export function renderLogin(el) {
  el.innerHTML = `
    <div class="card">
      <h1>Anmelden</h1>
      <div id="msg"></div>
      <form class="stack" id="form">
        <label>E-Mail <input name="email" type="email" autocomplete="username" required></label>
        <label>Passwort <input name="password" type="password" autocomplete="current-password" required></label>
        <button class="primary" type="submit">Anmelden</button>
      </form>
      <p>Noch kein Konto? <a href="#/register">Registrieren</a></p>
    </div>`;
  onSubmit(el.querySelector('#form'), el.querySelector('#msg'), async ({ email, password }) => {
    const { token } = await api('/auth/login', { method: 'POST', body: { email, password } });
    session.token = token;
    location.hash = '#/todos';
  });
}

export function renderRegister(el) {
  el.innerHTML = `
    <div class="card">
      <h1>Registrieren</h1>
      <div id="msg"></div>
      <form class="stack" id="form">
        <label>Anzeigename <input name="displayName" maxlength="50" required></label>
        <label>E-Mail <input name="email" type="email" autocomplete="username" required></label>
        <label>Passwort (mind. 8 Zeichen) <input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <button class="primary" type="submit">Konto erstellen</button>
      </form>
      <p>Schon registriert? <a href="#/login">Anmelden</a></p>
    </div>`;
  onSubmit(el.querySelector('#form'), el.querySelector('#msg'), async (data) => {
    await api('/users', { method: 'POST', body: data });
    // direkt anmelden, damit der Ablauf flüssig bleibt
    const { token } = await api('/auth/login', { method: 'POST', body: { email: data.email, password: data.password } });
    session.token = token;
    location.hash = '#/todos';
  });
}
