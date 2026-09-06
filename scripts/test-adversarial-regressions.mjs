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
    label: 'accès aéroport: plage de durée incohérente est rejetée',
    file: 'data/airport-access/reims-airports.json',
    validator: 'scripts/validate-airport-origins.mjs',
    expected: 'BRU/rail: durationRangeMin invalide',
    mutate: data => {
      const bru = data.airports.find(airport => airport.code === 'BRU');
      const rail = bru.accessModes.find(mode => mode.id === 'rail');
      rail.durationRangeMin = { low: 300, high: 200 };
    }
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
    label: 'scan marché: tarif nearby candidat budget est rejeté',
    file: 'data/shortlist-market-scan.json',
    validator: 'scripts/validate-shortlist-market-scan.mjs',
    expected: 'budgetUse incompatible avec dateMatch=nearby',
    mutate: data => { data.destinations[0].observations[0].budgetUse = 'exact_budget_candidate'; }
  },
  {
    label: 'scan marché: retour antérieur au départ est rejeté',
    file: 'data/shortlist-market-scan.json',
    validator: 'scripts/validate-shortlist-market-scan.mjs',
    expected: 'observedDates ordre invalide',
    mutate: data => {
      data.destinations[0].observations[0].observedDates = { departure: '2026-11-26', return: '2026-11-05' };
    }
  },
  {
    label: 'scan marché: stops en chaîne est rejeté',
    file: 'data/shortlist-market-scan.json',
    validator: 'scripts/validate-shortlist-market-scan.mjs',
    expected: 'stops invalide',
    mutate: data => { data.destinations[0].observations[0].stops = '0'; }
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
  },
  {
    label: 'porte-à-porte: durée BRU désynchronisée de la base aéroport est rejetée',
    file: 'data/shortlist-door-to-door.json',
    validator: 'scripts/validate-shortlist-door-to-door.mjs',
    expected: 'sey-bru-sez-pri/reims-bru-rail: durée ground_access désynchronisée de BRU',
    mutate: data => {
      const scenario = data.scenarios.find(item => item.id === 'sey-bru-sez-pri');
      scenario.outbound.segments.find(item => item.id === 'reims-bru-rail').durationMin = { low: 187, high: 187, status: 'estimated' };
    }
  },
  {
    label: 'porte-à-porte: tarif FRA désynchronisé du scan marché est rejeté',
    file: 'data/shortlist-door-to-door.json',
    validator: 'scripts/validate-shortlist-door-to-door.mjs',
    expected: 'komodo-fra-dps-ubud/international-airfare: partyValueEUR désynchronisé du scan marché',
    mutate: data => {
      const scenario = data.scenarios.find(item => item.id === 'komodo-fra-dps-ubud');
      scenario.costs.find(item => item.id === 'international-airfare').partyValueEUR = 1390;
    }
  },
  {
    label: 'porte-à-porte: budgetUse désynchronisé du scan marché est rejeté',
    file: 'data/shortlist-door-to-door.json',
    validator: 'scripts/validate-shortlist-door-to-door.mjs',
    expected: 'sey-cdg-sez-pri/international-airfare: budgetUse désynchronisé du scan marché',
    mutate: data => {
      const scenario = data.scenarios.find(item => item.id === 'sey-cdg-sez-pri');
      scenario.costs.find(item => item.id === 'international-airfare').budgetUse = 'exact_budget_candidate';
    }
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

const marketRenderer = await readFile(resolve(root, 'assets/js/shortlist-market-scan.js'), 'utf8');
if (!marketRenderer.includes("const status = strictDates ? paretoStatus(fareDeltaParty, extraRailRoundTripMin, stopDelta) : 'non_strict';")) {
  fail('renderer marché: dominance réservée aux dates exactes', 'la garde non_strict attendue a disparu');
} else {
  passed += 1;
  console.log('✓ renderer marché: aucune dominance sur dates non strictes');
}

const doorRenderer = await readFile(resolve(root, 'assets/js/shortlist-door-to-door.js'), 'utf8');
for (const pattern of ['Number(cost.partyValueEUR)', 'Number(cost.valueEUR)', 'Number(duration.value)', 'Math.round(Number(minutes) || 0)']) {
  if (doorRenderer.includes(pattern)) {
    fail('renderer porte-à-porte: absence de coercion silencieuse', `pattern interdit retrouvé: ${pattern}`);
  } else {
    passed += 1;
    console.log(`✓ renderer porte-à-porte: sans pattern interdit ${pattern}`);
  }
}
if (!doorRenderer.includes('Signaux chiffrés non stricts')) {
  fail('renderer porte-à-porte: séparation signaux/budget', 'le libellé de séparation des signaux non stricts a disparu');
} else {
  passed += 1;
  console.log('✓ renderer porte-à-porte: signaux non stricts séparés du budget');
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
