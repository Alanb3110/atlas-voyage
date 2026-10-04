import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIFECYCLE,
  allowedReadinessStates,
  isLifecycleStatus,
  lifecycleRequirements
} from '../assets/js/lifecycle-contract.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const errors = [];
const warnings = [];

const fail = (file, message) => errors.push(`${file}: ${message}`);
const warn = (file, message) => warnings.push(`${file}: ${message}`);
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));

async function readOptionalJson(path) {
  try {
    return await readJson(path);
  } catch {
    return null;
  }
}

const catalogFile = 'data/catalog.json';
const catalog = await readJson(catalogFile);
const declaredLifecycle = catalog.lifecycle ?? [];

if (JSON.stringify(declaredLifecycle) !== JSON.stringify(LIFECYCLE)) {
  fail(catalogFile, `catalog.lifecycle doit être exactement: ${LIFECYCLE.join(' → ')}`);
}

const [comparison, evidence, market, geometry, doorToDoor] = await Promise.all([
  readJson('data/destination-comparison.json'),
  readJson('data/longlist-evidence.json'),
  readJson('data/shortlist-market-scan.json'),
  readJson('data/shortlist-gateway-geometry.json'),
  readJson('data/shortlist-door-to-door.json')
]);

const comparisonIds = new Set((comparison.destinations ?? []).map(item => item.tripId));
const evidenceIds = new Set((evidence.destinations ?? []).map(item => item.tripId));
const marketIds = new Set((market.destinations ?? []).map(item => item.tripId));
const geometryIds = new Set((geometry.destinations ?? []).map(item => item.tripId));
const doorToDoorIds = new Set((doorToDoor.scenarios ?? []).map(item => item.tripId));

const seen = new Set();

for (const [index, entry] of (catalog.trips ?? []).entries()) {
  const label = entry?.id || `entrée ${index + 1}`;

  if (!entry || typeof entry !== 'object') {
    fail(catalogFile, `entrée ${index + 1}: objet invalide`);
    continue;
  }
  if (!entry.id || typeof entry.id !== 'string') {
    fail(catalogFile, `entrée ${index + 1}: id obligatoire`);
    continue;
  }
  if (seen.has(entry.id)) fail(catalogFile, `${entry.id}: id dupliqué`);
  seen.add(entry.id);

  if (!entry.title || typeof entry.title !== 'string') fail(catalogFile, `${label}: title obligatoire`);
  if (!isLifecycleStatus(entry.status)) {
    fail(catalogFile, `${label}: statut lifecycle inconnu ${entry.status}`);
    continue;
  }

  const requirements = lifecycleRequirements(entry.status);
  const hasDataFile = typeof entry.dataFile === 'string' && entry.dataFile.trim().length > 0;
  const detailMetadata = ['defaultVariant', 'defaultBudget', 'variantCount'].filter(key => entry[key] != null);

  if (detailMetadata.length && !hasDataFile) {
    fail(catalogFile, `${label}: ${detailMetadata.join(', ')} exige dataFile`);
  }

  if (requirements.tripData && !hasDataFile) {
    fail(catalogFile, `${label}: dataFile obligatoire au statut ${entry.status}`);
  }

  if (requirements.tripData) {
    if (!entry.defaultVariant || typeof entry.defaultVariant !== 'string') fail(catalogFile, `${label}: defaultVariant obligatoire au statut ${entry.status}`);
    if (!entry.defaultBudget || typeof entry.defaultBudget !== 'string') fail(catalogFile, `${label}: defaultBudget obligatoire au statut ${entry.status}`);
    if (!Number.isInteger(entry.variantCount) || entry.variantCount < 1) fail(catalogFile, `${label}: variantCount entier positif obligatoire au statut ${entry.status}`);
  }

  if (requirements.comparison && !comparisonIds.has(entry.id)) {
    fail('data/destination-comparison.json', `${label}: entrée requise au statut ${entry.status}`);
  }
  if (requirements.evidence && !evidenceIds.has(entry.id)) {
    fail('data/longlist-evidence.json', `${label}: registre de preuves requis au statut ${entry.status}`);
  }

  if (requirements.shortlistResearch) {
    if (!marketIds.has(entry.id)) fail('data/shortlist-market-scan.json', `${label}: recherche marché requise au statut ${entry.status}`);
    if (!geometryIds.has(entry.id)) fail('data/shortlist-gateway-geometry.json', `${label}: géométrie gateway requise au statut ${entry.status}`);
    if (!doorToDoorIds.has(entry.id)) fail('data/shortlist-door-to-door.json', `${label}: scénario porte-à-porte requis au statut ${entry.status}`);
  }

  if (hasDataFile) {
    const trip = await readOptionalJson(entry.dataFile);
    if (!trip) fail(entry.dataFile, `${label}: dataFile déclaré mais absent ou JSON invalide`);
    else if (trip.id !== entry.id) fail(entry.dataFile, `${label}: trip.id ${trip.id} incohérent`);
  }

  if (requirements.bookingReadiness) {
    const bookingFile = `data/booking-status/${entry.id}.json`;
    const booking = await readOptionalJson(bookingFile);
    if (!booking) {
      fail(bookingFile, `${label}: readiness obligatoire au statut ${entry.status}`);
    } else {
      if (booking.schemaVersion !== 2) fail(bookingFile, `${label}: schemaVersion 2 obligatoire au statut ${entry.status}`);
      if (booking.tripId !== entry.id) fail(bookingFile, `${label}: tripId incohérent ${booking.tripId}`);
      const state = booking.readiness?.state;
      const allowed = allowedReadinessStates(entry.status);
      if (!allowed.includes(state)) {
        fail(bookingFile, `${label}: readiness.state=${state || 'absent'} incompatible avec lifecycle ${entry.status}; attendu ${allowed.join(' ou ')}`);
      }
    }
  }
}

for (const row of comparison.destinations ?? []) {
  const entry = (catalog.trips ?? []).find(item => item.id === row.tripId);
  if (!entry) fail('data/destination-comparison.json', `${row.tripId}: absent du catalogue`);
  if (row.stage != null && row.stage !== 'longlist') {
    warn('data/destination-comparison.json', `${row.tripId}: stage est un champ legacy non autoritaire; seule data/catalog.json porte le lifecycle`);
  }
}

if (warnings.length) {
  console.log(`\nAvertissements lifecycle (${warnings.length})`);
  warnings.forEach(item => console.log(`- ${item}`));
}

if (errors.length) {
  console.error(`\nErreurs lifecycle (${errors.length})`);
  errors.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`\nValidation lifecycle OK: ${catalog.trips?.length ?? 0} dossier(s), contrat de maturité respecté.`);
