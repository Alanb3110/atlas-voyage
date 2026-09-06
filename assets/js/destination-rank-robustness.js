import { assertDestinationComparisonNumericContract } from './destination-data-contract.js';

const grid = document.querySelector('#destinationCompareGrid');
const top3 = document.querySelector('#destinationTop3');

if (grid) {
  init().catch(error => console.warn('Indicateur de robustesse des rangs indisponible:', error));
}

async function init() {
  const response = await fetch('./data/destination-comparison.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  assertDestinationComparisonNumericContract(data);
  const ranges = new Map((data.destinations || []).map(row => [row.tripId, {
    range: weightedScoreRange(row, data.weights || {}),
    gate: gateState(row)
  }]));

  const annotate = () => {
    annotateCards(grid, ranges);
    if (top3) annotateTop3(top3, ranges);
  };

  const observer = new MutationObserver(annotate);
  observer.observe(grid, { childList: true });
  if (top3) observer.observe(top3, { childList: true });
  annotate();
}

function clamp5(value) {
  return Math.max(0, Math.min(5, value));
}

function criterionRange(row, key) {
  const central = clamp5(row.scores[key]);
  const overrides = row.uncertaintyOverrides || {};
  const half = Object.prototype.hasOwnProperty.call(overrides, key)
    ? overrides[key]
    : row.uncertaintyHalfWidth;
  return { low: clamp5(central - half), central, high: clamp5(central + half) };
}

function weightedScoreRange(row, weights) {
  const keys = ['wildlife','season','relaxation','beach','culture','food','safety','logistics'];
  let low = 0;
  let central = 0;
  let high = 0;
  let totalWeight = 0;
  for (const key of keys) {
    const weight = weights[key];
    const range = criterionRange(row, key);
    low += range.low / 5 * weight;
    central += range.central / 5 * weight;
    high += range.high / 5 * weight;
    totalWeight += weight;
  }
  if (Math.abs(totalWeight - 100) > 0.01) throw new RangeError(`somme des pondérations=${totalWeight}, attendu 100`);
  return { low, central, high };
}

function gateState(row) {
  const gates = row.gates || [];
  if (gates.some(g => g.state === 'fail')) return 'fail';
  if (gates.some(g => g.blocking && g.state !== 'pass')) return 'hold';
  if (gates.some(g => g.state === 'watch')) return 'watch';
  return 'pass';
}

function tripIdFromCard(card) {
  const link = card.querySelector('a[href*="trip="]');
  if (!link) return null;
  try { return new URL(link.href, location.href).searchParams.get('trip'); }
  catch { return null; }
}

function overlaps(a, b) {
  return a.low <= b.high && b.low <= a.high;
}

function rankIsRobust(items, index) {
  const current = items[index]?.range;
  if (!current) return false;
  const previous = items[index - 1]?.range;
  const next = items[index + 1]?.range;
  const separatedFromPrevious = !previous || !overlaps(previous, current);
  const separatedFromNext = !next || !overlaps(current, next);
  return separatedFromPrevious && separatedFromNext;
}

function annotateCards(container, ranges) {
  const cards = [...container.querySelectorAll('.destination-compare-card')];
  const ranked = cards.map((card, index) => {
    const tripId = tripIdFromCard(card);
    const info = ranges.get(tripId);
    return { card, tripId, info, index, range: info?.range };
  }).filter(item => item.info && !['hold','fail'].includes(item.info.gate));

  ranked.forEach((item, index) => {
    const pill = item.card.querySelector('.destination-rank');
    if (!pill) return;
    const robust = rankIsRobust(ranked, index);
    const centralRank = index + 1;
    pill.textContent = robust ? `#${centralRank} central · séparé` : `#${centralRank} central · non robuste`;
    pill.title = robust
      ? `La plage actuelle ne recouvre pas celles des rangs voisins.`
      : `La plage actuelle recouvre au moins un rang voisin : l'ordre exact n'est pas robuste.`;
  });
}

function annotateTop3(container, ranges) {
  const cards = [...container.querySelectorAll('.destination-top-card')].map((card, index) => {
    const tripId = tripIdFromCard(card);
    return { card, index, range: ranges.get(tripId)?.range };
  }).filter(item => item.range);

  cards.forEach((item, index) => {
    const rank = item.card.querySelector('.destination-top-rank');
    if (!rank) return;
    const robust = rankIsRobust(cards, index);
    rank.textContent = robust ? `#${index + 1} · séparé` : `#${index + 1} · ≈`;
    rank.title = robust ? 'Rang central séparé des voisins visibles.' : 'Rang central non robuste : plages d’incertitude recouvrantes.';
  });
}
