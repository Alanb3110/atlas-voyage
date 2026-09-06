import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const failures = [];
let passed = 0;

function fail(label, message, output = '') {
  failures.push({ label, message, output: output.trim() });
}

async function expectValidatorRejects(sandboxRoot, { label, file, validator, expected, mutate }) {
  const absoluteFile = resolve(sandboxRoot, file);
  const original = await readFile(absoluteFile, 'utf8');
  let result;

  try {
    const data = JSON.parse(original);
    mutate(data);
    await writeFile(absoluteFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    result = spawnSync(process.execPath, [resolve(sandboxRoot, validator)], {
      cwd: sandboxRoot,
      encoding: 'utf8',
      env: process.env
    });
  } catch (error) {
    fail(label, `test impossible à exécuter: ${error.message}`);
    return;
  } finally {
    await writeFile(absoluteFile, original, 'utf8');
  }

  const output = `${result?.stdout || ''}\n${result?.stderr || ''}`;
  if (result?.error) {
    fail(label, `validator non exécutable: ${result.error.message}`, output);
    return;
  }
  if (result?.status === 0) {
    fail(label, 'la mutation invalide a été acceptée', output);
    return;
  }
  if (expected && !output.includes(expected)) {
    fail(label, `rejet obtenu, mais le diagnostic attendu est absent: ${expected}`, output);
    return;
  }

  passed += 1;
  console.log(`✓ ${label}`);
}

const cases = [
  {
    label: 'destination: comfortBudget.value=null est rejeté',
    file: 'data/destination-comparison.json',
    validator: 'scripts/validate-data.mjs',
    expected: 'comfortBudget: value invalide',
    mutate: data => { data.destinations[0].comfortBudget.value = null; }
  },
  {
    label: 'destination: chaîne numérique de budget est rejetée',
    file: 'data/destination-comparison.json',
    validator: 'scripts/validate-data.mjs',
    expected: 'comfortBudget: value invalide',
    mutate: data => { data.destinations[0].comfortBudget.value = '7900'; }
  },
  {
    label: 'destination: chaîne numérique de score est rejetée',
    file: 'data/destination-comparison.json',
    validator: 'scripts/validate-data.mjs',
    expected: 'score wildlife doit être entre 0 et 5',
    mutate: data => { data.destinations[0].scores.wildlife = '5'; }
  },
  {
    label: 'destination: chaîne blanche d’incertitude est rejetée',
    file: 'data/destination-comparison.json',
    validator: 'scripts/validate-data.mjs',
    expected: 'uncertaintyHalfWidth doit être entre 0 et 2',
    mutate: data => { data.destinations[0].uncertaintyHalfWidth = '   '; }
  },
  {
    label: 'destination: override d’incertitude null est rejeté',
    file: 'data/destination-comparison.json',
    validator: 'scripts/validate-destination-numeric-contract.mjs',
    expected: 'incertitude season doit être un nombre réel',
    mutate: data => { data.destinations[0].uncertaintyOverrides.season = null; }
  },
  {
    label: 'destination: override d’incertitude en chaîne est rejeté',
    file: 'data/destination-comparison.json',
    validator: 'scripts/validate-destination-numeric-contract.mjs',
    expected: 'incertitude season doit être un nombre réel',
    mutate: data => { data.destinations[0].uncertaintyOverrides.season = '0.5'; }
  },
  {
    label: 'destination: pondérations nulles ne fabriquent pas un score 0',
    file: 'data/destination-comparison.json',
    validator: 'scripts/validate-destination-numeric-contract.mjs',
    expected: 'somme des pondérations=0, attendu 100',
    mutate: data => {
      for (const key of Object.keys(data.weights)) data.weights[key] = 0;
    }
  },
  {
    label: 'budget détaillé: amount=null est rejeté',
    file: 'data/trips/south-africa-nov-2026.json',
    validator: 'scripts/validate-data.mjs',
    expected: 'poste 1 amount invalide',
    mutate: data => { data.budgets[0].breakdown[0].amount = null; }
  },
  {
    label: 'accès aéroport: durationMin=null est rejeté',
    file: 'data/airport-access/reims-airports.json',
    validator: 'scripts/validate-airport-origins.mjs',
    expected: 'CDG/car: durationMin invalide',
    mutate: data => { data.airports[0].accessModes[0].durationMin = null; }
  },
  {
    label: 'accès aéroport: chaîne numérique de distance est rejetée',
    file: 'data/airport-access/reims-airports.json',
    validator: 'scripts/validate-airport-origins.mjs',
    expected: 'CDG/car: distanceKm invalide',
    mutate: data => { data.airports[0].accessModes[0].distanceKm = '126.5'; }
  },
  {
    label: 'coûts terrestres: chaîne numérique de durée voyage est rejetée',
    file: 'data/airport-access/reims-ground-costs.json',
    validator: 'scripts/validate-ground-access-costs.mjs',
    expected: 'tripDurationDays invalide',
    mutate: data => { data.tripDurationDays = '20'; }
  },
  {
    label: 'coûts terrestres: borne carburant null est rejetée',
    file: 'data/airport-access/reims-ground-costs.json',
    validator: 'scripts/validate-ground-access-costs.mjs',
    expected: 'CDG: plage fuelEUR invalide',
    mutate: data => { data.airports[0].road.oneWay.fuelEUR.low = null; }
  },
  {
    label: 'scan marché: travelers en chaîne est rejeté',
    file: 'data/shortlist-market-scan.json',
    validator: 'scripts/validate-shortlist-market-scan.mjs',
    expected: 'travelers invalide',
    mutate: data => { data.travelers = '2'; }
  },
  {
    label: 'scan marché: price.value=null est rejeté',
    file: 'data/shortlist-market-scan.json',
    validator: 'scripts/validate-shortlist-market-scan.mjs',
    expected: 'sa-cdg-af-2026-11: price.value invalide',
    mutate: data => { data.destinations[0].observations[0].price.value = null; }
  },
  {
    label: 'géométrie shortlist: marge aéroport blanche est rejetée',
    file: 'data/shortlist-gateway-geometry.json',
    validator: 'scripts/validate-shortlist-gateway-geometry.mjs',
    expected: 'airportMarginMin.value invalide',
    mutate: data => { data.airportMarginMin.value = ''; }
  },
  {
    label: 'porte-à-porte: travelers=null est rejeté',
    file: 'data/shortlist-door-to-door.json',
    validator: 'scripts/validate-shortlist-door-to-door.mjs',
    expected: 'travelers doit valoir 2',
    mutate: data => { data.travelers = null; }
  },
  {
    label: 'porte-à-porte: durée partiellement transformée en chaîne est rejetée',
    file: 'data/shortlist-door-to-door.json',
    validator: 'scripts/validate-shortlist-door-to-door.mjs',
    expected: 'sa-cdg-openjaw/reims-cdg-rail: durée partiellement numérique',
    mutate: data => { data.scenarios[0].outbound.segments[0].durationMin.low = '85'; }
  }
];

const sandboxRoot = await mkdtemp(resolve(tmpdir(), 'atlas-voyage-regression-'));
try {
  await cp(resolve(root, 'data'), resolve(sandboxRoot, 'data'), { recursive: true });
  await cp(resolve(root, 'scripts'), resolve(sandboxRoot, 'scripts'), { recursive: true });
  await cp(resolve(root, 'assets/js'), resolve(sandboxRoot, 'assets/js'), { recursive: true });

  for (const testCase of cases) {
    await expectValidatorRejects(sandboxRoot, testCase);
  }
} finally {
  await rm(sandboxRoot, { recursive: true, force: true });
}

const rendererPaths = [
  'assets/js/destination-compare.js',
  'assets/js/destination-rank-robustness.js'
];
const forbiddenRendererPatterns = [
  'Number(row.scores',
  'Number(row.uncertaintyOverrides',
  'Number(row.uncertaintyHalfWidth)',
  'Number(weights[key])',
  'Number(currentWeights[key])',
  'Number(row.comfortBudget?.value) || 0',
  'Number(row.doorToDoor?.value) || 0',
  'Math.round(Number(mins) || 0)'
];

for (const rendererPath of rendererPaths) {
  const renderer = await readFile(resolve(root, rendererPath), 'utf8');
  if (!renderer.includes("assertDestinationComparisonNumericContract(data);")) {
    fail(`${rendererPath}: contrat numérique runtime`, 'le contrôle strict du dataset a disparu');
  } else {
    passed += 1;
    console.log(`✓ ${rendererPath}: contrat numérique runtime actif`);
  }

  for (const pattern of forbiddenRendererPatterns) {
    if (renderer.includes(pattern)) {
      fail(`${rendererPath}: absence de coercion silencieuse`, `pattern interdit retrouvé: ${pattern}`);
    } else {
      passed += 1;
      console.log(`✓ ${rendererPath}: sans pattern interdit ${pattern}`);
    }
  }
}

const mainRenderer = await readFile(resolve(root, 'assets/js/destination-compare.js'), 'utf8');
if (!mainRenderer.includes("return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;")) {
  fail('renderer destinations: garde numérique stricte', 'la garde traceableNumber attendue a disparu');
} else {
  passed += 1;
  console.log('✓ renderer conserve la garde numérique stricte');
}

if (failures.length) {
  console.error(`\nÉchecs de régression contradictoire (${failures.length})`);
  for (const item of failures) {
    console.error(`\n- ${item.label}: ${item.message}`);
    if (item.output) console.error(item.output);
  }
  process.exit(1);
}

console.log(`\nRégressions contradictoires OK: ${passed} contrôles.`);
