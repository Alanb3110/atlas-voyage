import { loadCatalog, escapeHtml, formatEUR, formatDateFR } from './store.js';

const section = document.querySelector('#shortlistMarketSection');
if (!section) throw new Error('shortlistMarketSection absent du DOM');

const DATE_MATCH_LABELS = {
  exact: 'Dates exactes',
  nearby: 'Dates proches',
  month: 'Minimum mensuel'
};

init().catch(error => {
  console.warn('Scan marché shortlist indisponible:', error);
  section.hidden = true;
});

async function init() {
  const [catalog, marketResponse, accessResponse] = await Promise.all([
    loadCatalog(),
    fetch('./data/shortlist-market-scan.json', { cache: 'no-store' }),
    fetch('./data/airport-access/reims-airports.json', { cache: 'no-store' })
  ]);
  if (!marketResponse.ok) throw new Error(`market HTTP ${marketResponse.status}`);
  if (!accessResponse.ok) throw new Error(`access HTTP ${accessResponse.status}`);

  const market = await marketResponse.json();
  const access = await accessResponse.json();
  const trips = new Map((catalog.trips || []).map(t => [t.id, t]));
  const airports = new Map((access.airports || []).map(a => [a.code, a]));

  renderHeader(market);
  const grid = document.querySelector('#shortlistMarketGrid');
  grid.innerHTML = (market.destinations || []).map(destination => renderDestination(destination, trips.get(destination.tripId), airports)).join('');
  document.querySelector('#shortlistMarketTrace').textContent = `Scan vérifié ${formatDateFR(market.checkedAt)} · ${market.warning || ''}`;
}

function renderHeader(market) {
  const target = market.targetWindow || {};
  const node = document.querySelector('#shortlistMarketIntro');
  if (!node) return;
  node.textContent = `Cible commune : ${formatDateFR(target.departure)} → ${formatDateFR(target.return)} (~${target.approxTripDays || '—'} jours). Les tarifs sur dates proches restent des signaux de marché, pas des devis.`;
}

function renderDestination(destination, trip, airports) {
  const title = trip?.title || destination.tripId;
  const observations = destination.observations || [];
  return `<article class="market-card">
    <div class="market-card-head">
      <div><p class="eyebrow">Leader provisoire · ${escapeHtml(destination.currentLeader || '—')}</p><h3>${escapeHtml(title)}</h3></div>
      <span class="market-confidence">Confiance ${escapeHtml(destination.leaderConfidence || '—')}</span>
    </div>
    <p class="market-read">${escapeHtml(destination.marketRead || '')}</p>
    <div class="market-observations">
      ${observations.map(obs => renderObservation(obs, airports.get(obs.origin))).join('')}
    </div>
    ${(destination.notYetComparable || []).length ? `<p class="market-missing">À rechercher sur dates comparables : ${destination.notYetComparable.map(escapeHtml).join(', ')}.</p>` : ''}
  </article>`;
}

function renderObservation(obs, airport) {
  const rail = airport?.accessModes?.find(mode => mode.id === 'rail');
  const car = airport?.accessModes?.find(mode => mode.id === 'car');
  const accessBits = [];
  if (rail?.durationMin) accessBits.push(`rail ~${formatDuration(rail.durationMin)}`);
  if (car?.durationMin) accessBits.push(`voiture ~${formatDuration(car.durationMin)}`);
  const observedDates = obs.observedDates
    ? `${formatDateFR(obs.observedDates.departure)} → ${formatDateFR(obs.observedDates.return)}`
    : 'dates exactes non exposées';
  const fare = obs.price?.currency === 'EUR'
    ? formatEUR(obs.price.value)
    : `${Number(obs.price?.value || 0).toLocaleString('fr-FR')} ${escapeHtml(obs.price?.currency || '')}`;
  const duration = obs.flightDurationMin ? ` · vol/référence ${formatDuration(obs.flightDurationMin)}` : '';
  return `<div class="market-observation ${escapeHtml(obs.origin === (obs.currentLeader || '') ? 'leader' : '')}">
    <div class="market-observation-main">
      <div><strong>${escapeHtml(obs.origin)} → ${escapeHtml(obs.destination)}</strong><span>${escapeHtml(obs.airline || '')} · ${escapeHtml(obs.routing || '')}${duration}</span></div>
      <div class="market-fare"><strong>${fare}</strong><span>/ pers. A/R</span></div>
    </div>
    <div class="market-meta">
      <span class="market-date-match ${escapeHtml(obs.dateMatch || 'month')}">${escapeHtml(DATE_MATCH_LABELS[obs.dateMatch] || obs.dateMatch || '—')}</span>
      <span>${escapeHtml(observedDates)}</span>
      ${accessBits.length ? `<span>Reims : ${escapeHtml(accessBits.join(' · '))}</span>` : ''}
    </div>
    ${obs.note ? `<p>${escapeHtml(obs.note)}</p>` : ''}
  </div>`;
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
}
