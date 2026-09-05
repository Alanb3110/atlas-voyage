import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const errors = [];
const warnings = [];
const allowed = new Set(['research','shortlisted','verified','booked','recheck','not_needed']);
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const fail = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

const catalog = await readJson('data/catalog.json');
for (const trip of catalog.trips ?? []) {
  const file = `data/booking-status/${trip.id}.json`;
  let data;
  try { data = await readJson(file); }
  catch (e) {
    warn(file, `suivi de réservation absent ou illisible: ${e.message}`);
    continue;
  }

  if (data.tripId !== trip.id) fail(file, `tripId (${data.tripId}) différent du catalogue (${trip.id})`);
  if (!Array.isArray(data.items) || !data.items.length) warn(file, 'aucun élément de préparation');
  for (const [i, item] of (data.items ?? []).entries()) {
    const label = item.label || `élément ${i + 1}`;
    if (!item.label) fail(file, `élément ${i + 1}: label manquant`);
    if (!item.category) warn(file, `${label}: catégorie manquante`);
    if (!allowed.has(item.status)) fail(file, `${label}: statut inconnu ${item.status}`);
    if (item.checkedAt && !/^\d{4}-\d{2}-\d{2}$/.test(item.checkedAt)) fail(file, `${label}: checkedAt doit être YYYY-MM-DD`);
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
console.log(`\nValidation réservation OK: ${catalog.trips?.length ?? 0} voyage(s).`);
