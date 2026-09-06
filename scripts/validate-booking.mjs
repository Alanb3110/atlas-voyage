import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const errors = [];
const warnings = [];
const allowed = new Set(['research','shortlisted','verified','booked','recheck','not_needed']);
const readinessStates = new Set(['blocked','decision_ready','booking_ready','booked']);
const mandatoryReadinessRefs = new Set([
  'data/shortlist-market-scan.json',
  'data/shortlist-gateway-geometry.json',
  'data/shortlist-door-to-door.json'
]);
const lifecycleNeedsReadiness = new Set(['shortlist','selected','detailed','bookable','booked']);
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const fail = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

const catalog = await readJson('data/catalog.json');
for (const trip of catalog.trips ?? []) {
  const file = `data/booking-status/${trip.id}.json`;
  let data;
  try { data = await readJson(file); }
  catch (e) {
    if (lifecycleNeedsReadiness.has(trip.status)) fail(file, `suivi de préparation obligatoire au statut ${trip.status}: ${e.message}`);
    else warn(file, `suivi de réservation absent ou illisible: ${e.message}`);
    continue;
  }

  if (data.tripId !== trip.id) fail(file, `tripId (${data.tripId}) différent du catalogue (${trip.id})`);
  if (!Array.isArray(data.items) || !data.items.length) warn(file, 'aucun élément de préparation');

  const itemIds = new Set();
  const activeBlockingIds = new Set();
  for (const [i, item] of (data.items ?? []).entries()) {
    const label = item.label || `élément ${i + 1}`;
    if (!item.label) fail(file, `élément ${i + 1}: label manquant`);
    if (!item.category) warn(file, `${label}: catégorie manquante`);
    if (!allowed.has(item.status)) fail(file, `${label}: statut inconnu ${item.status}`);
    if (item.checkedAt && !validDate(item.checkedAt)) fail(file, `${label}: checkedAt doit être YYYY-MM-DD`);
    if (data.schemaVersion >= 2) {
      if (!item.id) fail(file, `${label}: id obligatoire en schemaVersion 2`);
      if (item.id && itemIds.has(item.id)) fail(file, `${item.id}: id dupliqué`);
      if (item.id) itemIds.add(item.id);
      if (typeof item.blocking !== 'boolean') fail(file, `${label}: blocking doit être booléen en schemaVersion 2`);
      if (item.blocking && !['verified','booked','not_needed'].includes(item.status) && item.id) activeBlockingIds.add(item.id);
    }
  }

  if (lifecycleNeedsReadiness.has(trip.status)) {
    if (data.schemaVersion !== 2) fail(file, `schemaVersion 2 obligatoire au statut ${trip.status}`);
    if (!validDate(data.checkedAt)) fail(file, 'checkedAt racine obligatoire en YYYY-MM-DD');
    if (!data.intro || typeof data.intro !== 'string') fail(file, 'intro obligatoire');
    if (!data.readiness || typeof data.readiness !== 'object') {
      fail(file, 'readiness obligatoire');
    } else {
      if (!readinessStates.has(data.readiness.state)) fail(file, `readiness.state invalide ${data.readiness.state}`);
      if (!data.readiness.nextAction || typeof data.readiness.nextAction !== 'string') fail(file, 'readiness.nextAction obligatoire');
      if (!Array.isArray(data.readiness.blockerIds)) fail(file, 'readiness.blockerIds doit être un tableau');
      else {
        const declared = new Set(data.readiness.blockerIds);
        if (declared.size !== data.readiness.blockerIds.length) fail(file, 'readiness.blockerIds contient des doublons');
        for (const id of declared) if (!itemIds.has(id)) fail(file, `readiness blocker inconnu ${id}`);
        for (const id of activeBlockingIds) if (!declared.has(id)) fail(file, `bloqueur actif absent de readiness.blockerIds: ${id}`);
        for (const id of declared) if (!activeBlockingIds.has(id)) fail(file, `readiness.blockerIds contient un item non bloquant ou déjà fermé: ${id}`);
        if (data.readiness.state === 'blocked' && declared.size === 0) fail(file, 'readiness.state=blocked exige au moins un bloqueur');
        if (['decision_ready','booking_ready','booked'].includes(data.readiness.state) && declared.size > 0) fail(file, `readiness.state=${data.readiness.state} incompatible avec des bloqueurs actifs`);
      }
      if (data.readiness.state === 'booked' && trip.status !== 'booked') fail(file, 'readiness.state=booked exige lifecycle booked');
      if (trip.status === 'booked' && data.readiness.state !== 'booked') fail(file, 'lifecycle booked exige readiness.state=booked');
    }

    if (!Array.isArray(data.references)) fail(file, 'references obligatoire');
    else {
      const refs = new Set(data.references);
      for (const ref of mandatoryReadinessRefs) if (!refs.has(ref)) fail(file, `reference de readiness manquante: ${ref}`);
      const ownTripRef = trip.dataFile;
      if (!refs.has(ownTripRef)) fail(file, `reference du voyage manquante: ${ownTripRef}`);
    }
  }
}

if (warnings.length) {
  console.log(`\nAvertissements réservation (${warnings.length})`);
  warnings.forEach(x => console.log(`- ${x}`));
}
if (errors.length) {
  console.error(`\nErreurs réservation (${errors.length})`);
  errors.forEach(x => console.error(`- ${x}`));
  process.exit(1);
}
console.log(`\nValidation réservation OK: ${catalog.trips?.length ?? 0} voyage(s), readiness structurée pour les statuts shortlist+.`);
