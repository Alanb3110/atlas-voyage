import { loadCatalog, statusLabel, buildTripUrl, formatDateFR, escapeHtml } from './store.js';

const grid = document.querySelector('#tripGrid');
const empty = document.querySelector('#emptyState');
const search = document.querySelector('#searchInput');
const status = document.querySelector('#statusFilter');
let catalog;

function card(trip) {
  const article = document.createElement('article');
  article.className = 'trip-card';
  const url = buildTripUrl(trip.id, trip.defaultVariant, trip.defaultBudget);
  article.innerHTML = `
    <div class="trip-card-image" style="background-image:url('${escapeHtml(trip.coverImage || '')}')"></div>
    <div class="trip-card-body">
      <div class="status">${escapeHtml(statusLabel(trip.status))}</div>
      <h3>${escapeHtml(trip.title)}</h3>
      <p class="muted">${escapeHtml(trip.subtitle || '')}</p>
      <div class="trip-meta">
        ${(trip.tags || []).map(tag => `<span class="chip">${escapeHtml(tag)}</span>`).join('')}
        <span class="chip">${trip.variantCount || 1} option${(trip.variantCount || 1) > 1 ? 's' : ''}</span>
      </div>
      <div class="trip-actions">
        <a class="button" href="${url}">Ouvrir</a>
        <a class="button secondary" href="${buildTripUrl(trip.id)}">Comparer les options</a>
      </div>
    </div>`;
  return article;
}

function render() {
  const q = search.value.trim().toLowerCase();
  const s = status.value;
  grid.replaceChildren();
  const filtered = catalog.trips.filter(t => (!q || [t.title,t.subtitle,...(t.tags||[])].join(' ').toLowerCase().includes(q)) && (s === 'all' || t.status === s));
  filtered.forEach(t => grid.append(card(t)));
  empty.hidden = filtered.length !== 0;
}

try {
  catalog = await loadCatalog();
  document.querySelector('#tripCount').textContent = catalog.trips.length;
  document.querySelector('#catalogUpdated').textContent = catalog.updatedAt ? `Catalogue mis à jour le ${formatDateFR(catalog.updatedAt)}` : '';
  render();
  search.addEventListener('input', render);
  status.addEventListener('change', render);
} catch (error) {
  grid.innerHTML = `<div class="error-box"><strong>Impossible de charger le catalogue.</strong><br>${escapeHtml(error.message)}<br><small>Le site doit être servi via HTTP(S), pas ouvert directement en file://.</small></div>`;
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
