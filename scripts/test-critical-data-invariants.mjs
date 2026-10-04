import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const failures = [];
let passed = 0;

function check(condition, label, detail = '') {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function unique(values) {
  return new Set(values).size === values.length;
}

const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog.json'), 'utf8'));
const dataFiles = catalog.trips.map(entry => entry.dataFile);
check(unique(dataFiles), 'catalogue: chaque voyage référence un fichier de données distinct');

for (const entry of catalog.trips) {
  const file = resolve(root, entry.dataFile);
  const trip = JSON.parse(await readFile(file, 'utf8'));
  const variants = Array.isArray(trip.variants) ? trip.variants : [];
  const budgets = Array.isArray(trip.budgets) ? trip.budgets : [];
  const variantIds = variants.map(item => item.id);
  const budgetIds = budgets.map(item => item.id);
  const expectedBudgets = ['essential', 'comfort', 'premium'];

  check(entry.dataFile.startsWith('data/trips/'), `${entry.id}: dataFile reste dans data/trips/`, entry.dataFile);
  check(trip.id === entry.id, `${entry.id}: identité catalogue ↔ voyage cohérente`, `trip.id=${trip.id}`);
  check(unique(variantIds), `${entry.id}: ids de variantes uniques`, variantIds.join(', '));
  check(unique(budgetIds), `${entry.id}: ids de budgets uniques`, budgetIds.join(', '));
  check(entry.variantCount === variants.length, `${entry.id}: variantCount reflète les données`, `${entry.variantCount} ≠ ${variants.length}`);
  check(variantIds.includes(entry.defaultVariant), `${entry.id}: defaultVariant du catalogue existe`, entry.defaultVariant);
  check(budgetIds.includes(entry.defaultBudget), `${entry.id}: defaultBudget du catalogue existe`, entry.defaultBudget);
  check(trip.defaultVariant === entry.defaultVariant, `${entry.id}: defaultVariant catalogue ↔ voyage identique`, `${entry.defaultVariant} ≠ ${trip.defaultVariant}`);
  check(trip.defaultBudget === entry.defaultBudget, `${entry.id}: defaultBudget catalogue ↔ voyage identique`, `${entry.defaultBudget} ≠ ${trip.defaultBudget}`);
  check(expectedBudgets.every(id => budgetIds.includes(id)) && budgetIds.length === expectedBudgets.length,
    `${entry.id}: trois gammes de budget contractuelles présentes`, budgetIds.join(', '));
}

if (failures.length) {
  console.error(`\nÉchecs invariants critiques (${failures.length})`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validation invariants critiques OK: ${passed} contrôles.`);
