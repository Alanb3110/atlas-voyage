import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const file = 'data/shortlist-door-to-door.json';
const data = JSON.parse(await readFile(resolve(root, file), 'utf8'));
const geometry = JSON.parse(await readFile(resolve(root, 'data/shortlist-gateway-geometry.json'), 'utf8'));
const errors = [];
const fail = message => errors.push(`${file}: ${message}`);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const geometryTrips = new Set((geometry.destinations || []).map(item => item.tripId));
const confidence = new Set(['high','medium','low']);

if (!dateRe.test(data.checkedAt || '')) fail('checkedAt invalide');
if (!dateRe.test(data.targetWindow?.departure || '') || !dateRe.test(data.targetWindow?.return || '')) fail('targetWindow invalide');
if (!numeric(data.travelers) || Number(data.travelers) !== 2) fail('travelers doit valoir 2 pour ce brief');

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

  for (const [directionKey, direction] of [['outbound',scenario.outbound],['return',scenario.return]]) {
    if (!direction || !Array.isArray(direction.segments) || !direction.segments.length) {
      fail(`${id}: ${directionKey}.segments vide`);
      continue;
    }
    const segmentIds = new Set();
    for (const segment of direction.segments) {
      if (!segment.id || !segment.label || !segment.type) fail(`${id}/${directionKey}: segment incomplet`);
      if (segmentIds.has(segment.id)) fail(`${id}/${directionKey}: segment ${segment.id} dupliqué`);
      segmentIds.add(segment.id);
      const duration = segment.durationMin || {};
      const hasRange = numeric(duration.low) && numeric(duration.high);
      if (hasRange && (Number(duration.low) < 0 || Number(duration.high) < Number(duration.low))) fail(`${id}/${segment.id}: plage durée invalide`);
      if ((numeric(duration.low) && !numeric(duration.high)) || (!numeric(duration.low) && numeric(duration.high))) fail(`${id}/${segment.id}: durée partiellement numérique`);
      if (hasRange && ['to_recheck','to_research','variant_dependent'].includes(duration.status)) fail(`${id}/${segment.id}: statut ${duration.status} avec durée numérique`);
      if (!hasRange && segment.required !== false && !duration.status) fail(`${id}/${segment.id}: durée manquante sans statut`);
      if (segment.source && !/^https:\/\//.test(segment.source)) fail(`${id}/${segment.id}: source non HTTPS`);
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
console.log(`\nValidation porte-à-porte shortlist OK: ${seen.size} scénarios.`);
