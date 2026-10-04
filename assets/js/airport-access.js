import { params, escapeHtml, formatEUR, formatDateFR } from './store.js';

const $ = selector => document.querySelector(selector);
const section = $('#airportSection');
if (!section) throw new Error('airportSection absent du DOM');

const tripId = params().get('trip');
const DEFAULT_WEIGHTS = { cost: 30, time: 30, flight: 25, fatigue: 15 };
const RESEARCHED_STATUSES = new Set([
  'confirmed',
  'researched',
  'verified',
  'verified_fare',
  'verified_benchmark'
]);

const ui = {
  comparisonOpen: false,
  showAllAirports: false,
  prioritiesOpen: false
};

if (!tripId) {
  section.hidden = true;
} else {
  init().catch(error => {
    console.warn('Comparateur aéroports indisponible:', error);
    section.hidden = true;
  });
}

async function init() {
  const [accessResponse, groundCostResponse, tripResponse] = await Promise.all([
    fetch('./data/airport-access/reims-airports.json', { cache: 'no-store' }),
    fetch('./data/airport-access/reims-ground-costs.json', { cache: 'no-store' }),
    fetch(`./data/airport-access/${encodeURIComponent(tripId)}.json`, { cache: 'no-store' })
  ]);

  if (!accessResponse.ok) throw new Error(`Accès Reims HTTP ${accessResponse.status}`);
  if (!groundCostResponse.ok) throw new Error(`Coûts terrestres HTTP ${groundCostResponse.status}`);

  const accessData = await accessResponse.json();
  const groundCostData = await groundCostResponse.json();
  let data;

  if (tripResponse.ok) {
    data = await tripResponse.json();
    if (data.tripId !== tripId) throw new Error('tripId incohérent');
  } else if (tripResponse.status === 404) {
    data = {
      schemaVersion: 1,
      tripId,
      status: 'research',
      checkedAt: accessData.checkedAt,
      intro: 'Les accès terrestres depuis Reims sont documentés ; les vols de cette destination n’ont pas encore été recherchés au niveau aéroport.',
      note: 'Aucun classement de départ n’est produit tant que les vols compatibles avec les dates ne sont pas recherchés.',
      defaultWeights: DEFAULT_WEIGHTS,
      options: []
    };
  } else {
    throw new Error(`Vols HTTP ${tripResponse.status}`);
  }

  ensureProgressiveOrder();
  const storedWeights = loadWeights(tripId);
  const weights = normalizeWeights(storedWeights || data.defaultWeights || DEFAULT_WEIGHTS);
  renderShell(data, accessData, groundCostData, weights);
}

function ensureProgressiveOrder() {
  const weightsNode = $('#airportWeights');
  const recommendationNode = $('#airportRecommendation');
  if (weightsNode && recommendationNode && recommendationNode.nextElementSibling !== weightsNode) {
    recommendationNode.insertAdjacentElement('afterend', weightsNode);
  }
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function finiteNumber(value) {
  return hasNumericValue(value) ? Number(value) : null;
}

function normalizeWeights(raw) {
  const values = {};
  for (const key of ['cost', 'time', 'flight', 'fatigue']) {
    const value = finiteNumber(raw?.[key]);
    values[key] = value !== null && value >= 0 ? value : 0;
  }
  const sum = Object.values(values).reduce((total, value) => total + value, 0);
  if (sum <= 0) return { cost: 25, time: 25, flight: 25, fatigue: 25 };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value * 100 / sum]));
}

function loadWeights(id) {
  try {
    return JSON.parse(localStorage.getItem(`atlas-airport-weights:${id}`) || 'null');
  } catch {
    return null;
  }
}

function saveWeights(id, weights) {
  try {
    localStorage.setItem(`atlas-airport-weights:${id}`, JSON.stringify(weights));
  } catch {}
}

function clearWeights(id) {
  try {
    localStorage.removeItem(`atlas-airport-weights:${id}`);
  } catch {}
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function formatDuration(mins) {
  const numeric = finiteNumber(mins);
  if (numeric === null) return 'À revérifier';
  const minutes = Math.max(0, Math.round(numeric));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} h${remainder ? ` ${String(remainder).padStart(2, '0')}` : ''}` : `${remainder} min`;
}

function formatRangeEUR(range) {
  if (!range || !hasNumericValue(range.low) || !hasNumericValue(range.high)) return 'À revérifier';
  const low = Number(range.low);
  const high = Number(range.high);
  return Math.abs(high - low) < 0.01 ? formatEUR(low) : `${formatEUR(low)}–${formatEUR(high)}`;
}

function formatRating(value) {
  const numeric = finiteNumber(value);
  if (numeric === null) return 'À revérifier';
  return `${Math.max(0, Math.min(5, numeric))}/5`;
}

function formatStops(value) {
  const numeric = finiteNumber(value);
  if (numeric === null) return 'escales à revérifier';
  const stops = Math.max(0, Math.round(numeric));
  if (stops === 0) return 'direct';
  return `${stops} escale${stops > 1 ? 's' : ''}`;
}

function isFlightResearched(option) {
  const status = String(option?.flight?.status || option?.status || '').toLowerCase();
  return RESEARCHED_STATUSES.has(status);
}

function optionDateSignature(option, data) {
  const explicitKey = option?.comparisonKey || option?.flight?.comparisonKey || option?.dateKey || option?.flight?.dateKey;
  if (explicitKey) return `key:${String(explicitKey)}`;

  const dateObject = option?.travelDates || option?.flight?.travelDates || option?.dates || option?.flight?.dates;
  if (typeof dateObject === 'string' && dateObject.trim()) return `dates:${dateObject.trim()}`;
  if (dateObject && typeof dateObject === 'object') {
    const departure = dateObject.departure || dateObject.departureDate || dateObject.outbound || dateObject.start;
    const returned = dateObject.return || dateObject.returnDate || dateObject.inbound || dateObject.end;
    if (departure && returned) return `dates:${departure}|${returned}`;
  }

  const departure = option?.departureDate || option?.flight?.departureDate || option?.outboundDate || option?.flight?.outboundDate;
  const returned = option?.returnDate || option?.flight?.returnDate || option?.inboundDate || option?.flight?.inboundDate;
  if (departure && returned) return `dates:${departure}|${returned}`;

  const sharedKey = data?.comparisonDateKey || data?.comparison?.dateKey;
  if (sharedKey) return `shared:${String(sharedKey)}`;
  return null;
}

function hasCompleteDecisionMetrics(option) {
  return totalCost(option) !== null
    && finiteNumber(option?.doorToDoorMin) !== null
    && finiteNumber(option?.flight?.durationMin) !== null
    && finiteNumber(option?.flight?.quality) !== null
    && finiteNumber(option?.fatigue) !== null;
}

function getComparability(data) {
  if (data?.status === 'demo') {
    return { comparable: false, options: [], label: '', reason: 'Jeu de démonstration : aucun classement aérien réel.' };
  }

  const researched = (data?.options || []).filter(option => option?.considered !== false && isFlightResearched(option));
  const complete = researched.filter(hasCompleteDecisionMetrics);
  const explicitComparable = data?.flightsComparable === true
    || data?.comparability?.status === 'comparable'
    || data?.comparison?.comparable === true;

  if (explicitComparable && complete.length >= 2) {
    const label = data?.comparability?.label || data?.comparison?.label || data?.comparisonDateKey || 'Dates cohérentes confirmées dans les données';
    return { comparable: true, options: complete, label: String(label), reason: '' };
  }

  const groups = new Map();
  for (const option of complete) {
    const signature = optionDateSignature(option, data);
    if (!signature) continue;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(option);
  }

  const coherentGroup = [...groups.entries()]
    .filter(([, options]) => options.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)[0];

  if (coherentGroup) {
    return {
      comparable: true,
      options: coherentGroup[1],
      label: coherentGroup[0].replace(/^(key|dates|shared):/, ''),
      reason: ''
    };
  }

  const researchedCount = researched.length;
  const reason = researchedCount
    ? `${researchedCount} vol${researchedCount > 1 ? 's' : ''} documenté${researchedCount > 1 ? 's' : ''}, mais pas de groupe comparable sur une même fenêtre de dates.`
    : 'Aucun vol documenté avec un statut de recherche suffisant.';
  return { comparable: false, options: [], label: '', reason };
}

function totalCost(option) {
  const access = finiteNumber(option?.access?.costEUR);
  const flight = finiteNumber(option?.flight?.priceEUR);
  if (access === null || flight === null) return null;

  let total = access + flight;
  for (const key of ['overnightEUR', 'parkingEUR']) {
    if (!Object.prototype.hasOwnProperty.call(option?.access || {}, key)) continue;
    const value = finiteNumber(option.access[key]);
    if (value === null) return null;
    total += value;
  }
  return total;
}

function scoreOptions(options, weights) {
  const valid = options.filter(option => option?.considered !== false && hasCompleteDecisionMetrics(option));
  if (valid.length < 2) return [];

  const minCost = Math.min(...valid.map(option => totalCost(option)));
  const minTime = Math.min(...valid.map(option => Number(option.doorToDoorMin)));
  const costSpanEUR = 1500;
  const timeSpanMin = 480;

  return valid.map(option => {
    const costRegret = clamp01((totalCost(option) - minCost) / costSpanEUR);
    const timeRegret = clamp01((Number(option.doorToDoorMin) - minTime) / timeSpanMin);
    const flightRegret = clamp01((5 - Number(option.flight.quality)) / 5);
    const fatigueRegret = clamp01((Number(option.fatigue) - 1) / 4);
    const decisionPenalty = (
      costRegret * weights.cost
      + timeRegret * weights.time
      + flightRegret * weights.flight
      + fatigueRegret * weights.fatigue
    );
    return {
      ...option,
      decisionPenalty,
      components: { costRegret, timeRegret, flightRegret, fatigueRegret },
      comparisonBaseline: { minCost, minTime, costSpanEUR, timeSpanMin }
    };
  }).sort((a, b) => a.decisionPenalty - b.decisionPenalty);
}

function renderShell(data, accessData, groundCostData, weights) {
  const comparability = getComparability(data);
  const groundByCode = new Map((groundCostData.airports || []).map(item => [item.code, item]));
  const flightsByCode = new Map((data.options || []).map(option => [option.airport?.code, option]));
  const ranked = comparability.comparable ? scoreOptions(comparability.options, weights) : [];

  if (comparability.comparable && ranked.length >= 2) {
    ui.comparisonOpen = true;
    renderComparableState(data, accessData, groundCostData, groundByCode, flightsByCode, comparability, weights, ranked);
  } else {
    ui.comparisonOpen = false;
    renderCompactResearchState(data, accessData, groundCostData, groundByCode, flightsByCode, comparability);
  }
}

function renderCompactResearchState(data, accessData, groundCostData, groundByCode, flightsByCode, comparability) {
  const intro = $('#airportIntro');
  intro.textContent = '';
  intro.hidden = true;

  const weightsNode = $('#airportWeights');
  weightsNode.innerHTML = '';
  weightsNode.hidden = true;

  const airports = sortAirportsByGroundRelevance(accessData.airports || [], groundByCode);
  const best = airports[0] || null;
  const car = best?.accessModes?.find(mode => mode.id === 'car');
  const rail = best?.accessModes?.find(mode => mode.id === 'rail');
  const totalAirports = (accessData.airports || []).length;

  $('#airportRecommendation').innerHTML = `
    <article class="airport-compact-summary" aria-labelledby="airportCompactTitle">
      <div class="airport-compact-head">
        <div>
          <p class="eyebrow">Départ depuis Reims</p>
          <h3 id="airportCompactTitle">Vols comparables pas encore établis</h3>
        </div>
        <span class="airport-state-badge research">Vols à rechercher</span>
      </div>
      ${best ? `<p class="airport-access-highlight"><strong>${escapeHtml(best.code)}</strong><span aria-hidden="true"> · </span><span>${car ? `${formatDuration(car.durationMin)} voiture` : 'voiture à revérifier'}</span><span aria-hidden="true"> · </span><span>${rail ? `${formatDuration(rail.durationMin)} train` : 'train à revérifier'}</span></p>` : ''}
      <p class="airport-compact-count">${totalAirports} aéroport${totalAirports > 1 ? 's' : ''} documenté${totalAirports > 1 ? 's' : ''}</p>
      <button class="button airport-compare-toggle" type="button" id="airportCompareToggle" aria-expanded="false" aria-controls="airportCompare">Comparer les aéroports</button>
    </article>`;

  const compareNode = $('#airportCompare');
  compareNode.hidden = true;
  compareNode.innerHTML = '';

  const coverageNode = $('#airportCoverage');
  coverageNode.hidden = true;
  coverageNode.innerHTML = '';

  const traceNode = $('#airportTrace');
  traceNode.hidden = true;
  traceNode.textContent = traceText(data, accessData, groundCostData, comparability.reason);

  $('#airportCompareToggle')?.addEventListener('click', event => {
    ui.comparisonOpen = !ui.comparisonOpen;
    const button = event.currentTarget;
    button.setAttribute('aria-expanded', String(ui.comparisonOpen));
    button.textContent = ui.comparisonOpen ? 'Masquer la comparaison' : 'Comparer les aéroports';
    compareNode.hidden = !ui.comparisonOpen;
    coverageNode.hidden = !ui.comparisonOpen;
    traceNode.hidden = !ui.comparisonOpen;
    if (ui.comparisonOpen) {
      renderAirportList(accessData, groundByCode, flightsByCode, null);
      renderCoverageControls(accessData, groundByCode, flightsByCode, null);
    }
  });
}

function renderComparableState(data, accessData, groundCostData, groundByCode, flightsByCode, comparability, weights, ranked) {
  const intro = $('#airportIntro');
  intro.hidden = false;
  intro.textContent = data.intro || 'Comparaison porte-à-porte depuis Reims.';

  renderDecisionSummary(data, comparability, ranked);
  renderPriorityControls(data, accessData, groundCostData, groundByCode, flightsByCode, comparability, weights);

  $('#airportCompare').hidden = false;
  $('#airportCoverage').hidden = false;
  renderAirportList(accessData, groundByCode, flightsByCode, ranked);
  renderCoverageControls(accessData, groundByCode, flightsByCode, ranked);

  const traceNode = $('#airportTrace');
  traceNode.hidden = false;
  traceNode.textContent = traceText(data, accessData, groundCostData, `Vols comparables : ${comparability.label}.`);
}

function renderDecisionSummary(data, comparability, ranked) {
  const best = ranked[0];
  const recommendation = best.recommendation || best.advantages?.[0] || 'Meilleur compromis selon les priorités actuelles.';
  $('#airportRecommendation').innerHTML = `
    <article class="airport-decision-summary" aria-labelledby="airportDecisionTitle">
      <div class="airport-decision-head">
        <div>
          <p class="eyebrow">Comparaison porte-à-porte</p>
          <h3 id="airportDecisionTitle">${escapeHtml(best.airport?.code || '')} · ${escapeHtml(best.airport?.name || '')}</h3>
        </div>
        <span class="airport-state-badge comparable">Vols comparables</span>
      </div>
      <div class="airport-decision-metrics">
        <div><span>Prix total porte-à-porte</span><strong>${formatEUR(totalCost(best))}</strong><small>benchmark pour 2 voyageurs</small></div>
        <div><span>Durée porte-à-porte</span><strong>${formatDuration(best.doorToDoorMin)}</strong><small>trajet complet estimé</small></div>
        <div><span>Qualité du vol</span><strong>${formatRating(best.flight?.quality)}</strong><small>${escapeHtml(formatStops(best.flight?.stops))}</small></div>
        <div><span>Fatigue</span><strong>${formatRating(best.fatigue)}</strong><small>plus bas = mieux</small></div>
      </div>
      <div class="airport-decision-recommendation"><span>Recommandation</span><p>${escapeHtml(recommendation)}</p></div>
      <p class="airport-comparison-scope">${ranked.length} options comparées · ${escapeHtml(comparability.label)} · aucun aéroport hors de ce groupe n’entre dans le classement.</p>
    </article>`;
}

function renderPriorityControls(data, accessData, groundCostData, groundByCode, flightsByCode, comparability, weights) {
  const node = $('#airportWeights');
  node.hidden = false;
  const labels = {
    cost: 'Prix',
    time: 'Temps',
    flight: 'Qualité du vol',
    fatigue: 'Fatigue'
  };

  node.innerHTML = `
    <button class="airport-priority-toggle" type="button" id="airportPriorityToggle" aria-expanded="${ui.prioritiesOpen}" aria-controls="airportPriorityPanel">Ajuster mes priorités</button>
    <div id="airportPriorityPanel" class="airport-priority-panel" ${ui.prioritiesOpen ? '' : 'hidden'}>
      <p class="airport-priority-intro">Les pondérations ne modifient que le classement du groupe de vols déjà comparable.</p>
      <div class="airport-controls-grid">
        ${Object.entries(labels).map(([key, label]) => `
          <label class="airport-weight">
            <span><strong>${escapeHtml(label)}</strong><output id="airportWeightValue-${key}">${Math.round(weights[key])}%</output></span>
            <input type="range" min="0" max="100" step="5" value="${Math.round(weights[key])}" data-airport-weight="${key}" aria-label="Poids ${escapeHtml(label)}">
          </label>`).join('')}
        <button class="button secondary airport-reset" type="button" id="airportWeightsReset">Réinitialiser</button>
      </div>
    </div>`;

  $('#airportPriorityToggle')?.addEventListener('click', event => {
    ui.prioritiesOpen = !ui.prioritiesOpen;
    event.currentTarget.setAttribute('aria-expanded', String(ui.prioritiesOpen));
    const panel = $('#airportPriorityPanel');
    if (panel) panel.hidden = !ui.prioritiesOpen;
  });

  document.querySelectorAll('[data-airport-weight]').forEach(input => input.addEventListener('input', () => {
    const raw = {};
    document.querySelectorAll('[data-airport-weight]').forEach(slider => {
      raw[slider.dataset.airportWeight] = Number(slider.value);
    });
    const normalized = normalizeWeights(raw);
    Object.entries(normalized).forEach(([key, value]) => {
      const output = document.getElementById(`airportWeightValue-${key}`);
      if (output) output.textContent = `${Math.round(value)}%`;
    });
    saveWeights(tripId, raw);
    rerenderComparableDecision(data, accessData, groundCostData, groundByCode, flightsByCode, comparability, normalized);
  }));

  $('#airportWeightsReset')?.addEventListener('click', () => {
    clearWeights(tripId);
    const defaults = normalizeWeights(data.defaultWeights || DEFAULT_WEIGHTS);
    document.querySelectorAll('[data-airport-weight]').forEach(slider => {
      const key = slider.dataset.airportWeight;
      slider.value = String(Math.round(defaults[key]));
      const output = document.getElementById(`airportWeightValue-${key}`);
      if (output) output.textContent = `${Math.round(defaults[key])}%`;
    });
    rerenderComparableDecision(data, accessData, groundCostData, groundByCode, flightsByCode, comparability, defaults);
  });
}

function rerenderComparableDecision(data, accessData, groundCostData, groundByCode, flightsByCode, comparability, weights) {
  const ranked = scoreOptions(comparability.options, weights);
  if (ranked.length < 2) return;
  renderDecisionSummary(data, comparability, ranked);
  renderAirportList(accessData, groundByCode, flightsByCode, ranked);
  renderCoverageControls(accessData, groundByCode, flightsByCode, ranked);
  const traceNode = $('#airportTrace');
  traceNode.textContent = traceText(data, accessData, groundCostData, `Vols comparables : ${comparability.label}.`);
}

function sortAirportsByGroundRelevance(airports, groundByCode) {
  return [...airports].sort((a, b) => {
    const aDuration = bestAccessDuration(a);
    const bDuration = bestAccessDuration(b);
    if (aDuration !== bDuration) return aDuration - bDuration;
    const aCost = groundCostSortValue(groundByCode.get(a.code));
    const bCost = groundCostSortValue(groundByCode.get(b.code));
    return aCost - bCost;
  });
}

function bestAccessDuration(airport) {
  const durations = (airport?.accessModes || []).map(mode => finiteNumber(mode.durationMin)).filter(value => value !== null);
  return durations.length ? Math.min(...durations) : Number.POSITIVE_INFINITY;
}

function groundCostSortValue(cost) {
  const known = bestKnownGroundCost(cost);
  return known.sortValue ?? Number.POSITIVE_INFINITY;
}

function orderAirports(accessData, groundByCode, ranked) {
  const groundOrder = sortAirportsByGroundRelevance(accessData.airports || [], groundByCode);
  if (!ranked?.length) return groundOrder;

  const byCode = new Map(groundOrder.map(airport => [airport.code, airport]));
  const ordered = [];
  for (const option of ranked) {
    const airport = byCode.get(option.airport?.code);
    if (airport) {
      ordered.push(airport);
      byCode.delete(airport.code);
    }
  }
  for (const airport of groundOrder) {
    if (byCode.has(airport.code)) {
      ordered.push(airport);
      byCode.delete(airport.code);
    }
  }
  return ordered;
}

function renderAirportList(accessData, groundByCode, flightsByCode, ranked) {
  const node = $('#airportCompare');
  const ordered = orderAirports(accessData, groundByCode, ranked);
  const visible = ui.showAllAirports ? ordered : ordered.slice(0, 3);
  const rankByCode = new Map((ranked || []).map((option, index) => [option.airport?.code, index + 1]));

  node.className = 'airport-grid';
  node.innerHTML = visible.map(airport => renderAirportCard(
    airport,
    groundByCode.get(airport.code),
    flightsByCode.get(airport.code),
    rankByCode.get(airport.code) || null
  )).join('');
}

function renderCoverageControls(accessData, groundByCode, flightsByCode, ranked) {
  const node = $('#airportCoverage');
  const total = (accessData.airports || []).length;
  const visibleCount = ui.showAllAirports ? total : Math.min(3, total);
  node.innerHTML = `
    <div class="airport-disclosure-bar">
      <span>${visibleCount} sur ${total} aéroport${total > 1 ? 's' : ''} affiché${visibleCount > 1 ? 's' : ''}${ranked?.length ? ' · ordre : classement aérien comparable puis accès terrestre' : ' · ordre : accessibilité terrestre depuis Reims'}</span>
      ${total > 3 ? `<button class="airport-show-all" type="button" id="airportShowAll" aria-expanded="${ui.showAllAirports}" aria-controls="airportCompare">${ui.showAllAirports ? 'Réduire à 3 aéroports' : `Voir les ${total} aéroports`}</button>` : ''}
    </div>`;

  $('#airportShowAll')?.addEventListener('click', event => {
    ui.showAllAirports = !ui.showAllAirports;
    event.currentTarget.setAttribute('aria-expanded', String(ui.showAllAirports));
    renderAirportList(accessData, groundByCode, flightsByCode, ranked);
    renderCoverageControls(accessData, groundByCode, flightsByCode, ranked);
  });
}

function renderAirportCard(airport, cost, flightOption, rank) {
  const car = (airport.accessModes || []).find(mode => mode.id === 'car');
  const rail = (airport.accessModes || []).find(mode => mode.id === 'rail');
  const flightResearched = isFlightResearched(flightOption);
  const groundCost = bestKnownGroundCost(cost);
  const recommendedClass = rank === 1 ? ' recommended' : '';

  return `<article class="airport-access-card${recommendedClass}">
    <div class="airport-access-card-head">
      <div class="airport-code-name">
        <strong>${escapeHtml(airport.code || '')}</strong>
        <span>${escapeHtml(airport.name || '')}</span>
      </div>
      <span class="airport-flight-research ${flightResearched ? 'done' : 'todo'}">${flightResearched ? 'Vol recherché' : 'Vol à rechercher'}</span>
    </div>
    <div class="airport-card-metrics">
      <div><span>Voiture</span><strong>${car ? formatDuration(car.durationMin) : 'À revérifier'}</strong>${car?.distanceKm ? `<small>${Math.round(Number(car.distanceKm))} km</small>` : ''}</div>
      <div><span>Rail</span><strong>${rail ? formatDuration(rail.durationMin) : 'À revérifier'}</strong>${rail?.mode ? `<small>${escapeHtml(rail.mode)}</small>` : ''}</div>
      <div class="cost"><span>Meilleur coût terrestre connu</span><strong>${escapeHtml(groundCost.summary)}</strong><small>${escapeHtml(groundCost.label)}</small></div>
    </div>
    <details class="airport-details">
      <summary><span>Détails</span><span class="airport-details-icon" aria-hidden="true">+</span></summary>
      <div class="airport-details-body">
        ${renderAccessDetails(car, rail)}
        ${renderGroundCostDetails(cost)}
        ${renderFlightDetails(flightOption)}
        ${renderSources(airport, cost, flightOption)}
      </div>
    </details>
  </article>`;
}

function bestKnownGroundCost(cost) {
  if (!cost) return { summary: 'À revérifier', label: 'Aucun coût terrestre documenté', sortValue: null };

  const routeRange = cost.road?.roundTripRouteEUR;
  const routeLow = finiteNumber(routeRange?.low);
  const routeHigh = finiteNumber(routeRange?.high);
  const parkingValue = finiteNumber(cost.parking20Days?.valueEUR);
  const railOneWay = finiteNumber(cost.railFare?.oneWayPerPersonFromEUR);

  if (routeLow !== null && routeHigh !== null && parkingValue !== null) {
    const completeRange = { low: routeLow + parkingValue, high: routeHigh + parkingValue };
    return {
      summary: formatRangeEUR(completeRange),
      label: `Voiture A/R + parking ${Number(cost?.tripDurationDays) || 20} j`,
      sortValue: completeRange.low
    };
  }

  if (routeLow !== null && routeHigh !== null) {
    return {
      summary: `${formatRangeEUR(routeRange)} + parking à revérifier`,
      label: 'Route A/R connue, total voiture incomplet',
      sortValue: routeLow
    };
  }

  if (railOneWay !== null) {
    const floor = railOneWay * 4;
    return {
      summary: `≥ ${formatEUR(floor)}`,
      label: 'Rail pour 2 A/R, hors segments additionnels',
      sortValue: floor
    };
  }

  return { summary: 'À revérifier', label: 'Coût total inconnu', sortValue: null };
}

function renderAccessDetails(car, rail) {
  const modes = [car, rail].filter(Boolean);
  if (!modes.length) return '';
  return `<section class="airport-detail-section">
    <h4>Accès et hypothèses</h4>
    <div class="airport-detail-grid">
      ${modes.map(mode => `<div>
        <span>${escapeHtml(mode.mode || mode.id || 'Accès')}</span>
        <strong>${formatDuration(mode.durationMin)}${mode.distanceKm ? ` · ${Math.round(Number(mode.distanceKm))} km` : ''}</strong>
        <small>${escapeHtml([mode.status, mode.confidence ? `confiance ${mode.confidence}` : '', mode.checkedAt ? formatDateFR(mode.checkedAt) : ''].filter(Boolean).join(' · '))}</small>
        ${mode.note ? `<p>${escapeHtml(mode.note)}</p>` : ''}
      </div>`).join('')}
    </div>
  </section>`;
}

function renderGroundCostDetails(cost) {
  if (!cost) {
    return `<section class="airport-detail-section"><h4>Coûts terrestres</h4><p class="airport-detail-note">Coûts non documentés.</p></section>`;
  }

  const road = cost.road;
  const parking = cost.parking20Days;
  const rail = cost.railFare;
  const routeRange = road?.roundTripRouteEUR;
  const fuel = road?.oneWay?.fuelEUR;
  const toll = road?.oneWay?.tollEUR;

  let parkingText = 'À revérifier';
  if (hasNumericValue(parking?.valueEUR)) {
    parkingText = formatEUR(Number(parking.valueEUR));
  } else if (parking?.publishedBenchmark?.fromEUR != null) {
    parkingText = `${parking.publishedBenchmark.durationDays} j dès ${formatEUR(parking.publishedBenchmark.fromEUR)} · 20 j dynamique`;
  }

  let railText = 'À revérifier';
  if (hasNumericValue(rail?.oneWayPerPersonFromEUR)) {
    railText = `dès ${formatEUR(rail.oneWayPerPersonFromEUR)} / pers. / aller`;
  }

  return `<section class="airport-detail-section">
    <h4>Route, parking et rail</h4>
    <div class="airport-detail-grid cost-grid">
      <div><span>Route A/R hors parking</span><strong>${routeRange ? formatRangeEUR(routeRange) : 'À revérifier'}</strong><small>${fuel ? `carburant aller ${formatRangeEUR(fuel)}` : 'carburant à revérifier'}${toll ? ` · péage aller ${formatRangeEUR(toll)}` : ''}</small>${road?.note ? `<p>${escapeHtml(road.note)}</p>` : ''}</div>
      <div><span>Parking</span><strong>${escapeHtml(parkingText)}</strong><small>${escapeHtml(parking?.status || 'to_recheck')}</small>${parking?.note ? `<p>${escapeHtml(parking.note)}</p>` : ''}</div>
      <div><span>Rail</span><strong>${escapeHtml(railText)}</strong><small>${escapeHtml(rail?.status || 'to_recheck')}</small>${rail?.note ? `<p>${escapeHtml(rail.note)}</p>` : ''}</div>
    </div>
  </section>`;
}

function renderFlightDetails(option) {
  if (!option) return `<section class="airport-detail-section"><h4>Vol</h4><p class="airport-detail-note">Aucun vol documenté pour cet aéroport.</p></section>`;

  const total = totalCost(option);
  return `<section class="airport-detail-section">
    <h4>Vol documenté</h4>
    <div class="airport-detail-grid cost-grid">
      <div><span>Statut</span><strong>${isFlightResearched(option) ? 'Vol recherché' : 'Vol à rechercher'}</strong><small>${escapeHtml(option.status || 'estimated')} · ${option.checkedAt ? formatDateFR(option.checkedAt) : 'date à revérifier'}</small></div>
      <div><span>Vol</span><strong>${hasNumericValue(option.flight?.priceEUR) ? formatEUR(option.flight.priceEUR) : 'Prix à revérifier'}</strong><small>${formatDuration(option.flight?.durationMin)} · ${escapeHtml(formatStops(option.flight?.stops))} · qualité ${formatRating(option.flight?.quality)}</small></div>
      <div><span>Porte-à-porte</span><strong>${total !== null ? formatEUR(total) : 'Coût incomplet'}</strong><small>${formatDuration(option.doorToDoorMin)} · fatigue ${formatRating(option.fatigue)}</small></div>
    </div>
    ${option.recommendation ? `<p class="airport-detail-note"><strong>Recommandation :</strong> ${escapeHtml(option.recommendation)}</p>` : ''}
    ${(option.advantages?.length || option.compromises?.length) ? `<div class="airport-procon">
      <div><strong>+</strong><ul>${(option.advantages || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
      <div><strong>−</strong><ul>${(option.compromises || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
    </div>` : ''}
  </section>`;
}

function renderSources(airport, cost, flightOption) {
  const sourceEntries = [];
  for (const mode of airport?.accessModes || []) {
    if (mode.source) sourceEntries.push([`${mode.mode || mode.id} · accès`, mode.source]);
    if (mode.secondarySource) sourceEntries.push([`${mode.mode || mode.id} · source complémentaire`, mode.secondarySource]);
  }
  if (cost?.road?.source) sourceEntries.push(['Route', cost.road.source]);
  if (cost?.parking20Days?.source) sourceEntries.push(['Parking', cost.parking20Days.source]);
  if (cost?.railFare?.source) sourceEntries.push(['Rail · tarifs', cost.railFare.source]);
  if (flightOption?.source) sourceEntries.push(['Vol', flightOption.source]);
  if (flightOption?.flight?.source) sourceEntries.push(['Vol', flightOption.flight.source]);

  const unique = [];
  const seen = new Set();
  for (const [label, url] of sourceEntries) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push([label, url]);
  }
  if (!unique.length) return '';

  return `<section class="airport-detail-section airport-sources"><h4>Sources</h4><ul>${unique.map(([label, url]) => `<li>${sourceLink(label, url)}</li>`).join('')}</ul></section>`;
}

function sourceLink(label, url) {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) return `${escapeHtml(label)} · ${escapeHtml(value)}`;
  return `<a href="${escapeHtml(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function traceText(data, accessData, groundCostData, comparisonNote) {
  const parts = [
    `Accès vérifiés ${formatDateFR(accessData.checkedAt)}`,
    `coûts terrestres vérifiés ${formatDateFR(groundCostData.checkedAt)}`,
    `recherche aérienne ${formatDateFR(data.checkedAt || accessData.checkedAt)}`
  ];
  if (comparisonNote) parts.push(comparisonNote);
  if (data.note) parts.push(data.note);
  parts.push('Un coût inconnu reste à revérifier et n’est jamais remplacé par zéro.');
  return parts.join(' · ');
}
