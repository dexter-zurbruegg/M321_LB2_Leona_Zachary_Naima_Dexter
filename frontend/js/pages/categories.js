// Seite "Kategorien" (Naima, Kategorien-Service): erstellen, umbenennen, Farbe wählen, löschen (F05).
import { api } from '../api.js';
import { esc, loading, message, onSubmit } from '../ui.js';

export async function renderCategories(el) {
  el.innerHTML = `
    <h1>Kategorien</h1>
    <div class="card">
      <div id="msg"></div>
      <form class="row" id="create">
        <input class="grow" name="name" placeholder="Neue Kategorie, z. B. Schule" maxlength="40" required>
        <input type="color" name="color" value="#2f6fed" aria-label="Farbe">
        <button class="primary" type="submit">Hinzufügen</button>
      </form>
    </div>
    <div class="card" id="list">${loading()}</div>`;
  const msg = el.querySelector('#msg');
  const list = el.querySelector('#list');

  async function load() {
    let categories;
    try {
      categories = await api('/categories');
    } catch (err) {
      list.innerHTML = '';
      return message(list, err.message);
    }
    if (!categories.length) {
      list.innerHTML = '<p class="empty">Noch keine Kategorien.</p>';
      return;
    }
    list.innerHTML = `<ul class="list">${categories
      .map((c) => `
        <li data-id="${c.id}">
          <input type="color" value="${esc(c.color)}" aria-label="Farbe">
          <input class="grow" value="${esc(c.name)}" maxlength="40" aria-label="Name">
          <span class="actions">
            <button data-action="save">Speichern</button>
            <button class="danger" data-action="delete">Löschen</button>
          </span>
        </li>`)
      .join('')}</ul>`;
  }

  onSubmit(el.querySelector('#create'), msg, async ({ name, color }) => {
    await api('/categories', { method: 'POST', body: { name, color } });
    el.querySelector('#create').reset();
    await load();
  });

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const li = button.closest('li');
    message(msg, '');
    button.disabled = true;
    try {
      if (button.dataset.action === 'save') {
        const body = { name: li.querySelector('input.grow').value, color: li.querySelector('input[type=color]').value };
        await api(`/categories/${li.dataset.id}`, { method: 'PATCH', body });
        message(msg, 'Kategorie gespeichert.', 'ok');
      } else {
        if (!confirm('Kategorie löschen? Bestehende TODOs bleiben erhalten.')) return;
        await api(`/categories/${li.dataset.id}`, { method: 'DELETE' });
      }
      await load();
    } catch (err) {
      message(msg, err.message);
    } finally {
      button.disabled = false;
    }
  });

  await load();
}
