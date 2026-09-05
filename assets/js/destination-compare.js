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
  renderDestinations(rows, data.weights || {});
  document.querySelector('#destinationCompareTrace').textContent = `${data.status === 'demo' ? 'Données de démonstration' : 'Comparaison datée'} · ${formatDateFR(data.checkedAt)}${data.note ? ` · ${data.note}` : ''}`;
}

function weightedScore(scores, weights) {
  let weighted = 0;
  let totalWeight = 0;
  for (const [key] of CRITERIA) {
    const w = Number(weights[key]) || 0;
    const score = Math.max(0, Math.min(5, Number(scores?.[key]) || 0));
    weighted += (score / 5) * w;
    totalWeight += w;
  }
  return totalWeight ? weighted / totalWeight * 100 : 0;
}

function renderWeights(weights) {
  document.querySelector('#destinationWeights').innerHTML = CRITERIA
    .filter(([key]) => Number(weights[key]) > 0)
    .map(([key, label]) => `<span class="destination-weight-chip"><strong>${escapeHtml(label)}</strong>${Math.round(Number(weights[key]))}%</span>`)
    .join('');
}

function renderDestinations(rows, weights) {
  const ranked = rows
    .map(row => ({ ...row, score: weightedScore(row.scores, weights) }))
    .sort((a, b) => b.score - a.score);

  document.querySelector('#destinationCompareGrid').innerHTML = ranked.map((row, index) => {
    const trip = row.trip;
    const bars = CRITERIA.map(([key, label]) => {
      const value = Math.max(0, Math.min(5, Number(row.scores?.[key]) || 0));
      return `<div class="destination-score-row"><span>${escapeHtml(label)}</span><div class="destination-score-track"><div class="destination-score-fill" style="width:${value * 20}%"></div></div><strong>${value}/5</strong></div>`;
    }).join('');
    return `<article class="destination-compare-card ${index === 0 ? 'recommended' : ''}">
      <div class="destination-compare-image" style="background-image:url('${escapeHtml(trip.coverImage || '')}')"></div>
      <div class="destination-compare-body">
        <div class="destination-compare-head">
          <div><span class="destination-rank">#${index + 1}${index === 0 ? ' · meilleur score' : ''}</span><h3>${escapeHtml(trip.title)}</h3></div>
          <div class="destination-total-score"><strong>${Math.round(row.score)}</strong><span>/100</span></div>
        </div>
        <div class="destination-kpis">
          <div><span>Confort</span><strong>${formatEUR(row.comfortBudgetEUR)}</strong></div>
          <div><span>Porte-à-porte</span><strong>${formatDuration(row.doorToDoorMin)}</strong></div>
          <div><span>Saison</span><strong>${escapeHtml(row.climate || '—')}</strong></div>
        </div>
        <div class="destination-score-list">${bars}</div>
        <div class="destination-advantages"><strong>Points forts</strong><ul>${(row.advantages || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
        <div class="destination-tradeoff"><strong>Compromis :</strong> ${escapeHtml(row.tradeoff || '—')}</div>
        <a class="button" href="${buildTripUrl(trip.id, trip.defaultVariant, trip.defaultBudget)}">Ouvrir le voyage</a>
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
