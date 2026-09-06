import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const evidenceFile = 'data/longlist-evidence.json';
const catalogFile = 'data/catalog.json';
const data = JSON.parse(await readFile(resolve(root, evidenceFile), 'utf8'));
const catalog = JSON.parse(await readFile(resolve(root, catalogFile), 'utf8'));
const errors = [];
const warnings = [];
const fail = msg => errors.push(`${evidenceFile}: ${msg}`);
const warn = msg => warnings.push(`${evidenceFile}: ${msg}`);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const statuses = new Set(['verified','supported','to_recheck','unresolved']);
const confidences = new Set(['high','medium','low']);
const evidenceGrades = new Set(['A','B','C','D']);
const dimensions = ['season','wildlife','safety','formalities','health'];
const activeResearchStages = new Set(['longlist','shortlist','selected','detailed','bookable','booked']);

if (!validDate(data.checkedAt)) fail('checkedAt doit être YYYY-MM-DD');
if (!data.wildlifeCaveat) fail('wildlifeCaveat manquant');
if (!Array.isArray(data.destinations)) fail('destinations doit être un tableau');

// This registry was born at longlist stage but remains the common evidence base as
// a candidate matures. Archived demo dossiers are intentionally excluded.
const expected = new Set((catalog.trips ?? []).filter(t => activeResearchStages.has(t.status)).map(t => t.id));
const seen = new Set();

for (const [index, destination] of (data.destinations ?? []).entries()) {
  const id = destination.tripId || `destination ${index + 1}`;
  if (!destination.tripId) { fail(`${id}: tripId manquant`); continue; }
  if (seen.has(destination.tripId)) fail(`${id}: tripId dupliqué`);
  seen.add(destination.tripId);
  if (!expected.has(destination.tripId)) fail(`${id}: absent des candidates actives du catalogue`);
  if (!evidenceGrades.has(destination.evidenceConfidence)) fail(`${id}: evidenceConfidence doit être A, B, C ou D`);

  for (const dimension of dimensions) {
    const item = destination.dimensions?.[dimension];
    if (!item) { fail(`${id}: dimension ${dimension} manquante`); continue; }
    if (!statuses.has(item.status)) fail(`${id}/${dimension}: status inconnu ${item.status}`);
    if (!confidences.has(item.confidence)) fail(`${id}/${dimension}: confidence invalide ${item.confidence}`);
    if (!item.summary || typeof item.summary !== 'string') fail(`${id}/${dimension}: summary manquant`);
    if (!Array.isArray(item.sources) || !item.sources.length) fail(`${id}/${dimension}: aucune source`);
    for (const [sourceIndex, source] of (item.sources ?? []).entries()) {
      const prefix = `${id}/${dimension}/source ${sourceIndex + 1}`;
      if (!source.label) fail(`${prefix}: label manquant`);
      if (!source.type) fail(`${prefix}: type manquant`);
      if (!/^https:\/\//.test(source.url || '')) fail(`${prefix}: URL HTTPS manquante`);
      if (!validDate(source.checkedAt)) fail(`${prefix}: checkedAt invalide`);
    }
  }

  for (const [recheckIndex, recheck] of (destination.recheck ?? []).entries()) {
    const prefix = `${id}/recheck ${recheckIndex + 1}`;
    if (!recheck.topic) fail(`${prefix}: topic manquant`);
    if (!validDate(recheck.by)) fail(`${prefix}: by doit être YYYY-MM-DD`);
    if (!recheck.reason) fail(`${prefix}: reason manquante`);
  }

  if (destination.dimensions?.wildlife?.status === 'verified') {
    warn(`${id}: wildlife est marqué verified ; préférer supported sauf fait strictement déterministe`);
  }
}

for (const id of expected) if (!seen.has(id)) fail(`${id}: dossier de preuve candidate absent`);
for (const id of seen) if (!expected.has(id)) fail(`${id}: dossier de preuve sans candidate active`);

if (warnings.length) {
  console.log(`\nAvertissements preuves candidates (${warnings.length})`);
  warnings.forEach(w => console.log(`- ${w}`));
}
if (errors.length) {
  console.error(`\nErreurs preuves candidates (${errors.length})`);
  errors.forEach(e => console.error(`- ${e}`));
  process.exit(1);
}
console.log(`\nValidation preuves candidates OK: ${seen.size}/${expected.size} destinations actives, ${dimensions.length} dimensions chacune.`);
