import { loadCatalog, escapeHtml, formatEUR, formatDateFR } from './store.js';

const section = document.querySelector('#doorToDoorSection');
if (!section) throw new Error('doorToDoorSection absent du DOM');

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
  node.textContent = `Cible ${formatDateFR(data.targetWindow?.departure)} → ${formatDateFR(data.targetWindow?.return)}. Un total n'est affiché comme complet que si tous les segments obligatoires sont renseignés.`;
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
      <div><span>Coûts connus</span><strong>${costs.knownSubtotalEUR > 0 ? formatEUR(costs.knownSubtotalEUR) : '—'}</strong></div>
      <small>${costs.complete ? 'Coût complet selon les postes actuels.' : `${costs.missing.length} poste(s) obligatoire(s) encore incomplet(s).`}</small>
    </div>
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
  let knownSubtotalEUR = 0;
  const missing = [];
  for (const cost of costs.filter(item => item.required !== false)) {
    if (numeric(cost.partyValueEUR)) knownSubtotalEUR += Number(cost.partyValueEUR);
    else if (numeric(cost.valueEUR)) knownSubtotalEUR += Number(cost.valueEUR);
    else missing.push(cost.label || cost.id);
  }
  return { knownSubtotalEUR, complete: missing.length === 0, missing };
}

function durationRange(duration) {
  if (!duration) return null;
  if (numeric(duration.value)) return { low: Number(duration.value), high: Number(duration.value) };
  if (numeric(duration.low) && numeric(duration.high)) return { low: Number(duration.low), high: Number(duration.high) };
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
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function formatDurationRange(low, high) {
  return Math.abs(high - low) < 0.5 ? formatDuration(low) : `${formatDuration(low)}–${formatDuration(high)}`;
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
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
