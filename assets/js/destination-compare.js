import { loadCatalog, buildTripUrl, formatEUR, formatDateFR, escapeHtml } from './store.js';

const section = document.querySelector('#destinationCompareSection');
if (!section) throw new Error('destinationCompareSection absent du DOM');

const SHORTLIST_KEY = 'atlas-destination-shortlist:v1';
const FILTER_KEY = 'atlas-destination-filters:v1';

const CRITERIA = [
  ['wildlife','Faune'],
  ['season','Saison'],
  ['relaxation','Détente'],
  ['beach','Plage'],
  ['culture','Culture'],
  ['food','Gastronomie'],
  ['safety','Sécurité'],
  ['logistics','Logistique']
];

const FACETS = [
  ['nature','Nature'],
  ['terrestrialWildlife','Faune terrestre'],
  ['marineWildlife','Faune marine'],
  ['beach','Plage'],
  ['culture','Culture'],
  ['weather','Météo robuste']
];

const CONFIDENCE_LABELS = {
  A: 'A · très documenté',
  B: 'B · bien documenté',
  C: 'C · à approfondir',
  D: 'D · données insuffisantes'
};

const GATE_LABELS = {
  pass: 'Pas de blocage',
  watch: 'À surveiller',
  hold: 'Classement suspendu',
  fail: 'Incompatible'
};

const PRICE_STATUS_LABELS = {
  confirmed: 'Confirmé',
  observed: 'Tarif observé',
  estimated: 'Estimation',
  hypothesis: 'Hypothèse',
  to_recheck: 'À revérifier'
};

let rows = [];
let weights = {};
let shortlist = loadShortlist();
let filters = loadFilters();

init().catch(error => {
  console.warn('Comparateur destinations indisponible:', error);
  section.hidden = true;
});

async function init() {
  const [catalog, response] = await Promise.all([
    loadCatalog(),
    fetch('./data/destination-comparison.json', { cache: 'no-store' })
  ]);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const byId = new Map(catalog.trips.map(t => [t.id, t]));
  rows = (data.destinations || []).map(row => ({ ...row, trip: byId.get(row.tripId) })).filter(row => row.trip);
  if (!rows.length) throw new Error('aucune destination comparable');

  const validIds = new Set(rows.map(row => row.tripId));
  const prunedShortlist = new Set([...shortlist].filter(id => validIds.has(id)));
  if (prunedShortlist.size !== shortlist.size) {
    shortlist = prunedShortlist;
    saveShortlist();
  }

  weights = data.weights || {};
  renderWeights(weights);
  renderMethod(data.method || {});
  renderFilterControls();
  renderDestinations();
  document.querySelector('#destinationCompareTrace').textContent = `${data.status === 'demo' ? 'Données de démonstration' : 'Comparaison datée'} · ${formatDateFR(data.checkedAt)}${data.note ? ` · ${data.note}` : ''}`;
}

function loadShortlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHORTLIST_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveShortlist() {
  try { localStorage.setItem(SHORTLIST_KEY, JSON.stringify([...shortlist])); } catch {}
}

function loadFilters() {
  const defaults = { maxBudget: 16000, maxDoorHours: 36, facets: [], shortlistOnly: false };
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return defaults;
    return {
      maxBudget: Math.max(4000, Math.min(16000, Number(parsed.maxBudget) || defaults.maxBudget)),
      maxDoorHours: Math.max(10, Math.min(36, Number(parsed.maxDoorHours) || defaults.maxDoorHours)),
      facets: Array.isArray(parsed.facets) ? parsed.facets.filter(key => FACETS.some(([facet]) => facet === key)) : [],
      shortlistOnly: Boolean(parsed.shortlistOnly)
    };
  } catch {
    return defaults;
  }
}

function saveFilters() {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch {}
}

function clamp5(value) {
  return Math.max(0, Math.min(5, Number(value) || 0));
}

function criterionRange(row, key) {
  const central = clamp5(row.scores?.[key]);
  const override = Number(row.uncertaintyOverrides?.[key]);
  const fallback = Number(row.uncertaintyHalfWidth);
  const half = Number.isFinite(override) ? Math.max(0, override) : (Number.isFinite(fallback) ? Math.max(0, fallback) : 0);
  return { low: clamp5(central - half), central, high: clamp5(central + half) };
}

function weightedScoreRange(row) {
  let low = 0;
  let central = 0;
  let high = 0;
  let totalWeight = 0;
  for (const [key] of CRITERIA) {
    const w = Number(weights[key]) || 0;
    const range = criterionRange(row, key);
    low += (range.low / 5) * w;
    central += (range.central / 5) * w;
    high += (range.high / 5) * w;
    totalWeight += w;
  }
  if (!totalWeight) return { low: 0, central: 0, high: 0 };
  const factor = 100 / totalWeight;
  return { low: low * factor, central: central * factor, high: high * factor };
}

function gateState(row) {
  const gates = row.gates || [];
  if (gates.some(g => g.state === 'fail')) return 'fail';
  if (gates.some(g => g.blocking && g.state !== 'pass')) return 'hold';
  if (gates.some(g => g.state === 'watch')) return 'watch';
  return 'pass';
}

function budgetValue(row) {
  return Math.max(0, Number(row.comfortBudget?.value) || 0);
}

function doorMinutes(row) {
  return Math.max(0, Number(row.doorToDoor?.value) || 0);
}

function priceMeta(price) {
  if (!price) return '—';
  const status = PRICE_STATUS_LABELS[price.status] || price.status || '—';
  const confidence = price.confidence ? ` · confiance ${price.confidence}` : '';
  return `${status}${confidence}`;
}

function rowMatchesFilters(row) {
  if (budgetValue(row) > filters.maxBudget) return false;
  if (doorMinutes(row) / 60 > filters.maxDoorHours) return false;
  if (filters.shortlistOnly && !shortlist.has(row.tripId)) return false;
  return filters.facets.every(key => row.facets?.[key] === 'high');
}

function renderWeights(currentWeights) {
  document.querySelector('#destinationWeights').innerHTML = CRITERIA
    .filter(([key]) => Number(currentWeights[key]) > 0)
    .map(([key, label]) => `<span class="destination-weight-chip"><strong>${escapeHtml(label)}</strong>${Math.round(Number(currentWeights[key]))}%</span>`)
    .join('');
}

function renderMethod(method) {
  const node = document.querySelector('#destinationCompareMethod');
  if (!node) return;
  node.textContent = method.uncertaintyModel || 'Les plages représentent une incertitude méthodologique et non un intervalle de confiance statistique.';
}

function renderFilterControls() {
  const node = document.querySelector('#destinationFilterControls');
  if (!node) return;
  node.innerHTML = `
    <div class="destination-filter-range">
      <label for="destinationBudgetFilter"><span>Budget Confort max</span><strong id="destinationBudgetValue">${formatEUR(filters.maxBudget)}</strong></label>
      <input id="destinationBudgetFilter" type="range" min="4000" max="16000" step="500" value="${filters.maxBudget}">
    </div>
    <div class="destination-filter-range">
      <label for="destinationTimeFilter"><span>Porte-à-porte max</span><strong id="destinationTimeValue">${Math.round(filters.maxDoorHours)} h</strong></label>
      <input id="destinationTimeFilter" type="range" min="10" max="36" step="1" value="${filters.maxDoorHours}">
    </div>
    <div class="destination-filter-facets" aria-label="Filtres qualitatifs">
      ${FACETS.map(([key, label]) => `<label class="destination-filter-chip"><input type="checkbox" data-destination-facet="${escapeHtml(key)}" ${filters.facets.includes(key) ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('')}
      <label class="destination-filter-chip shortlist"><input id="destinationShortlistOnly" type="checkbox" ${filters.shortlistOnly ? 'checked' : ''}><span>Shortlist uniquement</span></label>
      <button class="button secondary destination-filter-reset" type="button" id="destinationFilterReset">Réinitialiser</button>
    </div>`;

  document.querySelector('#destinationBudgetFilter').addEventListener('input', event => {
    filters.maxBudget = Number(event.target.value);
    document.querySelector('#destinationBudgetValue').textContent = formatEUR(filters.maxBudget);
    saveFilters();
    renderDestinations();
  });
  document.querySelector('#destinationTimeFilter').addEventListener('input', event => {
    filters.maxDoorHours = Number(event.target.value);
    document.querySelector('#destinationTimeValue').textContent = `${Math.round(filters.maxDoorHours)} h`;
    saveFilters();
    renderDestinations();
  });
  document.querySelectorAll('[data-destination-facet]').forEach(input => input.addEventListener('change', () => {
    filters.facets = [...document.querySelectorAll('[data-destination-facet]:checked')].map(node => node.dataset.destinationFacet);
    saveFilters();
    renderDestinations();
  }));
  document.querySelector('#destinationShortlistOnly').addEventListener('change', event => {
    filters.shortlistOnly = event.target.checked;
    saveFilters();
    renderDestinations();
  });
  document.querySelector('#destinationFilterReset').addEventListener('click', () => {
    filters = { maxBudget: 16000, maxDoorHours: 36, facets: [], shortlistOnly: false };
    saveFilters();
    renderFilterControls();
    renderDestinations();
  });
}

function renderDestinations() {
  const scored = rows.map(row => ({ ...row, range: weightedScoreRange(row), gateState: gateState(row) }));
  const filtered = scored.filter(rowMatchesFilters);
  const ranked = filtered.filter(row => !['hold','fail'].includes(row.gateState)).sort((a, b) => b.range.central - a.range.central);
  const held = filtered.filter(row => ['hold','fail'].includes(row.gateState)).sort((a, b) => b.range.central - a.range.central);
  const rankById = new Map(ranked.map((row, index) => [row.tripId, index + 1]));
  const ordered = [...ranked, ...held];

  renderSummary(ranked.slice(0, 3));
  renderCounts(filtered.length);

  const grid = document.querySelector('#destinationCompareGrid');
  if (!ordered.length) {
    grid.innerHTML = '<div class="empty destination-empty">Aucune destination ne correspond aux filtres actuels.</div>';
    return;
  }

  grid.innerHTML = ordered.map(row => renderDestinationCard(row, rankById.get(row.tripId))).join('');
  bindShortlistButtons();
}

function renderCounts(filteredCount) {
  const result = document.querySelector('#destinationFilterCount');
  const shortlistCount = document.querySelector('#destinationShortlistCount');
  if (result) result.textContent = `${filteredCount} / ${rows.length} destinations affichées`;
  if (shortlistCount) shortlistCount.textContent = `${shortlist.size} en shortlist locale`;
}

function renderSummary(topRows) {
  const node = document.querySelector('#destinationTop3');
  if (!node) return;
  if (!topRows.length) {
    node.innerHTML = '<div class="empty">Aucun top 3 avec les filtres actuels.</div>';
    return;
  }
  node.innerHTML = topRows.map((row, index) => `
    <article class="destination-top-card">
      <div class="destination-top-rank">#${index + 1}</div>
      <div class="destination-top-copy">
        <h3>${escapeHtml(row.trip.title)}</h3>
        <p>${escapeHtml(row.advantages?.[0] || row.tradeoff || '')}</p>
        <div class="destination-top-meta">
          <span>${formatEUR(budgetValue(row))}</span>
          <span>${formatDuration(doorMinutes(row))}</span>
          <span>${Math.round(row.range.central)} [${Math.round(row.range.low)}–${Math.round(row.range.high)}]</span>
          <span>Confiance ${escapeHtml(row.evidenceConfidence || '—')}</span>
        </div>
      </div>
      <a class="button secondary" href="${buildTripUrl(row.trip.id, row.trip.defaultVariant, row.trip.defaultBudget)}">Voir</a>
    </article>`).join('');
}

function renderDestinationCard(row, rank) {
  const trip = row.trip;
  const isTopThree = rank != null && rank <= 3;
  const gateClass = escapeHtml(row.gateState);
  const gateLabel = GATE_LABELS[row.gateState] || row.gateState;
  const gates = (row.gates || []).filter(g => g.state !== 'pass');
  const bars = CRITERIA.map(([key, label]) => {
    const range = criterionRange(row, key);
    const left = range.low * 20;
    const width = Math.max(1.5, (range.high - range.low) * 20);
    const central = range.central * 20;
    return `<div class="destination-score-row" title="${escapeHtml(`${label}: ${range.central.toFixed(1)}/5, plage ${range.low.toFixed(1)}–${range.high.toFixed(1)}`)}">
      <span>${escapeHtml(label)}</span>
      <div class="destination-score-track" aria-hidden="true">
        <div class="destination-score-range" style="left:${left}%;width:${width}%"></div>
        <div class="destination-score-marker" style="left:${central}%"></div>
      </div>
      <strong>${range.central.toFixed(1)}</strong>
    </div>`;
  }).join('');
  const rankLabel = rank == null ? gateLabel : `#${rank} indicatif${isTopThree ? ' · top 3 central' : ''}`;
  const gateDetails = gates.length ? `<div class="destination-gates">${gates.map(g => `<div class="destination-gate ${escapeHtml(g.state || 'watch')}"><strong>${escapeHtml(g.label || gateLabel)}</strong><span>${escapeHtml(g.note || '')}</span></div>`).join('')}</div>` : '';
  const shortlisted = shortlist.has(row.tripId);
  return `<article class="destination-compare-card ${isTopThree ? 'recommended' : ''} ${rank == null ? 'on-hold' : ''}">
    <div class="destination-compare-image" style="background-image:url('${escapeHtml(trip.coverImage || '')}')"></div>
    <div class="destination-compare-body">
      <div class="destination-compare-head">
        <div><span class="destination-rank">${escapeHtml(rankLabel)}</span><h3>${escapeHtml(trip.title)}</h3></div>
        <div class="destination-total-score"><strong>${Math.round(row.range.central)}</strong><span>/100</span><small>${Math.round(row.range.low)}–${Math.round(row.range.high)}</small></div>
      </div>
      <div class="destination-confidence-row">
        <span class="destination-confidence">Confiance ${escapeHtml(CONFIDENCE_LABELS[row.evidenceConfidence] || row.evidenceConfidence || '—')}</span>
        <span class="destination-gate-pill ${gateClass}">${escapeHtml(gateLabel)}</span>
      </div>
      <div class="destination-kpis">
        <div><span>Confort</span><strong>${formatEUR(budgetValue(row))}</strong><small>${escapeHtml(priceMeta(row.comfortBudget))}</small></div>
        <div><span>Porte-à-porte</span><strong>${formatDuration(doorMinutes(row))}</strong><small>${escapeHtml(priceMeta(row.doorToDoor))}</small></div>
        <div><span>Saison</span><strong>${escapeHtml(row.climate || '—')}</strong></div>
      </div>
      <div class="destination-score-list">${bars}</div>
      ${gateDetails}
      <div class="destination-advantages"><strong>Points forts</strong><ul>${(row.advantages || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
      <div class="destination-tradeoff"><strong>Compromis :</strong> ${escapeHtml(row.tradeoff || '—')}</div>
      <div class="destination-card-actions">
        <button class="button secondary destination-shortlist-button" type="button" data-shortlist-trip="${escapeHtml(row.tripId)}" aria-pressed="${shortlisted}">${shortlisted ? '★ Retirer de la shortlist' : '☆ Ajouter à la shortlist'}</button>
        <a class="button" href="${buildTripUrl(trip.id, trip.defaultVariant, trip.defaultBudget)}">Ouvrir le dossier actuel</a>
      </div>
    </div>
  </article>`;
}

function bindShortlistButtons() {
  document.querySelectorAll('[data-shortlist-trip]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.shortlistTrip;
    if (shortlist.has(id)) shortlist.delete(id); else shortlist.add(id);
    saveShortlist();
    renderDestinations();
  }));
}

function formatDuration(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} h${r ? ` ${String(r).padStart(2, '0')}` : ''}` : `${r} min`;
}
