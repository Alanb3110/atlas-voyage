const grid = document.querySelector('#destinationCompareGrid');
const top3 = document.querySelector('#destinationTop3');

if (grid) {
  init().catch(error => console.warn('Groupes de robustesse indisponibles:', error));
}

async function init() {
  const response = await fetch('./data/destination-comparison.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
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
  return Math.max(0, Math.min(5, Number(value) || 0));
}

function criterionRange(row, key) {
  const central = clamp5(row.scores?.[key]);
  const override = Number(row.uncertaintyOverrides?.[key]);
  const fallback = Number(row.uncertaintyHalfWidth);
  const half = Number.isFinite(override) ? Math.max(0, override) : (Number.isFinite(fallback) ? Math.max(0, fallback) : 0);
  return { low: clamp5(central - half), central, high: clamp5(central + half) };
}

function weightedScoreRange(row, weights) {
  const keys = ['wildlife','season','relaxation','beach','culture','food','safety','logistics'];
  let low = 0;
  let central = 0;
  let high = 0;
  let totalWeight = 0;
  for (const key of keys) {
    const weight = Number(weights[key]) || 0;
    const range = criterionRange(row, key);
    low += range.low / 5 * weight;
    central += range.central / 5 * weight;
    high += range.high / 5 * weight;
    totalWeight += weight;
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

function tripIdFromCard(card) {
  const link = card.querySelector('a[href*="trip="]');
  if (!link) return null;
  try { return new URL(link.href, location.href).searchParams.get('trip'); }
  catch { return null; }
}

function robustGroups(items) {
  const groups = [];
  let current = null;
  for (const item of items) {
    if (!current || item.range.high < current.leaderLow) {
      current = { leaderLow: item.range.low, items: [item] };
      groups.push(current);
    } else {
      current.items.push(item);
    }
  }
  return groups;
}

function groupName(index) {
  return String.fromCharCode(65 + Math.min(index, 25));
}

function annotateCards(container, ranges) {
  const cards = [...container.querySelectorAll('.destination-compare-card')];
  const ranked = cards.map((card, index) => {
    const tripId = tripIdFromCard(card);
    const info = ranges.get(tripId);
    return { card, tripId, info, index, range: info?.range };
  }).filter(item => item.info && !['hold','fail'].includes(item.info.gate));

  const groups = robustGroups(ranked);
  groups.forEach((group, groupIndex) => {
    const letter = groupName(groupIndex);
    const ambiguous = group.items.length > 1;
    group.items.forEach(item => {
      const pill = item.card.querySelector('.destination-rank');
      if (!pill) return;
      const centralRank = item.index + 1;
      pill.textContent = ambiguous ? `Groupe ${letter} · #${centralRank} central` : `#${centralRank} robuste`;
      pill.title = ambiguous
        ? `Les plages d'incertitude de ce groupe se recouvrent ; l'ordre interne n'est pas robuste.`
        : `Cette position est séparée du groupe suivant par les plages d'incertitude actuelles.`;
    });
  });
}

function annotateTop3(container, ranges) {
  const cards = [...container.querySelectorAll('.destination-top-card')].map((card, index) => {
    const tripId = tripIdFromCard(card);
    return { card, index, range: ranges.get(tripId)?.range };
  }).filter(item => item.range);
  const groups = robustGroups(cards);
  groups.forEach((group, groupIndex) => {
    const letter = groupName(groupIndex);
    group.items.forEach(item => {
      const rank = item.card.querySelector('.destination-top-rank');
      if (rank) rank.textContent = `${letter} · #${item.index + 1}`;
    });
  });
}
