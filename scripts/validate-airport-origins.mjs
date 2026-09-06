import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const file = 'data/airport-access/reims-airports.json';
const data = JSON.parse(await readFile(resolve(root, file), 'utf8'));
const errors = [];
const fail = message => errors.push(`${file}: ${message}`);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value);
const statuses = new Set(['confirmed','observed','estimated','hypothesis','to_recheck','research']);
const confidences = new Set(['high','medium','low']);
const requiredCodes = new Set(['CDG','ORY','BRU','LUX','AMS','FRA']);

if (!data.origin?.label) fail('origin.label manquant');
if (!validDate(data.checkedAt)) fail('checkedAt doit être YYYY-MM-DD');
if (!Array.isArray(data.airports)) fail('airports doit être un tableau');

const seen = new Set();
for (const airport of data.airports ?? []) {
  const code = airport.code || '???';
  if (!requiredCodes.has(code)) fail(`${code}: code non prévu dans la base Reims`);
  if (seen.has(code)) fail(`${code}: aéroport dupliqué`);
  seen.add(code);
  if (!airport.name) fail(`${code}: name manquant`);
  if (!Array.isArray(airport.accessModes) || !airport.accessModes.length) fail(`${code}: aucun mode d'accès`);

  const modeIds = new Set();
  for (const mode of airport.accessModes ?? []) {
    if (!mode.id) { fail(`${code}: mode sans id`); continue; }
    if (modeIds.has(mode.id)) fail(`${code}: mode ${mode.id} dupliqué`);
    modeIds.add(mode.id);
    if (!mode.mode) fail(`${code}/${mode.id}: libellé mode manquant`);
    if (!finiteNumber(mode.durationMin) || mode.durationMin <= 0) fail(`${code}/${mode.id}: durationMin invalide`);
    if (mode.durationRangeMin != null) {
      const { low, high } = mode.durationRangeMin || {};
      if (!finiteNumber(low) || !finiteNumber(high) || low <= 0 || high < low) fail(`${code}/${mode.id}: durationRangeMin invalide`);
      else if (finiteNumber(mode.durationMin) && (mode.durationMin < low || mode.durationMin > high)) fail(`${code}/${mode.id}: durationMin hors durationRangeMin`);
    }
    if (mode.id === 'car' && (!finiteNumber(mode.distanceKm) || mode.distanceKm <= 0)) fail(`${code}/car: distanceKm invalide`);
    if (!statuses.has(mode.status)) fail(`${code}/${mode.id}: status inconnu ${mode.status}`);
    if (!validDate(mode.checkedAt)) fail(`${code}/${mode.id}: checkedAt invalide`);
    if (!confidences.has(mode.confidence)) fail(`${code}/${mode.id}: confidence invalide ${mode.confidence}`);
    if (typeof mode.source !== 'string' || !/^https:\/\//.test(mode.source)) fail(`${code}/${mode.id}: source HTTPS manquante`);
    for (const [costKey, value] of Object.entries(mode.costs ?? {})) {
      if (!(value === 'to_recheck' || (finiteNumber(value) && value >= 0))) fail(`${code}/${mode.id}: coût ${costKey} invalide`);
    }
  }
  if (!modeIds.has('car')) fail(`${code}: benchmark voiture manquant`);
  if (!modeIds.has('rail')) fail(`${code}: benchmark rail manquant`);
}

for (const code of requiredCodes) if (!seen.has(code)) fail(`${code}: aéroport requis absent`);

if (errors.length) {
  console.error(`\nErreurs accès aéroports (${errors.length})`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`\nValidation accès Reims OK: ${seen.size} aéroports.`);
