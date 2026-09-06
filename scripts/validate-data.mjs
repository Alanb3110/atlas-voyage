import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const errors = [];
const warnings = [];

const fail = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const finiteNumber = v => typeof v === 'number' && Number.isFinite(v);
const finiteNonNegative = v => finiteNumber(v) && v >= 0;
const validCoord = c => Array.isArray(c) && c.length === 2 && finiteNumber(c[0]) && finiteNumber(c[1]) && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180;
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const allowedLifecycle = new Set(['longlist','shortlist','selected','detailed','bookable','booked','archived']);
const allowedResearchDepth = new Set(['high','medium','low','legacy']);
const allowedConfidence = new Set(['A','B','C','D']);
const allowedGateStates = new Set(['pass','watch','hold','fail']);
const allowedPriceStatuses = new Set(['confirmed','observed','estimated','hypothesis','to_recheck']);
const allowedPriceConfidence = new Set(['high','medium','low']);
const allowedFacetValues = new Set(['high','medium','low','none']);
const requiredFacets = ['nature','terrestrialWildlife','marineWildlife','beach','culture','weather'];

function validateTraceableValue(file, label, item, expectedUnit = null) {
  if (!item || typeof item !== 'object') { fail(file, `${label}: objet traçable manquant`); return; }
  if (!finiteNonNegative(item.value)) fail(file, `${label}: value invalide`);
  if (!allowedPriceStatuses.has(item.status)) fail(file, `${label}: status inconnu ${item.status}`);
  if (!validDate(item.checkedAt)) fail(file, `${label}: checkedAt doit être YYYY-MM-DD`);
  if (!item.source || typeof item.source !== 'string') fail(file, `${label}: source manquante`);
  if (!allowedPriceConfidence.has(item.confidence)) fail(file, `${label}: confidence doit être high, medium ou low`);
  if (expectedUnit && item.unit !== expectedUnit) fail(file, `${label}: unit doit être ${expectedUnit}`);
}

const catalog = await readJson('data/catalog.json');
const ids = new Set();
const catalogById = new Map();
for (const entry of catalog.trips ?? []) {
  if (!entry.id) { fail('data/catalog.json', 'voyage sans id'); continue; }
  if (ids.has(entry.id)) fail('data/catalog.json', `id dupliqué: ${entry.id}`);
  ids.add(entry.id);
  catalogById.set(entry.id, entry);
  if (!allowedLifecycle.has(entry.status)) fail('data/catalog.json', `${entry.id}: statut lifecycle inconnu ${entry.status}`);
  if (entry.researchDepth && !allowedResearchDepth.has(entry.researchDepth)) fail('data/catalog.json', `${entry.id}: researchDepth inconnu ${entry.researchDepth}`);

  let trip;
  try { trip = await readJson(entry.dataFile); }
  catch (e) { fail(entry.dataFile, `JSON illisible ou fichier absent: ${e.message}`); continue; }

  const file = entry.dataFile;
  if (trip.id !== entry.id) fail(file, `trip.id (${trip.id}) différent du catalogue (${entry.id})`);
  if (!Array.isArray(trip.variants) || !trip.variants.length) fail(file, 'aucune variante');
  if (!Array.isArray(trip.budgets) || trip.budgets.length !== 3) warn(file, `attendu: 3 budgets, trouvé: ${trip.budgets?.length ?? 0}`);
  if (!trip.variants?.some(v => v.id === trip.defaultVariant)) fail(file, `defaultVariant inconnu: ${trip.defaultVariant}`);
  if (!trip.budgets?.some(b => b.id === trip.defaultBudget)) fail(file, `defaultBudget inconnu: ${trip.defaultBudget}`);
  if (entry.variantCount != null && entry.variantCount !== trip.variants?.length) warn(file, `variantCount catalogue=${entry.variantCount}, données=${trip.variants?.length}`);

  const budgetIds = new Set((trip.budgets ?? []).map(b => b.id));
  for (const budget of trip.budgets ?? []) {
    if (!budget.id) fail(file, 'budget sans id');
    if (!finiteNonNegative(budget.total)) fail(file, `budget ${budget.id}: total non numérique ou négatif`);
    const rows = budget.breakdown ?? [];
    if (rows.length) {
      let sum = 0;
      for (const [rowIndex, row] of rows.entries()) {
        if (!finiteNumber(row.amount)) {
          fail(file, `budget ${budget.id}: poste ${rowIndex + 1} amount invalide`);
          continue;
        }
        sum += row.amount;
      }
      if (finiteNumber(budget.total) && Math.abs(sum - budget.total) > 1) fail(file, `budget ${budget.id}: somme des postes ${sum} ≠ total ${budget.total}`);
    } else warn(file, `budget ${budget.id}: breakdown vide`);
  }

  for (const v of trip.variants ?? []) {
    if (!v.id) fail(file, 'variante sans id');
    if (!Array.isArray(v.steps) || !v.steps.length) fail(file, `variante ${v.id}: aucune étape`);
    for (const [i, step] of (v.steps ?? []).entries()) {
      if (!validCoord(step.coords)) fail(file, `variante ${v.id}, étape ${i + 1}: coordonnées invalides`);
      if (!step.name) fail(file, `variante ${v.id}, étape ${i + 1}: nom manquant`);
      for (const b of budgetIds) if (!step.lodging?.[b]) warn(file, `variante ${v.id}, ${step.name}: hébergement ${b} absent`);
    }
    for (const [i, route] of (v.routes ?? []).entries()) {
      if (!['air','sea','road','rail'].includes(route.type)) warn(file, `variante ${v.id}, route ${i + 1}: type inconnu ${route.type}`);
      if (!Array.isArray(route.points) || route.points.length < 2 || route.points.some(p => !validCoord(p))) fail(file, `variante ${v.id}, route ${i + 1}: points invalides`);
      if (route.real == null) warn(file, `variante ${v.id}, route ${i + 1}: préciser real=true/false`);
    }
  }

  const airportFile = `data/airport-access/${entry.id}.json`;
  let airportData;
  try { airportData = await readJson(airportFile); }
  catch (e) {
    warn(airportFile, `comparateur aéroports absent ou illisible: ${e.message}`);
    continue;
  }

  if (airportData.tripId !== entry.id) fail(airportFile, `tripId (${airportData.tripId}) différent du catalogue (${entry.id})`);
  const weights = airportData.defaultWeights ?? {};
  const weightKeys = ['cost','time','flight','fatigue'];
  for (const key of weightKeys) if (!finiteNonNegative(weights[key])) fail(airportFile, `pondération ${key} invalide`);
  const weightSum = weightKeys.reduce((a, key) => a + (finiteNumber(weights[key]) ? weights[key] : 0), 0);
  if (Math.abs(weightSum - 100) > 0.01) warn(airportFile, `somme des pondérations=${weightSum}, attendu 100`);

  const airportIds = new Set();
  for (const [i, option] of (airportData.options ?? []).entries()) {
    const label = option.id || `option ${i + 1}`;
    if (!option.id) fail(airportFile, `option ${i + 1}: id manquant`);
    if (airportIds.has(option.id)) fail(airportFile, `id aéroport dupliqué: ${option.id}`);
    airportIds.add(option.id);
    if (!option.airport?.code || !option.airport?.name) fail(airportFile, `${label}: airport.code/name manquant`);
    if (!finiteNonNegative(option.access?.durationMin)) fail(airportFile, `${label}: access.durationMin invalide`);
    if (!finiteNonNegative(option.access?.costEUR)) fail(airportFile, `${label}: access.costEUR invalide`);
    if (!finiteNonNegative(option.flight?.priceEUR)) fail(airportFile, `${label}: flight.priceEUR invalide`);
    if (!finiteNonNegative(option.flight?.durationMin)) fail(airportFile, `${label}: flight.durationMin invalide`);
    if (!finiteNonNegative(option.doorToDoorMin)) fail(airportFile, `${label}: doorToDoorMin invalide`);
    const quality = option.flight?.quality;
    if (!finiteNumber(quality) || quality < 0 || quality > 5) fail(airportFile, `${label}: flight.quality doit être entre 0 et 5`);
    const fatigue = option.fatigue;
    if (!finiteNumber(fatigue) || fatigue < 1 || fatigue > 5) fail(airportFile, `${label}: fatigue doit être entre 1 et 5`);
  }
  if (!(airportData.options ?? []).length) warn(airportFile, 'aucun aéroport comparé');
}

const destinationFile = 'data/destination-comparison.json';
try {
  const comparison = await readJson(destinationFile);
  const criteria = ['wildlife','season','relaxation','beach','culture','food','safety','logistics'];
  const weights = comparison.weights ?? {};
  for (const key of criteria) if (!finiteNonNegative(weights[key])) fail(destinationFile, `pondération ${key} invalide`);
  const totalWeight = criteria.reduce((a, key) => a + (finiteNumber(weights[key]) ? weights[key] : 0), 0);
  if (Math.abs(totalWeight - 100) > 0.01) warn(destinationFile, `somme des pondérations=${totalWeight}, attendu 100`);

  const seenTrips = new Set();
  for (const [i, row] of (comparison.destinations ?? []).entries()) {
    const label = row.tripId || `destination ${i + 1}`;
    if (!row.tripId) fail(destinationFile, `destination ${i + 1}: tripId manquant`);
    if (seenTrips.has(row.tripId)) fail(destinationFile, `tripId dupliqué: ${row.tripId}`);
    seenTrips.add(row.tripId);
    if (!ids.has(row.tripId)) fail(destinationFile, `${label}: tripId absent du catalogue`);
    // Lifecycle authority is data/catalog.json. `stage` remains tolerated only as
    // legacy schema baggage until destination-comparison v4 removes it entirely.
    if (row.stage != null && !allowedLifecycle.has(row.stage)) fail(destinationFile, `${label}: stage legacy inconnu ${row.stage}`);
    if (!allowedConfidence.has(row.evidenceConfidence)) fail(destinationFile, `${label}: evidenceConfidence doit être A, B, C ou D`);
    const defaultHalf = row.uncertaintyHalfWidth;
    if (!finiteNumber(defaultHalf) || defaultHalf < 0 || defaultHalf > 2) fail(destinationFile, `${label}: uncertaintyHalfWidth doit être entre 0 et 2`);

    validateTraceableValue(destinationFile, `${label}.comfortBudget`, row.comfortBudget);
    if (row.comfortBudget?.currency !== 'EUR') fail(destinationFile, `${label}.comfortBudget: currency doit être EUR pour le comparateur actuel`);
    validateTraceableValue(destinationFile, `${label}.doorToDoor`, row.doorToDoor, 'min');

    for (const facet of requiredFacets) {
      if (!allowedFacetValues.has(row.facets?.[facet])) fail(destinationFile, `${label}: facette ${facet} doit être high, medium, low ou none`);
    }

    for (const key of criteria) {
      const score = row.scores?.[key];
      if (!finiteNumber(score) || score < 0 || score > 5) fail(destinationFile, `${label}: score ${key} doit être entre 0 et 5`);
      if (row.uncertaintyOverrides?.[key] != null) {
        const override = row.uncertaintyOverrides[key];
        if (!finiteNumber(override) || override < 0 || override > 2) fail(destinationFile, `${label}: incertitude ${key} doit être entre 0 et 2`);
      }
    }
    for (const [gateIndex, gate] of (row.gates ?? []).entries()) {
      if (!gate.id) fail(destinationFile, `${label}: gate ${gateIndex + 1} sans id`);
      if (!allowedGateStates.has(gate.state)) fail(destinationFile, `${label}: gate ${gate.id || gateIndex + 1} état inconnu ${gate.state}`);
      if (typeof gate.blocking !== 'boolean') fail(destinationFile, `${label}: gate ${gate.id || gateIndex + 1} blocking doit être booléen`);
      if (gate.blocking && gate.state === 'watch') warn(destinationFile, `${label}: gate ${gate.id} est blocking mais seulement watch ; préférer hold si le classement doit être suspendu`);
    }
  }
  if (!(comparison.destinations ?? []).length) warn(destinationFile, 'aucune destination comparée');
} catch (e) {
  fail(destinationFile, `fichier absent ou illisible: ${e.message}`);
}

if (warnings.length) {
  console.log(`\nAvertissements (${warnings.length})`);
  warnings.forEach(x => console.log(`- ${x}`));
}
if (errors.length) {
  console.error(`\nErreurs (${errors.length})`);
  errors.forEach(x => console.error(`- ${x}`));
  process.exit(1);
}
console.log(`\nValidation OK: ${catalog.trips?.length ?? 0} voyage(s), aucune erreur bloquante.`);
