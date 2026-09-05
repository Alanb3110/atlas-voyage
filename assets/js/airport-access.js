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
  const response = await fetch(`./data/airport-access/${encodeURIComponent(tripId)}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.tripId !== tripId) throw new Error('tripId incohérent');

  const stored = loadWeights(tripId);
  const weights = normalizeWeights(stored || data.defaultWeights || { cost: 35, time: 25, flight: 20, fatigue: 20 });
  renderShell(data, weights);
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

function minMaxScore(value, values, inverse = false) {
  const valid = values.map(Number).filter(Number.isFinite);
  if (!valid.length) return 0.5;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (Math.abs(max - min) < 1e-9) return 1;
  const n = (Number(value) - min) / (max - min);
  return inverse ? 1 - n : n;
}

function scoreOptions(options, weights) {
  const totalCosts = options.map(totalCost);
  const totalTimes = options.map(o => Number(o.doorToDoorMin));
  return options.map(option => {
    const costScore = minMaxScore(totalCost(option), totalCosts, true);
    const timeScore = minMaxScore(option.doorToDoorMin, totalTimes, true);
    const flightScore = Math.max(0, Math.min(1, (Number(option.flight?.quality) || 0) / 5));
    const fatigueScore = Math.max(0, Math.min(1, (6 - (Number(option.fatigue) || 5)) / 5));
    const score = (
      costScore * weights.cost +
      timeScore * weights.time +
      flightScore * weights.flight +
      fatigueScore * weights.fatigue
    );
    return { ...option, score, components: { costScore, timeScore, flightScore, fatigueScore } };
  }).sort((a, b) => b.score - a.score);
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

function renderShell(data, weights) {
  $('#airportIntro').textContent = data.intro || 'Comparaison porte-à-porte depuis Reims.';
  renderWeights(data, weights);
  renderRanking(data, weights);
  $('#airportTrace').textContent = `${data.status === 'demo' ? 'Données de démonstration' : 'Données voyage'} · vérifiées ${formatDateFR(data.checkedAt)}${data.note ? ` · ${data.note}` : ''}`;
}

function renderWeights(data, weights) {
  const labels = { cost: 'Prix total', time: 'Temps porte-à-porte', flight: 'Qualité du vol', fatigue: 'Fatigue' };
  $('#airportWeights').innerHTML = Object.entries(labels).map(([key, label]) => `
    <label class="airport-weight">
      <span><strong>${escapeHtml(label)}</strong><output id="airportWeightValue-${key}">${Math.round(weights[key])}%</output></span>
      <input type="range" min="0" max="100" step="5" value="${Math.round(weights[key])}" data-airport-weight="${key}">
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
    renderRanking(data, normalized);
  }));

  $('#airportWeightsReset').onclick = () => {
    try { localStorage.removeItem(`atlas-airport-weights:${tripId}`); } catch {}
    renderShell(data, normalizeWeights(data.defaultWeights || { cost: 35, time: 25, flight: 20, fatigue: 20 }));
  };
}

function renderRanking(data, weights) {
  const options = scoreOptions((data.options || []).filter(o => o.considered !== false), weights);
  if (!options.length) {
    $('#airportRecommendation').innerHTML = '<div class="error-box">Aucun aéroport comparé pour ce voyage.</div>';
    $('#airportCompare').innerHTML = '';
    return;
  }

  const best = options[0];
  $('#airportRecommendation').innerHTML = `
    <article class="airport-recommendation">
      <div><p class="eyebrow">Choix actuel</p><h3>${escapeHtml(best.airport?.code || '')} · ${escapeHtml(best.airport?.name || '')}</h3><p>${escapeHtml(best.recommendation || best.advantages?.[0] || 'Meilleur compromis avec les pondérations actuelles.')}</p></div>
      <div class="airport-score-big"><span>Score</span><strong>${Math.round(best.score)}</strong><small>/100</small></div>
    </article>`;

  $('#airportCompare').innerHTML = options.map((option, index) => `
    <article class="airport-card ${index === 0 ? 'recommended' : ''}">
      <div class="airport-card-head">
        <div><span class="airport-rank">#${index + 1}</span><h3>${escapeHtml(option.airport?.code || '')}</h3><p>${escapeHtml(option.airport?.name || '')}</p></div>
        <div class="airport-score"><strong>${Math.round(option.score)}</strong><span>/100</span></div>
      </div>
      <div class="airport-metrics">
        <div><span>Accès Reims</span><strong>${formatDuration(option.access?.durationMin)}</strong><small>${escapeHtml(option.access?.mode || '')}</small></div>
        <div><span>Coût porte-à-porte</span><strong>${formatEUR(totalCost(option))}</strong><small>pour le voyage</small></div>
        <div><span>Temps total</span><strong>${formatDuration(option.doorToDoorMin)}</strong><small>${Number(option.flight?.stops) || 0} escale(s)</small></div>
        <div><span>Fatigue</span><strong>${Math.max(1, Math.min(5, Number(option.fatigue) || 5))}/5</strong><small>plus bas = mieux</small></div>
      </div>
      <div class="airport-flight-line"><strong>Vol :</strong> ${formatDuration(option.flight?.durationMin)} · qualité ${Math.max(0, Math.min(5, Number(option.flight?.quality) || 0))}/5 · ${formatEUR(option.flight?.priceEUR || 0)}</div>
      <div class="airport-procon">
        <div><strong>+</strong><ul>${(option.advantages || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
        <div><strong>−</strong><ul>${(option.compromises || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
      </div>
      <div class="airport-status">${escapeHtml(option.status || data.status || 'estimated')} · ${formatDateFR(option.checkedAt || data.checkedAt)}</div>
    </article>`).join('');
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
