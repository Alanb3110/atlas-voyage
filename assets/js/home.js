import { loadCatalog, statusLabel, buildTripUrl, formatDateFR, escapeHtml } from './store.js';

const grid = document.querySelector('#tripGrid');
const empty = document.querySelector('#emptyState');
const search = document.querySelector('#searchInput');
const status = document.querySelector('#statusFilter');
let catalog;

const ACTIVE_STATUSES = new Set(['longlist', 'shortlist', 'selected', 'detailed', 'bookable', 'booked']);
const DETAILED_STATUSES = new Set(['detailed', 'bookable', 'booked']);

function homeStatusLabel(tripStatus) {
  if (tripStatus === 'shortlist') return 'Présélectionnée';
  if (tripStatus === 'detailed') return 'Voyage détaillé';
  if (tripStatus === 'archived') return 'Archivé';
  return statusLabel(tripStatus);
}

function compareUrl(trip) {
  const url = buildTripUrl(trip.id, trip.defaultVariant, trip.defaultBudget);
  return `${url}&tab=choice`;
}

function card(trip) {
  const article = document.createElement('article');
  article.className = 'trip-card';
  article.dataset.tripId = trip.id;
  const url = buildTripUrl(trip.id, trip.defaultVariant, trip.defaultBudget);
  const canCompareVariants = Number(trip.variantCount || 1) > 1;
  const openLabel = trip.status === 'archived'
    ? 'Ouvrir l’archive'
    : DETAILED_STATUSES.has(trip.status) ? 'Ouvrir le voyage' : 'Ouvrir le dossier';

  article.innerHTML = `
    <div class="trip-card-image" style="background-image:url('${escapeHtml(trip.coverImage || '')}')"></div>
    <div class="trip-card-body">
      <div class="status">${escapeHtml(homeStatusLabel(trip.status))}</div>
      <h3>${escapeHtml(trip.title)}</h3>
      <p class="muted">${escapeHtml(trip.subtitle || '')}</p>
      <div class="trip-meta">
        ${(trip.tags || []).map(tag => `<span class="chip">${escapeHtml(tag)}</span>`).join('')}
        <span class="chip">${trip.variantCount || 1} option${(trip.variantCount || 1) > 1 ? 's' : ''}</span>
      </div>
      <div class="trip-actions">
        <a class="button" data-action="open-trip" href="${url}">${openLabel}</a>
        ${canCompareVariants ? `<a class="button secondary" data-action="compare-variants" href="${compareUrl(trip)}">Comparer les variantes</a>` : ''}
      </div>
    </div>`;
  return article;
}

function matchesStatus(trip, selectedStatus) {
  if (selectedStatus === 'active') return ACTIVE_STATUSES.has(trip.status);
  if (selectedStatus === 'all') return true;
  return trip.status === selectedStatus;
}

function render() {
  const q = search.value.trim().toLowerCase();
  const selectedStatus = status.value;
  grid.replaceChildren();
  const filtered = catalog.trips.filter(trip =>
    (!q || [trip.title, trip.subtitle, ...(trip.tags || [])].join(' ').toLowerCase().includes(q))
    && matchesStatus(trip, selectedStatus)
  );
  filtered.forEach(trip => grid.append(card(trip)));
  empty.hidden = filtered.length !== 0;
}

try {
  catalog = await loadCatalog();
  const activeTrips = catalog.trips.filter(trip => ACTIVE_STATUSES.has(trip.status));
  const preselectedTrips = activeTrips.filter(trip => trip.status === 'shortlist');
  document.querySelector('#tripCount').textContent = activeTrips.length;
  document.querySelector('#catalogUpdated').textContent = [
    `${activeTrips.length} destinations actives`,
    `${preselectedTrips.length} présélectionnée${preselectedTrips.length > 1 ? 's' : ''}`,
    catalog.updatedAt ? `mis à jour le ${formatDateFR(catalog.updatedAt)}` : ''
  ].filter(Boolean).join(' · ');
  render();
  search.addEventListener('input', render);
  status.addEventListener('change', render);
} catch (error) {
  grid.innerHTML = `<div class="error-box"><strong>Impossible de charger le catalogue.</strong><br>${escapeHtml(error.message)}<br><small>Le site doit être servi via HTTP(S), pas ouvert directement en file://.</small></div>`;
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
