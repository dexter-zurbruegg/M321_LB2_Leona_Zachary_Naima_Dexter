// F07 + F08: reine Berechnung, ohne Datenbank und ohne Netzwerk -> einfach zu testen.
const DAY_MS = 24 * 60 * 60 * 1000;

function countByStatus(todos) {
  const count = (status) => todos.filter((t) => t.status === status).length;
  return { open: count('open'), inProgress: count('in_progress'), done: count('done'), total: todos.length };
}

// Durchschnitt in Sekunden; null = "Keine Daten" (keine erledigten TODOs).
function averageCompletionSeconds(todos) {
  // Regel 5.3.4: nur aktuell erledigte TODOs mit completedAt zählen.
  const durations = todos
    .filter((t) => t.status === 'done' && t.completedAt)
    .map((t) => (new Date(t.completedAt) - new Date(t.createdAt)) / 1000)
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  if (!durations.length) return null;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}

// Zusatz: Auswertung pro Kategorie. categories = Liste vom Kategorien-Service oder null, wenn nicht erreichbar.
// Dann gibt es die Zahlen trotzdem, nur ohne Namen.
function byCategory(todos, categories) {
  const groups = new Map();
  for (const t of todos) {
    const key = t.categoryId ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups.entries()]
    .map(([categoryId, list]) => {
      const category = categories?.find((c) => c.id === categoryId);
      return {
        categoryId,
        name: categoryId === null ? 'Ohne Kategorie' : (category?.name ?? null),
        color: category?.color ?? null,
        deleted: Boolean(category?.deletedAt),
        ...countByStatus(list),
        averageCompletionSeconds: averageCompletionSeconds(list),
      };
    })
    .sort((a, b) => b.total - a.total);
}

function computeStats(todos, categories = null, now = new Date()) {
  return {
    ...countByStatus(todos),
    averageCompletionSeconds: averageCompletionSeconds(todos),
    completedLast7Days: todos.filter((t) => t.status === 'done' && t.completedAt && now - new Date(t.completedAt) >= 0 && now - new Date(t.completedAt) <= 7 * DAY_MS)
      .length,
    categoriesAvailable: categories !== null,
    byCategory: byCategory(todos, categories),
  };
}

module.exports = { computeStats, countByStatus, averageCompletionSeconds, byCategory };
