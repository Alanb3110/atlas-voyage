import { loadCatalog, escapeHtml, formatEUR, formatDateFR } from './store.js';

const section = document.querySelector('#doorToDoorSection');
if (!section) throw new Error('doorToDoorSection absent du DOM');

const SIGNAL_STATUSES = new Set(['observed_nearby','observed_month','published_floor_incomplete']);

init().catch(error => {
  console.warn('Porte-à-porte shortlist indisponible:', error);
  section.hidden = true;
});

async function init() {
  const [catalog, response] = await Promise.all([
    loadCatalog(),
    fetch('./data/shortlist-door-to-door.json', { cache: 'no-store' })
  ]);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const trips = new Map((catalog.trips || []).map(trip => [trip.id, trip]));
  renderIntro(data);
  const byTrip = groupBy(data.scenarios || [], scenario => scenario.tripId);
  document.querySelector('#doorToDoorGrid').innerHTML = [...byTrip.entries()]
    .map(([tripId, scenarios]) => renderTripGroup(trips.get(tripId), scenarios))
    .join('');
  document.querySelector('#doorToDoorTrace').textContent = `Couverture vérifiée ${formatDateFR(data.checkedAt)} · marge aéroport commune : hypothèse 180 min · aucun poste inconnu n'est remplacé par zéro.`;
}

function renderIntro(data) {
  const node = document.querySelector('#doorToDoorIntro');
  if (!node) return;
  node.textContent = `Cible ${formatDateFR(data.targetWindow?.departure)} → ${formatDateFR(data.targetWindow?.return)}. Un temps n'est complet que si tous les segments obligatoires sont renseignés ; un tarif sur dates proches ou mensuelles reste un signal chiffré, jamais un total de réservation.`;
}

function renderTripGroup(trip, scenarios) {
  const title = trip?.title || scenarios[0]?.tripId || 'Destination';
  return `<article class="d2d-group">
    <div class="d2d-group-head"><h3>${escapeHtml(title)}</h3><span>${scenarios.length} scénario${scenarios.length > 1 ? 's' : ''}</span></div>
    <div class="d2d-scenarios">${scenarios.map(renderScenario).join('')}</div>
  </article>`;
}

function renderScenario(scenario) {
  const outbound = summarizeDirection(scenario.outbound);
  const inbound = summarizeDirection(scenario.return);
  const costs = summarizeCosts(scenario.costs || []);
  return `<section class="d2d-scenario">
    <div class="d2d-scenario-head">
      <div><strong>${escapeHtml(scenario.label || scenario.id)}</strong><span>${escapeHtml(scenario.geometry || '')}</span></div>
      <span class="d2d-status ${escapeHtml(scenario.status || 'partial')}">${escapeHtml(scenario.status || 'partial')}</span>
    </div>
    <p>${escapeHtml(scenario.note || '')}</p>
    <div class="d2d-direction-grid">
      ${renderDirection('Aller', outbound)}
      ${renderDirection('Retour', inbound)}
    </div>
    <div class="d2d-cost">
      <div><span>Postes budget éligibles</span><strong>${costs.budgetSubtotalEUR > 0 ? formatEUR(costs.budgetSubtotalEUR) : '—'}</strong></div>
      <div><span>Signaux chiffrés non stricts</span><strong>${costs.signalSubtotalEUR > 0 ? formatEUR(costs.signalSubtotalEUR) : '—'}</strong></div>
      <small>${costs.complete ? 'Coût complet sur données compatibles avec les dates cibles.' : `${costs.missing.length} poste(s) obligatoire(s) incomplet(s) · ${costs.signalItems.length} poste(s) chiffré(s) non éligible(s) au budget final.`}</small>
    </div>
    ${costs.signalItems.length ? `<details class="d2d-missing"><summary>Signaux non budgétaires</summary><ul>${costs.signalItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
    ${costs.missing.length ? `<details class="d2d-missing"><summary>Coûts manquants</summary><ul>${costs.missing.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
    ${outbound.missing.length || inbound.missing.length ? `<details class="d2d-missing"><summary>Temps manquants</summary><ul>${[...outbound.missing, ...inbound.missing].map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : ''}
  </section>`;
}

function summarizeDirection(direction) {
  const segments = direction?.segments || [];
  let low = 0;
  let high = 0;
  const missing = [];
  for (const segment of segments.filter(item => item.required !== false)) {
    const duration = durationRange(segment.durationMin);
    if (!duration) {
      missing.push(`${direction?.label || 'Direction'} : ${segment.label || segment.id}`);
      continue;
    }
    low += duration.low;
    high += duration.high;
  }
  return {
    label: direction?.label || '',
    low,
    high,
    complete: missing.length === 0,
    missing
  };
}

function summarizeCosts(costs) {
  let budgetSubtotalEUR = 0;
  let signalSubtotalEUR = 0;
  const missing = [];
  const signalItems = [];
  for (const cost of costs.filter(item => item.required !== false)) {
    const amount = costAmount(cost);
    if (amount == null) {
      missing.push(cost.label || cost.id);
      continue;
    }
    if (isSignalCost(cost)) {
      signalSubtotalEUR += amount;
      signalItems.push(`${cost.label || cost.id} · ${formatEUR(amount)} · ${cost.status}`);
    } else {
      budgetSubtotalEUR += amount;
    }
  }
  return {
    budgetSubtotalEUR,
    signalSubtotalEUR,
    complete: missing.length === 0 && signalItems.length === 0,
    missing,
    signalItems
  };
}

function costAmount(cost) {
  if (numeric(cost.partyValueEUR)) return cost.partyValueEUR;
  if (numeric(cost.valueEUR)) return cost.valueEUR;
  return null;
}

function isSignalCost(cost) {
  return cost.budgetUse === 'signal_only' || SIGNAL_STATUSES.has(cost.status);
}

function durationRange(duration) {
  if (!duration) return null;
  if (numeric(duration.value)) return { low: duration.value, high: duration.value };
  if (numeric(duration.low) && numeric(duration.high)) return { low: duration.low, high: duration.high };
  return null;
}

function renderDirection(label, summary) {
  const duration = summary.complete
    ? formatDurationRange(summary.low, summary.high)
    : summary.low > 0
      ? `≥ ${formatDuration(summary.low)} connu`
      : 'incomplet';
  return `<div class="d2d-direction ${summary.complete ? 'complete' : 'partial'}">
    <span>${escapeHtml(label)}</span><strong>${escapeHtml(duration)}</strong><small>${summary.complete ? 'tous segments temps renseignés' : `${summary.missing.length} segment(s) manquant(s)`}</small>
  </div>`;
}

function numeric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatDurationRange(low, high) {
  if (!numeric(low) || !numeric(high)) return 'Indisponible';
  return Math.abs(high - low) < 0.5 ? formatDuration(low) : `${formatDuration(low)}–${formatDuration(high)}`;
}

function formatDuration(minutes) {
  if (!numeric(minutes) || minutes < 0) return 'Indisponible';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
