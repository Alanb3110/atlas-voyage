import { loadCatalog, buildTripUrl, formatEUR, formatDateFR, escapeHtml } from './store.js';

const section = document.querySelector('#destinationCompareSection');
if (!section) throw new Error('destinationCompareSection absent du DOM');

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
  const rows = (data.destinations || []).map(row => ({ ...row, trip: byId.get(row.tripId) })).filter(row => row.trip);
  if (!rows.length) throw new Error('aucune destination comparable');

  renderWeights(data.weights || {});
  renderMethod(data.method || {});
  renderDestinations(rows, data.weights || {});
  document.querySelector('#destinationCompareTrace').textContent = `${data.status === 'demo' ? 'Données de démonstration' : 'Comparaison datée'} · ${formatDateFR(data.checkedAt)}${data.note ? ` · ${data.note}` : ''}`;
}

function clamp5(value) {
  return Math.max(0, Math.min(5, Number(value) || 0));
}

function criterionRange(row, key) {
  const central = clamp5(row.scores?.[key]);
  const override = Number(row.uncertaintyOverrides?.[key]);
  const fallback = Number(row.uncertaintyHalfWidth);
  const half = Number.isFinite(override) ? Math.max(0, override) : (Number.isFinite(fallback) ? Math.max(0, fallback) : 0);
  return {
    low: clamp5(central - half),
    central,
    high: clamp5(central + half)
  };
}

function weightedScoreRange(row, weights) {
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

function renderWeights(weights) {
  document.querySelector('#destinationWeights').innerHTML = CRITERIA
    .filter(([key]) => Number(weights[key]) > 0)
    .map(([key, label]) => `<span class="destination-weight-chip"><strong>${escapeHtml(label)}</strong>${Math.round(Number(weights[key]))}%</span>`)
    .join('');
}

function renderMethod(method) {
  const node = document.querySelector('#destinationCompareMethod');
  if (!node) return;
  node.textContent = method.uncertaintyModel || 'Les plages représentent une incertitude méthodologique et non un intervalle de confiance statistique.';
}

function renderDestinations(rows, weights) {
  const scored = rows.map(row => ({ ...row, range: weightedScoreRange(row, weights), gateState: gateState(row) }));
  const ranked = scored.filter(row => !['hold','fail'].includes(row.gateState)).sort((a, b) => b.range.central - a.range.central);
  const held = scored.filter(row => ['hold','fail'].includes(row.gateState)).sort((a, b) => b.range.central - a.range.central);
  const rankById = new Map(ranked.map((row, index) => [row.tripId, index + 1]));
  const ordered = [...ranked, ...held];

  document.querySelector('#destinationCompareGrid').innerHTML = ordered.map(row => {
    const trip = row.trip;
    const rank = rankById.get(row.tripId);
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
          <div><span>Confort estimé</span><strong>${formatEUR(row.comfortBudgetEUR)}</strong></div>
          <div><span>Porte-à-porte</span><strong>${formatDuration(row.doorToDoorMin)}</strong></div>
          <div><span>Saison</span><strong>${escapeHtml(row.climate || '—')}</strong></div>
        </div>
        <div class="destination-score-list">${bars}</div>
        ${gateDetails}
        <div class="destination-advantages"><strong>Points forts</strong><ul>${(row.advantages || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
        <div class="destination-tradeoff"><strong>Compromis :</strong> ${escapeHtml(row.tradeoff || '—')}</div>
        <a class="button" href="${buildTripUrl(trip.id, trip.defaultVariant, trip.defaultBudget)}">Ouvrir le dossier actuel</a>
      </div>
    </article>`;
  }).join('');
}

function formatDuration(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} h${r ? ` ${String(r).padStart(2, '0')}` : ''}` : `${r} min`;
}
