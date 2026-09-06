import { loadCatalog, escapeHtml, formatEUR, formatDateFR } from './store.js';

const section = document.querySelector('#shortlistMarketSection');
if (!section) throw new Error('shortlistMarketSection absent du DOM');

const DATE_MATCH_LABELS = {
  exact: 'Dates exactes',
  nearby: 'Dates proches',
  month: 'Minimum mensuel'
};

const BUDGET_USE_LABELS = {
  exact_budget_candidate: 'Candidat budget',
  signal_only: 'Signal prix uniquement'
};

const PARETO_LABELS = {
  tradeoff: 'Économie ↔ temps',
  dominant: 'Signal dominant',
  dominated: 'Signal dominé',
  incomplete: 'Comparaison incomplète',
  non_strict: 'Signal non strict'
};

const GEOMETRY_LABELS = {
  mismatch_in_current_market_scan: 'Gateway à corriger',
  aligned_with_internal_inbound_transfer: 'Gateway aligné + transfert intérieur',
  aligned_with_ground_transfer: 'Gateway aligné + transfert terrestre'
};

init().catch(error => {
  console.warn('Scan marché shortlist indisponible:', error);
  section.hidden = true;
});

async function init() {
  const [catalog, marketResponse, accessResponse, geometryResponse] = await Promise.all([
    loadCatalog(),
    fetch('./data/shortlist-market-scan.json', { cache: 'no-store' }),
    fetch('./data/airport-access/reims-airports.json', { cache: 'no-store' }),
    fetch('./data/shortlist-gateway-geometry.json', { cache: 'no-store' })
  ]);
  if (!marketResponse.ok) throw new Error(`market HTTP ${marketResponse.status}`);
  if (!accessResponse.ok) throw new Error(`access HTTP ${accessResponse.status}`);
  if (!geometryResponse.ok) throw new Error(`geometry HTTP ${geometryResponse.status}`);

  const market = await marketResponse.json();
  const access = await accessResponse.json();
  const geometry = await geometryResponse.json();
  if (!Number.isInteger(market.travelers) || market.travelers < 1) throw new TypeError('market.travelers invalide');

  const trips = new Map((catalog.trips || []).map(t => [t.id, t]));
  const airports = new Map((access.airports || []).map(a => [a.code, a]));
  const geometryByTrip = new Map((geometry.destinations || []).map(item => [item.tripId, item]));

  renderHeader(market);
  const grid = document.querySelector('#shortlistMarketGrid');
  grid.innerHTML = (market.destinations || [])
    .map(destination => renderDestination(
      destination,
      trips.get(destination.tripId),
      airports,
      market.travelers,
      geometryByTrip.get(destination.tripId),
      market.targetWindow
    ))
    .join('');
  document.querySelector('#shortlistMarketTrace').textContent = `Scan vérifié ${formatDateFR(market.checkedAt)} · géométrie vérifiée ${formatDateFR(geometry.checkedAt)} · ${market.warning || ''}`;
}

function renderHeader(market) {
  const target = market.targetWindow || {};
  const node = document.querySelector('#shortlistMarketIntro');
  if (!node) return;
  node.textContent = `Cible commune : ${formatDateFR(target.departure)} → ${formatDateFR(target.return)} (~${target.approxTripDays || '—'} jours). Seuls des tarifs sur dates exactes peuvent devenir des candidats de budget.`;
}

function renderDestination(destination, trip, airports, travelers, geometry, targetWindow) {
  const title = trip?.title || destination.tripId;
  const observations = destination.observations || [];
  const leader = observations.find(obs => obs.origin === destination.currentLeader) || observations[0];
  const comparisons = observations
    .filter(obs => leader && obs.id !== leader.id)
    .map(obs => buildParetoComparison(leader, obs, airports, travelers));

  return `<article class="market-card">
    <div class="market-card-head">
      <div><p class="eyebrow">Leader provisoire · ${escapeHtml(destination.currentLeader || '—')}</p><h3>${escapeHtml(title)}</h3></div>
      <span class="market-confidence">Confiance ${escapeHtml(destination.leaderConfidence || '—')}</span>
    </div>
    <p class="market-read">${escapeHtml(destination.marketRead || '')}</p>
    ${renderGeometry(geometry)}
    <div class="market-observations">
      ${observations.map(obs => renderObservation(obs, airports.get(obs.origin), obs.id === leader?.id, geometry, targetWindow)).join('')}
    </div>
    ${comparisons.length ? `<div class="market-pareto"><strong>Compromis vs ${escapeHtml(leader?.origin || 'leader')}</strong>${comparisons.map(renderPareto).join('')}</div>` : ''}
    ${(destination.notYetComparable || []).length ? `<p class="market-missing">À rechercher sur dates comparables : ${destination.notYetComparable.map(escapeHtml).join(', ')}.</p>` : ''}
  </article>`;
}

function renderGeometry(geometry) {
  if (!geometry) return '<div class="market-geometry unknown"><strong>Géométrie non documentée</strong></div>';
  const preferred = geometry.preferredGeometry || {};
  const path = preferred.type === 'open_jaw'
    ? `${preferred.inboundGateway || '—'} à l’arrivée · ${preferred.outboundGateway || '—'} au retour`
    : `${preferred.inboundGateway || '—'} A/R`;
  const label = GEOMETRY_LABELS[geometry.alignment] || geometry.alignment || 'Géométrie';
  const extra = geometry.currentMarketScan?.role === 'price_signal_only'
    ? `Le scan actuel via ${geometry.currentMarketScan.gateway || 'un autre hub'} reste un signal de prix seulement.`
    : geometry.internalInbound?.segment
      ? `Segment intérieur initial : ${geometry.internalInbound.segment}.`
      : geometry.finalTransfer?.note || '';
  return `<div class="market-geometry ${escapeHtml(geometry.alignment || 'unknown')}">
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(path)}</strong></div>
    <p>${escapeHtml(preferred.note || '')}${extra ? ` ${escapeHtml(extra)}` : ''}</p>
  </div>`;
}

function renderObservation(obs, airport, isLeader, geometry, targetWindow) {
  const rail = airport?.accessModes?.find(mode => mode.id === 'rail');
  const car = airport?.accessModes?.find(mode => mode.id === 'car');
  const accessBits = [];
  if (finitePositive(rail?.durationMin)) accessBits.push(`rail ~${formatDuration(rail.durationMin)}`);
  if (finitePositive(car?.durationMin)) accessBits.push(`voiture ~${formatDuration(car.durationMin)}`);
  const observedDates = obs.observedDates
    ? `${formatDateFR(obs.observedDates.departure)} → ${formatDateFR(obs.observedDates.return)}`
    : 'paire de dates non exposée';
  const fare = formatFare(obs.price);
  const duration = finitePositive(obs.flightDurationMin) ? ` · vol/référence ${formatDuration(obs.flightDurationMin)}` : '';
  const geometryMismatch = geometry?.currentMarketScan?.role === 'price_signal_only'
    && obs.destination === geometry.currentMarketScan.gateway;
  const dateGap = dateGapLabel(obs, targetWindow);
  return `<div class="market-observation ${isLeader ? 'leader' : ''} ${geometryMismatch ? 'gateway-mismatch' : ''}">
    <div class="market-observation-main">
      <div><strong>${escapeHtml(obs.origin)} → ${escapeHtml(obs.destination)}</strong><span>${escapeHtml(obs.airline || '')} · ${escapeHtml(obs.routing || '')}${duration}</span></div>
      <div class="market-fare"><strong>${fare}</strong><span>/ pers. A/R</span></div>
    </div>
    <div class="market-meta">
      ${isLeader ? '<span class="market-leader-chip">Référence actuelle</span>' : ''}
      ${geometryMismatch ? '<span class="market-gateway-warning">Signal prix · gateway non aligné</span>' : ''}
      <span class="market-date-match ${escapeHtml(obs.dateMatch || 'month')}">${escapeHtml(DATE_MATCH_LABELS[obs.dateMatch] || obs.dateMatch || '—')}</span>
      <span>${escapeHtml(BUDGET_USE_LABELS[obs.budgetUse] || obs.budgetUse || '—')}</span>
      <span>${escapeHtml(observedDates)}</span>
      ${dateGap ? `<span>${escapeHtml(dateGap)}</span>` : ''}
      ${accessBits.length ? `<span>Reims : ${escapeHtml(accessBits.join(' · '))}</span>` : ''}
    </div>
    ${obs.note ? `<p>${escapeHtml(obs.note)}</p>` : ''}
  </div>`;
}

function buildParetoComparison(leader, challenger, airports, travelers) {
  const leaderRail = railMinutes(airports.get(leader.origin));
  const challengerRail = railMinutes(airports.get(challenger.origin));
  const sameCurrency = leader.price?.currency && leader.price.currency === challenger.price?.currency;
  const validFares = finiteNonNegative(leader.price?.value) && finiteNonNegative(challenger.price?.value);
  const fareDeltaParty = sameCurrency && validFares
    ? (leader.price.value - challenger.price.value) * travelers
    : null;
  const extraRailRoundTripMin = finitePositive(leaderRail) && finitePositive(challengerRail)
    ? 2 * (challengerRail - leaderRail)
    : null;
  const stopDelta = Number.isInteger(leader.stops) && Number.isInteger(challenger.stops)
    ? challenger.stops - leader.stops
    : null;
  const strictDates = leader.dateMatch === 'exact' && challenger.dateMatch === 'exact';
  const status = strictDates ? paretoStatus(fareDeltaParty, extraRailRoundTripMin, stopDelta) : 'non_strict';
  return {
    origin: challenger.origin,
    fareDeltaParty,
    extraRailRoundTripMin,
    stopDelta,
    strictDates,
    status
  };
}

function paretoStatus(fareDeltaParty, extraRailRoundTripMin, stopDelta) {
  if (![fareDeltaParty, extraRailRoundTripMin].every(Number.isFinite)) return 'incomplete';
  const noWorseTime = extraRailRoundTripMin <= 0 && (!Number.isFinite(stopDelta) || stopDelta <= 0);
  const noBetterTime = extraRailRoundTripMin >= 0 && (!Number.isFinite(stopDelta) || stopDelta >= 0);
  if (fareDeltaParty > 0 && noWorseTime) return 'dominant';
  if (fareDeltaParty < 0 && noBetterTime) return 'dominated';
  return 'tradeoff';
}

function renderPareto(item) {
  const money = !Number.isFinite(item.fareDeltaParty)
    ? 'écart tarifaire indisponible'
    : item.strictDates
      ? item.fareDeltaParty > 0
        ? `${formatEUR(item.fareDeltaParty)} économisés pour 2`
        : item.fareDeltaParty < 0
          ? `${formatEUR(Math.abs(item.fareDeltaParty))} plus cher pour 2`
          : 'même tarif brut'
      : item.fareDeltaParty > 0
        ? `écart brut observé : ${formatEUR(item.fareDeltaParty)} en faveur de ${escapeHtml(item.origin)}`
        : item.fareDeltaParty < 0
          ? `écart brut observé : ${formatEUR(Math.abs(item.fareDeltaParty))} en défaveur de ${escapeHtml(item.origin)}`
          : 'même tarif brut observé';
  const rail = !Number.isFinite(item.extraRailRoundTripMin)
    ? 'temps rail incomplet'
    : item.extraRailRoundTripMin > 0
      ? `+${formatDuration(item.extraRailRoundTripMin)} de rail A/R`
      : item.extraRailRoundTripMin < 0
        ? `${formatDuration(Math.abs(item.extraRailRoundTripMin))} de rail A/R en moins`
        : 'même temps rail';
  const stops = !Number.isFinite(item.stopDelta) || item.stopDelta === 0
    ? 'même nombre d’escales'
    : item.stopDelta > 0
      ? `+${item.stopDelta} escale${item.stopDelta > 1 ? 's' : ''}`
      : `${Math.abs(item.stopDelta)} escale${Math.abs(item.stopDelta) > 1 ? 's' : ''} en moins`;
  return `<div class="market-pareto-row ${escapeHtml(item.status)}">
    <div><span class="market-pareto-status">${escapeHtml(PARETO_LABELS[item.status] || item.status)}</span><strong>${escapeHtml(item.origin)}</strong></div>
    <ul><li>${money}</li><li>${escapeHtml(rail)}</li><li>${escapeHtml(stops)}</li></ul>
    <small>${item.strictDates ? 'Comparaison sur dates strictement identiques.' : 'Pas de dominance calculée : les dates tarifaires ne sont pas strictement identiques.'}</small>
  </div>`;
}

function railMinutes(airport) {
  const value = airport?.accessModes?.find(mode => mode.id === 'rail')?.durationMin;
  return finitePositive(value) ? value : NaN;
}

function dateGapLabel(obs, targetWindow) {
  if (obs.dateMatch === 'exact') return 'écart cible : 0 j';
  if (obs.dateMatch === 'month' || !obs.observedDates) return 'écart cible : non calculable';
  const departureDelta = signedDays(targetWindow?.departure, obs.observedDates.departure);
  const returnDelta = signedDays(targetWindow?.return, obs.observedDates.return);
  if (!Number.isFinite(departureDelta) || !Number.isFinite(returnDelta)) return '';
  return `écart cible : départ ${formatSignedDays(departureDelta)} · retour ${formatSignedDays(returnDelta)}`;
}

function signedDays(target, observed) {
  const targetMs = Date.parse(`${target}T00:00:00Z`);
  const observedMs = Date.parse(`${observed}T00:00:00Z`);
  if (!Number.isFinite(targetMs) || !Number.isFinite(observedMs)) return NaN;
  return Math.round((observedMs - targetMs) / 86400000);
}

function formatSignedDays(value) {
  if (value === 0) return '0 j';
  return `${value > 0 ? '+' : ''}${value} j`;
}

function formatFare(price) {
  if (!finiteNonNegative(price?.value)) return 'Indisponible';
  return price.currency === 'EUR'
    ? formatEUR(price.value)
    : `${price.value.toLocaleString('fr-FR')} ${escapeHtml(price.currency || '')}`;
}

function finitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function formatDuration(minutes) {
  if (!finiteNonNegative(minutes)) return 'Indisponible';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
}
