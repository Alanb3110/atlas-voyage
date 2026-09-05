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
const validCoord = c => Array.isArray(c) && c.length === 2 && Number.isFinite(Number(c[0])) && Number.isFinite(Number(c[1])) && Math.abs(Number(c[0])) <= 90 && Math.abs(Number(c[1])) <= 180;

const catalog = await readJson('data/catalog.json');
const ids = new Set();
for (const entry of catalog.trips ?? []) {
  if (!entry.id) { fail('data/catalog.json', 'voyage sans id'); continue; }
  if (ids.has(entry.id)) fail('data/catalog.json', `id dupliqué: ${entry.id}`);
  ids.add(entry.id);
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
    if (!Number.isFinite(Number(budget.total))) fail(file, `budget ${budget.id}: total non numérique`);
    const rows = budget.breakdown ?? [];
    if (rows.length) {
      const sum = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
      if (Math.abs(sum - Number(budget.total)) > 1) fail(file, `budget ${budget.id}: somme des postes ${sum} ≠ total ${budget.total}`);
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
