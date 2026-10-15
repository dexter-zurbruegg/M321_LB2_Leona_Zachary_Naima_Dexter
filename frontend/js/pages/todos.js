// Seite "TODOs" (Dexter, TODO-Service): erstellen, anzeigen, bearbeiten, löschen (F03), Status (F04),
// Kategorie zuordnen (F06), Zusatzfeatures: Filter, Suche im Titel, Prioritäten.
// Regel 5.3.5: Sind die Kategorien nicht ladbar, werden die TODOs trotzdem angezeigt (nur ohne Kategorienamen).
import { api } from '../api.js';
import { esc, fmtDate, loading, message, onSubmit, PRIORITY_LABELS, STATUS_LABELS } from '../ui.js';

const options = (labels, selected) =>
  Object.entries(labels).map(([v, l]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${l}</option>`).join('');
const statusOptions = (selected) => options(STATUS_LABELS, selected);
const priorityOptions = (selected) => options(PRIORITY_LABELS, selected);

export async function renderTodos(el) {
  let categories = []; // alle eigenen, auch gelöschte (für die Anzeige bei bestehenden TODOs)
  let categoriesFailed = false;
  const filter = { q: '', status: '', priority: '', categoryId: '' };

  el.innerHTML = `
    <h1>TODOs</h1>
    <div class="card">
      <div id="msg"></div>
      <form class="row" id="create">
        <input class="grow" name="title" placeholder="Was ist zu tun?" maxlength="200" required>
        <select name="categoryId" id="create-category" aria-label="Kategorie"></select>
        <select name="priority" aria-label="Priorität">${priorityOptions('medium')}</select>
        <button class="primary" type="submit">Hinzufügen</button>
      </form>
    </div>
    <div class="card">
      <div class="row">
        <input class="grow" type="search" id="filter-q" placeholder="Suchen …" aria-label="Suche im Titel">
        <select id="filter-status" aria-label="Filter Status"><option value="">Alle Status</option>${statusOptions('')}</select>
        <select id="filter-priority" aria-label="Filter Priorität"><option value="">Alle Prioritäten</option>${priorityOptions('')}</select>
        <select id="filter-category" aria-label="Filter Kategorie"></select>
      </div>
      <div id="list">${loading()}</div>
    </div>`;
  const msg = el.querySelector('#msg');
  const list = el.querySelector('#list');

  const active = () => categories.filter((c) => !c.deletedAt);
  const categoryOptions = (selected, empty = 'Ohne Kategorie') =>
    `<option value="">${empty}</option>` +
    active().map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');

  function categoryBadge(id) {
    if (!id) return '';
    const c = categories.find((x) => x.id === id);
    if (!c) return categoriesFailed ? '<span class="badge">Kategorie nicht geladen</span>' : '';
    const style = `background:${c.color}22;color:${c.color}`; // Farbe vom Kategorien-Service, hell hinterlegt
    return `<span class="badge ${c.deletedAt ? 'deleted' : ''}" style="${c.deletedAt ? '' : style}" title="${c.deletedAt ? 'gelöscht' : ''}">${esc(c.name)}</span>`;
  }

  async function loadCategories() {
    try {
      categories = await api('/categories?includeDeleted=true');
      categoriesFailed = false;
    } catch {
      categories = [];
      categoriesFailed = true;
      message(msg, 'Kategorien können gerade nicht geladen werden. TODOs funktionieren trotzdem.', 'warn');
    }
    el.querySelector('#create-category').innerHTML = categoryOptions('');
    let searchTimer;
  el.querySelector('#filter-q').addEventListener('input', (e) => {
    clearTimeout(searchTimer); // erst suchen, wenn 300 ms nicht mehr getippt wurde
    searchTimer = setTimeout(() => { filter.q = e.target.value.trim(); loadTodos(); }, 300);
  });
  el.querySelector('#filter-priority').addEventListener('change', (e) => { filter.priority = e.target.value; loadTodos(); });
  el.querySelector('#filter-category').innerHTML = categoryOptions(filter.categoryId, 'Alle Kategorien');
  }

  async function loadTodos() {
    const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
    let todos;
    try {
      todos = await api(`/todos${query ? `?${query}` : ''}`);
    } catch (err) {
      list.innerHTML = '';
      return message(list, err.message);
    }
    if (!todos.length) {
      list.innerHTML = '<p class="empty">Keine TODOs gefunden.</p>';
      return;
    }
    list.innerHTML = `<ul class="list">${todos.map(todoItem).join('')}</ul>`;
  }

  function todoItem(t) {
    return `
      <li data-id="${t.id}" class="${t.status === 'done' ? 'todo-done' : ''}">
        <div class="todo-main">
          <div class="todo-title">${esc(t.title)}</div>
          ${t.description ? `<div>${esc(t.description)}</div>` : ''}
          <div class="meta"><span class="badge prio-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>${categoryBadge(t.categoryId)} erstellt ${fmtDate(t.createdAt)}${t.completedAt ? ` · erledigt ${fmtDate(t.completedAt)}` : ''}</div>
        </div>
        <span class="actions">
          <select data-action="status" aria-label="Status">${statusOptions(t.status)}</select>
          <button data-action="edit">Bearbeiten</button>
          <button class="danger" data-action="delete">Löschen</button>
        </span>
      </li>`;
  }

  async function editForm(li) {
    const t = await api(`/todos/${li.dataset.id}`);
    const deletedCategory = categories.find((c) => c.id === t.categoryId && c.deletedAt);
    li.innerHTML = `
      <form class="stack grow" data-form="edit">
        <label>Titel <input name="title" value="${esc(t.title)}" maxlength="200" required></label>
        <label>Beschreibung <textarea name="description" rows="2" maxlength="2000">${esc(t.description)}</textarea></label>
        <label>Priorität <select name="priority">${priorityOptions(t.priority)}</select></label>
        <label>Kategorie <select name="categoryId">${categoryOptions(t.categoryId)}
          ${deletedCategory ? `<option value="${deletedCategory.id}" selected>${esc(deletedCategory.name)} (gelöscht)</option>` : ''}
        </select></label>
        <div class="row"><button class="primary" type="submit">Speichern</button><button type="button" data-action="cancel">Abbrechen</button></div>
      </form>`;
    onSubmit(li.querySelector('form'), msg, async (data) => {
      await api(`/todos/${t.id}`, { method: 'PATCH', body: { ...data, categoryId: data.categoryId || null } });
      await loadTodos();
    });
  }

  onSubmit(el.querySelector('#create'), msg, async ({ title, categoryId, priority }) => {
    await api('/todos', { method: 'POST', body: { title, priority, categoryId: categoryId || null } });
    el.querySelector('#create').reset();
    await loadTodos();
  });

  el.querySelector('#filter-status').addEventListener('change', (e) => { filter.status = e.target.value; loadTodos(); });
  let searchTimer;
  el.querySelector('#filter-q').addEventListener('input', (e) => {
    clearTimeout(searchTimer); // erst suchen, wenn 300 ms nicht mehr getippt wurde
    searchTimer = setTimeout(() => { filter.q = e.target.value.trim(); loadTodos(); }, 300);
  });
  el.querySelector('#filter-priority').addEventListener('change', (e) => { filter.priority = e.target.value; loadTodos(); });
  el.querySelector('#filter-category').addEventListener('change', (e) => { filter.categoryId = e.target.value; loadTodos(); });

  list.addEventListener('change', async (event) => {
    if (event.target.dataset.action !== 'status') return;
    const id = event.target.closest('li').dataset.id;
    message(msg, '');
    try {
      await api(`/todos/${id}`, { method: 'PATCH', body: { status: event.target.value } });
    } catch (err) {
      message(msg, err.message);
    }
    await loadTodos();
  });

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const li = button.closest('li');
    message(msg, '');
    try {
      if (button.dataset.action === 'edit') await editForm(li);
      if (button.dataset.action === 'cancel') await loadTodos();
      if (button.dataset.action === 'delete' && confirm('TODO löschen?')) {
        await api(`/todos/${li.dataset.id}`, { method: 'DELETE' });
        await loadTodos();
      }
    } catch (err) {
      message(msg, err.message);
    }
  });

  await loadCategories();
  await loadTodos();
}
