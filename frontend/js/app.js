// Frontend-Gerüst: Hash-Router (#/todos, #/categories, ...), Navigation, Schutz der Seiten (nur angemeldet).
// Jede Seite liegt in js/pages/ und gehört der Person, die den passenden Service gebaut hat.
import { api, session } from './api.js';
import { renderLogin, renderRegister } from './pages/auth.js';
import { renderAccount } from './pages/account.js';
import { renderTodos } from './pages/todos.js';
import { renderCategories } from './pages/categories.js';
import { renderStats } from './pages/stats.js';

const routes = {
  '#/login': { render: renderLogin, public: true },
  '#/register': { render: renderRegister, public: true },
  '#/todos': { render: renderTodos },
  '#/categories': { render: renderCategories },
  '#/stats': { render: renderStats },
  '#/account': { render: renderAccount },
};

const app = document.getElementById('app');
const nav = document.getElementById('nav');

function route() {
  let hash = location.hash || '#/todos';
  if (!routes[hash]) hash = '#/todos';
  const target = routes[hash];
  if (!target.public && !session.token) {
    location.hash = '#/login';
    return;
  }
  if (target.public && session.token) {
    location.hash = '#/todos';
    return;
  }
  nav.hidden = !session.token;
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === hash));
  target.render(app);
}

document.getElementById('logout').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {}); // Abmelden klappt auch, wenn der Service nicht antwortet
  session.token = null;
  location.hash = '#/login';
});

window.addEventListener('hashchange', route);
route();
