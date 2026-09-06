import { params, escapeHtml, formatEUR, formatDateFR } from './store.js';

const $ = s => document.querySelector(s);
const section = $('#airportSection');
if (!section) throw new Error('airportSection absent du DOM');

const tripId = params().get('trip');
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
      defaultWeights: { cost: 30, time: 30, flight: 25, fatigue: 15 },
      options: []
    };
  } else {
    throw new Error(`Vols HTTP ${tripResponse.status}`);
  }

  const stored = loadWeights(tripId);
  const weights = normalizeWeights(stored || data.defaultWeights || { cost: 30, time: 30, flight: 25, fatigue: 15 });
  renderShell(data, accessData, groundCostData, weights);
  ensureNavLink();
}

function normalizeWeights(raw) {
  const w = {
    cost: Math.max(0, Number(raw.cost) || 0),
    time: Math.max(0, Number(raw.time) || 0),
    flight: Math.max(0, Number(raw.flight) || 0),
    fatigue: Math.max(0, Number(raw.fatigue) || 0)
  };
  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v * 100 / sum]));
}

function loadWeights(id) {
  try { return JSON.parse(localStorage.getItem(`atlas-airport-weights:${id}`) || 'null'); }
  catch { return null; }
}

function saveWeights(id, weights) {
  try { localStorage.setItem(`atlas-airport-weights:${id}`, JSON.stringify(weights)); }
  catch {}
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

// Stable regret model retained only for legacy researched flight files. Adding a
// very expensive/slow option no longer changes the normalization of all existing
// options. New shortlist decisions should prefer the explicit Pareto view.
function scoreOptions(options, weights) {
  const valid = options.filter(o => o.considered !== false && Number.isFinite(Number(o.flight?.priceEUR)) && Number.isFinite(Number(o.doorToDoorMin)));
  if (!valid.length) return [];
  const minCost = Math.min(...valid.map(totalCost));
  const minTime = Math.min(...valid.map(o => Number(o.doorToDoorMin)));
  const costSpanEUR = 1500;
  const timeSpanMin = 480;

  return valid.map(option => {
    const costRegret = clamp01((totalCost(option) - minCost) / costSpanEUR);
    const timeRegret = clamp01((Number(option.doorToDoorMin) - minTime) / timeSpanMin);
    const flightRegret = clamp01((5 - (Number(option.flight?.quality) || 0)) / 5);
    const fatigueRegret = clamp01(((Number(option.fatigue) || 5) - 1) / 4);
    const penalty = (
      costRegret * weights.cost +
      timeRegret * weights.time +
      flightRegret * weights.flight +
      fatigueRegret * weights.fatigue
    );
    return {
      ...option,
      decisionPenalty: penalty,
      components: { costRegret, timeRegret, flightRegret, fatigueRegret },
      comparisonBaseline: { minCost, minTime, costSpanEUR, timeSpanMin }
    };
  }).sort((a, b) => a.decisionPenalty - b.decisionPenalty);
}

function totalCost(option) {
  return (Number(option.access?.costEUR) || 0) + (Number(option.flight?.priceEUR) || 0) + (Number(option.access?.overnightEUR) || 0) + (Number(option.access?.parkingEUR) || 0);
}

function formatDuration(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} h${r ? ` ${String(r).padStart(2, '0')}` : ''}` : `${r} min`;
}

function formatRangeEUR(range) {
  if (!range || !Number.isFinite(Number(range.low)) || !Number.isFinite(Number(range.high))) return '—';
  const low = Number(range.low);
  const high = Number(range.high);
  return Math.abs(high - low) < 0.01 ? formatEUR(low) : `${formatEUR(low)}–${formatEUR(high)}`;
}

function renderShell(data, accessData, groundCostData, weights) {
  $('#airportIntro').textContent = data.intro || 'Comparaison porte-à-porte depuis Reims.';
  renderWeights(data, accessData, groundCostData, weights);
  renderRanking(data, accessData, weights);
  renderAccessCoverage(data, accessData, groundCostData);
  $('#airportTrace').textContent = `${data.status === 'demo' ? 'Données de démonstration' : 'Recherche aérienne'} · ${formatDateFR(data.checkedAt || accessData.checkedAt)}${data.note ? ` · ${data.note}` : ''}`;
}

function renderWeights(data, accessData, groundCostData, weights) {
  const labels = { cost: 'Prix total', time: 'Temps porte-à-porte', flight: 'Qualité du vol', fatigue: 'Fatigue' };
  $('#airportWeights').innerHTML = Object.entries(labels).map(([key, label]) => `
    <label class="airport-weight">
      <span><strong>${escapeHtml(label)}</strong><output id="airportWeightValue-${key}">${Math.round(weights[key])}%</output></span>
      <input type="range" min="0" max="100" step="5" value="${Math.round(weights[key])}" data-airport-weight="${key}" aria-label="Poids ${escapeHtml(label)}">
    </label>`).join('') + '<button class="button secondary airport-reset" type="button" id="airportWeightsReset">Réinitialiser</button>';

  document.querySelectorAll('[data-airport-weight]').forEach(input => input.addEventListener('input', () => {
    const raw = {};
    document.querySelectorAll('[data-airport-weight]').forEach(node => raw[node.dataset.airportWeight] = Number(node.value));
    const normalized = normalizeWeights(raw);
    Object.entries(normalized).forEach(([key, value]) => {
      const out = document.getElementById(`airportWeightValue-${key}`);
      if (out) out.textContent = `${Math.round(value)}%`;
    });
    saveWeights(tripId, raw);
    renderRanking(data, accessData, normalized);
  }));

  $('#airportWeightsReset').onclick = () => {
    try { localStorage.removeItem(`atlas-airport-weights:${tripId}`); } catch {}
    renderShell(data, accessData, groundCostData, normalizeWeights(data.defaultWeights || { cost: 30, time: 30, flight: 25, fatigue: 15 }));
  };
}

function renderRanking(data, accessData, weights) {
  const options = scoreOptions(data.options || [], weights);
  if (!options.length) {
    $('#airportRecommendation').innerHTML = `
      <article class="airport-recommendation research-needed">
        <div><p class="eyebrow">Recherche nécessaire</p><h3>Aucun vol comparable pour l’instant</h3><p>Les six accès depuis Reims sont visibles ci-dessous, mais aucun aéroport ne doit être recommandé avant recherche de vols sur des dates comparables.</p></div>
      </article>`;
    $('#airportCompare').innerHTML = '';
    return;
  }

  const best = options[0];
  $('#airportRecommendation').innerHTML = `
    <article class="airport-recommendation">
      <div><p class="eyebrow">Meilleur compromis provisoire</p><h3>${escapeHtml(best.airport?.code || '')} · ${escapeHtml(best.airport?.name || '')}</h3><p>${escapeHtml(best.recommendation || best.advantages?.[0] || 'Premier rang parmi les seules options aériennes déjà recherchées.')}</p><small>Rang calculé parmi ${options.length} option(s) recherchée(s). Les nouveaux signaux de shortlist sont comparés séparément par Pareto sur l’accueil.</small></div>
      <div class="airport-rank-big"><span>Rang</span><strong>#1</strong><small>legacy provisoire</small></div>
    </article>`;

  $('#airportCompare').innerHTML = options.map((option, index) => {
    const baseline = option.comparisonBaseline;
    const extraCost = Math.max(0, totalCost(option) - baseline.minCost);
    const extraTime = Math.max(0, Number(option.doorToDoorMin) - baseline.minTime);
    return `<article class="airport-card ${index === 0 ? 'recommended' : ''}">
      <div class="airport-card-head">
        <div><span class="airport-rank">#${index + 1} parmi vols recherchés</span><h3>${escapeHtml(option.airport?.code || '')}</h3><p>${escapeHtml(option.airport?.name || '')}</p></div>
        <span class="airport-option-status">${escapeHtml(option.status || data.status || 'estimated')}</span>
      </div>
      <div class="airport-metrics">
        <div><span>Accès utilisé par l'ancien benchmark</span><strong>${formatDuration(option.access?.durationMin)}</strong><small>${escapeHtml(option.access?.mode || '')}</small></div>
        <div><span>Budget comparatif historique</span><strong>${formatEUR(totalCost(option))}</strong><small>${extraCost ? `+${formatEUR(extraCost)} vs moins cher` : 'référence la moins chère'}</small></div>
        <div><span>Temps total historique</span><strong>${formatDuration(option.doorToDoorMin)}</strong><small>${extraTime ? `+${formatDuration(extraTime)} vs plus rapide` : 'référence la plus rapide'}</small></div>
        <div><span>Fatigue</span><strong>${Math.max(1, Math.min(5, Number(option.fatigue) || 5))}/5</strong><small>plus bas = mieux</small></div>
      </div>
      <div class="airport-flight-line"><strong>Vol :</strong> ${formatDuration(option.flight?.durationMin)} · qualité ${Math.max(0, Math.min(5, Number(option.flight?.quality) || 0))}/5 · ${formatEUR(option.flight?.priceEUR || 0)}</div>
      <div class="airport-legacy-warning">Le coût d'accès de ce benchmark reste agrégé et historique. La grille ci-dessous utilise désormais des coûts terrestres séparés et traçables.</div>
      <div class="airport-procon">
        <div><strong>+</strong><ul>${(option.advantages || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
        <div><strong>−</strong><ul>${(option.compromises || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
      </div>
      <div class="airport-status">${escapeHtml(option.status || data.status || 'estimated')} · ${formatDateFR(option.checkedAt || data.checkedAt)}</div>
    </article>`;
  }).join('');
}

function renderAccessCoverage(data, accessData, groundCostData) {
  const node = $('#airportCoverage');
  if (!node) return;
  const researched = new Map((data.options || []).map(option => [option.airport?.code, option]));
  const groundByCode = new Map((groundCostData.airports || []).map(item => [item.code, item]));
  node.innerHTML = `
    <div class="airport-coverage-head">
      <div><p class="eyebrow">Accès terrestre indépendant du voyage</p><h3>Six aéroports à considérer depuis Reims</h3></div>
      <p>Route, parking et rail sont séparés. Un poste inconnu reste « à revérifier » : il n'est jamais remplacé silencieusement par zéro.</p>
    </div>
    <div class="airport-coverage-grid">
      ${(accessData.airports || []).map(airport => {
        const flightOption = researched.get(airport.code);
        const cost = groundByCode.get(airport.code);
        const modes = airport.accessModes || [];
        const car = modes.find(mode => mode.id === 'car');
        const rail = modes.find(mode => mode.id === 'rail');
        return `<article class="airport-access-card ${flightOption ? 'flight-researched' : 'flight-missing'}">
          <div class="airport-access-card-head"><div><strong>${escapeHtml(airport.code)}</strong><span>${escapeHtml(airport.name)}</span></div><span class="airport-flight-research ${flightOption ? 'done' : 'todo'}">${flightOption ? 'Vol recherché' : 'Vol à rechercher'}</span></div>
          <div class="airport-access-modes">
            ${car ? `<div><span>Voiture</span><strong>${formatDuration(car.durationMin)}</strong><small>${car.distanceKm ? `${Math.round(car.distanceKm)} km` : '—'}</small></div>` : ''}
            ${rail ? `<div><span>Rail</span><strong>${formatDuration(rail.durationMin)}</strong><small>${escapeHtml(rail.mode || 'Train')}</small></div>` : ''}
          </div>
          ${renderGroundCost(cost)}
        </article>`;
      }).join('')}
    </div>
    <div class="airport-coverage-trace">Accès vérifiés ${formatDateFR(accessData.checkedAt)} · coûts terrestres vérifiés ${formatDateFR(groundCostData.checkedAt)} · horizon parking ${Number(groundCostData.tripDurationDays) || 20} jours.</div>`;
}

function renderGroundCost(cost) {
  if (!cost) return '<div class="airport-access-costs">Coûts terrestres : <strong>non documentés</strong></div>';
  const routeRange = cost.road?.roundTripRouteEUR;
  const parking = cost.parking20Days;
  const railFare = cost.railFare;
  const route = routeRange ? `${formatRangeEUR(routeRange)} A/R hors parking` : 'route A/R à revérifier';
  let parkingText = 'parking 20 j à revérifier';
  if (Number.isFinite(Number(parking?.valueEUR))) {
    parkingText = `parking 20 j ${formatEUR(parking.valueEUR)}`;
  } else if (parking?.publishedBenchmark?.fromEUR != null) {
    parkingText = `${parking.publishedBenchmark.durationDays} j dès ${formatEUR(parking.publishedBenchmark.fromEUR)} · 20 j dynamique`;
  }

  let carTotal = null;
  if (routeRange && Number.isFinite(Number(parking?.valueEUR))) {
    carTotal = {
      low: Number(routeRange.low) + Number(parking.valueEUR),
      high: Number(routeRange.high) + Number(parking.valueEUR)
    };
  }

  let railText = 'tarif rail à revérifier';
  if (Number.isFinite(Number(railFare?.oneWayPerPersonFromEUR))) {
    const floor = Number(railFare.oneWayPerPersonFromEUR) * 4;
    railText = `rail ≥ ${formatEUR(floor)} pour 2 A/R, hors segments additionnels`;
  }

  return `<div class="airport-access-costs detailed">
    <div><span>Voiture route</span><strong>${escapeHtml(route)}</strong></div>
    <div><span>Parking</span><strong>${escapeHtml(parkingText)}</strong></div>
    ${carTotal ? `<div class="complete"><span>Voiture + parking</span><strong>${escapeHtml(formatRangeEUR(carTotal))}</strong><small>benchmark 20 j calculable</small></div>` : '<div><span>Total voiture</span><strong>incomplet</strong></div>'}
    <div><span>Train</span><strong>${escapeHtml(railText)}</strong></div>
  </div>`;
}

function ensureNavLink() {
  const nav = $('#sectionNav');
  if (!nav || nav.querySelector('[data-section="airportSection"]')) return;
  const link = document.createElement('a');
  link.href = '#airportSection';
  link.dataset.section = 'airportSection';
  link.textContent = 'Aéroports';
  const after = nav.querySelector('[data-section="compareSection"]');
  if (after) after.insertAdjacentElement('afterend', link); else nav.appendChild(link);

  const observer = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a === link));
  }, { rootMargin: '-28% 0px -62% 0px', threshold: [0, .15, .35] });
  observer.observe(section);
}
