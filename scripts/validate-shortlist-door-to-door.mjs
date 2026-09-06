import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const file = 'data/shortlist-door-to-door.json';
const data = JSON.parse(await readFile(resolve(root, file), 'utf8'));
const geometry = JSON.parse(await readFile(resolve(root, 'data/shortlist-gateway-geometry.json'), 'utf8'));
const market = JSON.parse(await readFile(resolve(root, 'data/shortlist-market-scan.json'), 'utf8'));
const access = JSON.parse(await readFile(resolve(root, 'data/airport-access/reims-airports.json'), 'utf8'));
const errors = [];
const fail = message => errors.push(`${file}: ${message}`);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const geometryTrips = new Set((geometry.destinations || []).map(item => item.tripId));
const confidence = new Set(['high','medium','low']);
const airportByCode = new Map((access.airports || []).map(airport => [airport.code, airport]));
const marketObservationById = new Map();

for (const destination of market.destinations || []) {
  for (const observation of destination.observations || []) {
    marketObservationById.set(observation.id, { ...observation, tripId: destination.tripId });
  }
}

function railBenchmark(code) {
  const rail = airportByCode.get(code)?.accessModes?.find(mode => mode.id === 'rail');
  if (!rail || !numeric(rail.durationMin)) return null;
  if (rail.durationRangeMin && numeric(rail.durationRangeMin.low) && numeric(rail.durationRangeMin.high)) {
    return { low: rail.durationRangeMin.low, high: rail.durationRangeMin.high };
  }
  return { low: rail.durationMin, high: rail.durationMin };
}

function sameRange(actual, expected) {
  return numeric(actual?.low) && numeric(actual?.high)
    && Math.abs(actual.low - expected.low) < 0.01
    && Math.abs(actual.high - expected.high) < 0.01;
}

function expectedMarketStatus(observation) {
  return `observed_${observation.dateMatch}`;
}

function validateMarketLink(scenario, item, label) {
  if (!item?.marketObservationId) return;
  const observation = marketObservationById.get(item.marketObservationId);
  if (!observation) {
    fail(`${scenario.id}/${label}: marketObservationId inconnu ${item.marketObservationId}`);
    return;
  }
  if (observation.tripId !== scenario.tripId) fail(`${scenario.id}/${label}: observation marché d'une autre destination`);
  if (observation.origin !== scenario.originAirport) fail(`${scenario.id}/${label}: origine marché ${observation.origin} ≠ ${scenario.originAirport}`);
  const expectedParty = observation.price?.value * data.travelers;
  if (!numeric(item.partyValueEUR) || !numeric(expectedParty) || Math.abs(item.partyValueEUR - expectedParty) > 0.01) {
    fail(`${scenario.id}/${label}: partyValueEUR désynchronisé du scan marché`);
  }
  if (item.budgetUse !== observation.budgetUse) fail(`${scenario.id}/${label}: budgetUse désynchronisé du scan marché`);
  if (item.status !== expectedMarketStatus(observation)) fail(`${scenario.id}/${label}: status désynchronisé du dateMatch marché`);
  if (item.source && item.source !== observation.source) fail(`${scenario.id}/${label}: source désynchronisée du scan marché`);
  const observedDates = observation.observedDates
    ? `${observation.observedDates.departure}/${observation.observedDates.return}`
    : null;
  if ((item.dates || null) !== observedDates) fail(`${scenario.id}/${label}: dates désynchronisées du scan marché`);
}

if (data.schemaVersion !== 2) fail(`schemaVersion attendu=2, trouvé ${data.schemaVersion}`);
if (data.marketScanReference !== 'data/shortlist-market-scan.json') fail('marketScanReference invalide');
if (data.airportAccessReference !== 'data/airport-access/reims-airports.json') fail('airportAccessReference invalide');
if (!dateRe.test(data.checkedAt || '')) fail('checkedAt invalide');
if (!dateRe.test(data.targetWindow?.departure || '') || !dateRe.test(data.targetWindow?.return || '')) fail('targetWindow invalide');
if (data.targetWindow?.departure !== market.targetWindow?.departure || data.targetWindow?.return !== market.targetWindow?.return) fail('targetWindow désynchronisée du scan marché');
if (!numeric(data.travelers) || data.travelers !== 2) fail('travelers doit valoir 2 pour ce brief');
if (data.travelers !== market.travelers) fail('travelers désynchronisé du scan marché');

const seen = new Set();
const scenarioCountByTrip = new Map();
for (const scenario of data.scenarios || []) {
  const id = scenario.id || '???';
  if (seen.has(id)) fail(`${id}: scénario dupliqué`);
  seen.add(id);
  if (!geometryTrips.has(scenario.tripId)) fail(`${id}: tripId absent de shortlist-gateway-geometry`);
  scenarioCountByTrip.set(scenario.tripId, (scenarioCountByTrip.get(scenario.tripId) || 0) + 1);
  if (!scenario.label || !scenario.originAirport || !scenario.geometry || !scenario.status) fail(`${id}: métadonnées scénario incomplètes`);
  if (!confidence.has(scenario.confidence)) fail(`${id}: confidence invalide`);

  const expectedGroundRange = railBenchmark(scenario.originAirport);
  if (!expectedGroundRange) fail(`${id}: benchmark rail ${scenario.originAirport} absent`);

  for (const [directionKey, direction] of [['outbound',scenario.outbound],['return',scenario.return]]) {
    if (!direction || !Array.isArray(direction.segments) || !direction.segments.length) {
      fail(`${id}: ${directionKey}.segments vide`);
      continue;
    }
    const segmentIds = new Set();
    const groundSegments = [];
    for (const segment of direction.segments) {
      if (!segment.id || !segment.label || !segment.type) fail(`${id}/${directionKey}: segment incomplet`);
      if (segmentIds.has(segment.id)) fail(`${id}/${directionKey}: segment ${segment.id} dupliqué`);
      segmentIds.add(segment.id);
      const duration = segment.durationMin || {};
      const hasRange = numeric(duration.low) && numeric(duration.high);
      if (hasRange && (duration.low < 0 || duration.high < duration.low)) fail(`${id}/${segment.id}: plage durée invalide`);
      if ((numeric(duration.low) && !numeric(duration.high)) || (!numeric(duration.low) && numeric(duration.high))) fail(`${id}/${segment.id}: durée partiellement numérique`);
      if (hasRange && ['to_recheck','to_research','variant_dependent'].includes(duration.status)) fail(`${id}/${segment.id}: statut ${duration.status} avec durée numérique`);
      if (!hasRange && segment.required !== false && !duration.status) fail(`${id}/${segment.id}: durée manquante sans statut`);
      if (segment.source && !/^https:\/\//.test(segment.source)) fail(`${id}/${segment.id}: source non HTTPS`);
      if (segment.type === 'ground_access') groundSegments.push(segment);
      validateMarketLink(scenario, segment.cost, `${segment.id}.cost`);
    }
    if (groundSegments.length !== 1) fail(`${id}/${directionKey}: attendu exactement 1 segment ground_access`);
    else if (expectedGroundRange && !sameRange(groundSegments[0].durationMin, expectedGroundRange)) {
      fail(`${id}/${groundSegments[0].id}: durée ground_access désynchronisée de ${scenario.originAirport}`);
    }
  }

  if (!Array.isArray(scenario.costs) || !scenario.costs.length) fail(`${id}: costs vide`);
  const costIds = new Set();
  for (const cost of scenario.costs || []) {
    if (!cost.id || !cost.label || !cost.status) fail(`${id}: coût incomplet`);
    if (costIds.has(cost.id)) fail(`${id}: coût ${cost.id} dupliqué`);
    costIds.add(cost.id);
    const hasValue = numeric(cost.partyValueEUR) || numeric(cost.valueEUR);
    if (hasValue && ['to_recheck','to_research','variant_dependent'].includes(cost.status)) fail(`${id}/${cost.id}: statut ${cost.status} avec montant numérique`);
    if (cost.source && !/^https:\/\//.test(cost.source)) fail(`${id}/${cost.id}: source coût non HTTPS`);
    if (cost.checkedAt && !dateRe.test(cost.checkedAt)) fail(`${id}/${cost.id}: checkedAt invalide`);
    if (cost.id === 'international-airfare' && numeric(cost.partyValueEUR) && !cost.marketObservationId) fail(`${id}/${cost.id}: marketObservationId requis pour un billet chiffré`);
    validateMarketLink(scenario, cost, cost.id);
  }
}

if (seen.size !== 5) fail(`attendu 5 scénarios, trouvé ${seen.size}`);
for (const tripId of geometryTrips) if (!scenarioCountByTrip.has(tripId)) fail(`${tripId}: aucun scénario porte-à-porte`);
if ((scenarioCountByTrip.get('south-africa-nov-2026') || 0) !== 1) fail('Afrique du Sud doit avoir 1 scénario aligné open-jaw à ce stade');
if ((scenarioCountByTrip.get('seychelles-nov-2026') || 0) !== 2) fail('Seychelles doit avoir 2 scénarios CDG/BRU');
if ((scenarioCountByTrip.get('komodo-flores-nov-2026') || 0) !== 2) fail('Komodo doit avoir 2 scénarios CDG/FRA');

if (errors.length) {
  console.error(`\nErreurs porte-à-porte shortlist (${errors.length})`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`\nValidation porte-à-porte shortlist OK: ${seen.size} scénarios, références marché et accès synchronisées.`);
