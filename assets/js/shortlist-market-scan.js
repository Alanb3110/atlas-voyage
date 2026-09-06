import { loadCatalog, escapeHtml, formatEUR, formatDateFR } from './store.js';

const section = document.querySelector('#shortlistMarketSection');
if (!section) throw new Error('shortlistMarketSection absent du DOM');

const DATE_MATCH_LABELS = {
  exact: 'Dates exactes',
  nearby: 'Dates proches',
  month: 'Minimum mensuel'
};

const PARETO_LABELS = {
  tradeoff: 'Économie ↔ temps',
  dominant: 'Signal dominant',
  dominated: 'Signal dominé',
  incomplete: 'Comparaison incomplète'
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
      Number(market.travelers) || 2,
      geometryByTrip.get(destination.tripId)
    ))
    .join('');
  document.querySelector('#shortlistMarketTrace').textContent = `Scan vérifié ${formatDateFR(market.checkedAt)} · géométrie vérifiée ${formatDateFR(geometry.checkedAt)} · ${market.warning || ''}`;
}

function renderHeader(market) {
  const target = market.targetWindow || {};
  const node = document.querySelector('#shortlistMarketIntro');
  if (!node) return;
  node.textContent = `Cible commune : ${formatDateFR(target.departure)} → ${formatDateFR(target.return)} (~${target.approxTripDays || '—'} jours). Les tarifs sur dates proches restent des signaux de marché, pas des devis.`;
}

function renderDestination(destination, trip, airports, travelers, geometry) {
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
      ${observations.map(obs => renderObservation(obs, airports.get(obs.origin), obs.id === leader?.id, geometry)).join('')}
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

function renderObservation(obs, airport, isLeader, geometry) {
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
  const geometryMismatch = geometry?.currentMarketScan?.role === 'price_signal_only'
    && obs.destination === geometry.currentMarketScan.gateway;
  return `<div class="market-observation ${isLeader ? 'leader' : ''} ${geometryMismatch ? 'gateway-mismatch' : ''}">
    <div class="market-observation-main">
      <div><strong>${escapeHtml(obs.origin)} → ${escapeHtml(obs.destination)}</strong><span>${escapeHtml(obs.airline || '')} · ${escapeHtml(obs.routing || '')}${duration}</span></div>
      <div class="market-fare"><strong>${fare}</strong><span>/ pers. A/R</span></div>
    </div>
    <div class="market-meta">
      ${isLeader ? '<span class="market-leader-chip">Référence actuelle</span>' : ''}
      ${geometryMismatch ? '<span class="market-gateway-warning">Signal prix · gateway non aligné</span>' : ''}
      <span class="market-date-match ${escapeHtml(obs.dateMatch || 'month')}">${escapeHtml(DATE_MATCH_LABELS[obs.dateMatch] || obs.dateMatch || '—')}</span>
      <span>${escapeHtml(observedDates)}</span>
      ${accessBits.length ? `<span>Reims : ${escapeHtml(accessBits.join(' · '))}</span>` : ''}
    </div>
    ${obs.note ? `<p>${escapeHtml(obs.note)}</p>` : ''}
  </div>`;
}

function buildParetoComparison(leader, challenger, airports, travelers) {
  const leaderRail = railMinutes(airports.get(leader.origin));
  const challengerRail = railMinutes(airports.get(challenger.origin));
  const sameCurrency = leader.price?.currency && leader.price.currency === challenger.price?.currency;
  const fareDeltaParty = sameCurrency
    ? (Number(leader.price?.value) - Number(challenger.price?.value)) * travelers
    : null;
  const extraRailRoundTripMin = Number.isFinite(leaderRail) && Number.isFinite(challengerRail)
    ? 2 * (challengerRail - leaderRail)
    : null;
  const stopDelta = Number.isFinite(Number(leader.stops)) && Number.isFinite(Number(challenger.stops))
    ? Number(challenger.stops) - Number(leader.stops)
    : null;
  const strictDates = leader.dateMatch === 'exact' && challenger.dateMatch === 'exact';
  const status = paretoStatus(fareDeltaParty, extraRailRoundTripMin, stopDelta);
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
    : item.fareDeltaParty > 0
      ? `${formatEUR(item.fareDeltaParty)} économisés pour 2`
      : item.fareDeltaParty < 0
        ? `${formatEUR(Math.abs(item.fareDeltaParty))} plus cher pour 2`
        : 'même tarif brut';
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
    <ul><li>${escapeHtml(money)}</li><li>${escapeHtml(rail)}</li><li>${escapeHtml(stops)}</li></ul>
    <small>${item.strictDates ? 'Comparaison sur dates strictement identiques.' : 'Signal non strict : les dates tarifaires diffèrent.'}</small>
  </div>`;
}

function railMinutes(airport) {
  const value = Number(airport?.accessModes?.find(mode => mode.id === 'rail')?.durationMin);
  return Number.isFinite(value) ? value : NaN;
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
}
