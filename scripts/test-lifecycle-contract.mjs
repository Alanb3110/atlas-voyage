import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  canTransitionLifecycle,
  tripDetailAvailable
} from '../assets/js/lifecycle-contract.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const failures = [];
let passed = 0;

function fail(label, message, output = '') {
  failures.push({ label, message, output: output.trim() });
}

function check(label, condition, message = 'condition non satisfaite') {
  if (!condition) fail(label, message);
  else {
    passed += 1;
    console.log(`✓ ${label}`);
  }
}

function runValidator(sandboxRoot, validator) {
  return spawnSync(process.execPath, [resolve(sandboxRoot, validator)], {
    cwd: sandboxRoot,
    encoding: 'utf8',
    env: process.env
  });
}

async function mutateJson(sandboxRoot, file, mutate) {
  const path = resolve(sandboxRoot, file);
  const data = JSON.parse(await readFile(path, 'utf8'));
  mutate(data);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function expectAccepts(sandboxRoot, { label, validator, mutations }) {
  const backups = new Map();
  try {
    for (const { file, mutate } of mutations) {
      const path = resolve(sandboxRoot, file);
      backups.set(path, await readFile(path, 'utf8'));
      await mutateJson(sandboxRoot, file, mutate);
    }
    const result = runValidator(sandboxRoot, validator);
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (result.error) fail(label, `validator non exécutable: ${result.error.message}`, output);
    else if (result.status !== 0) fail(label, 'mutation valide rejetée', output);
    else {
      passed += 1;
      console.log(`✓ ${label}`);
    }
  } finally {
    for (const [path, content] of backups) await writeFile(path, content, 'utf8');
  }
}

async function expectRejects(sandboxRoot, { label, validator, file, expected, mutate }) {
  const path = resolve(sandboxRoot, file);
  const original = await readFile(path, 'utf8');
  try {
    await mutateJson(sandboxRoot, file, mutate);
    const result = runValidator(sandboxRoot, validator);
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (result.error) fail(label, `validator non exécutable: ${result.error.message}`, output);
    else if (result.status === 0) fail(label, 'mutation invalide acceptée', output);
    else if (!output.includes(expected)) fail(label, `diagnostic attendu absent: ${expected}`, output);
    else {
      passed += 1;
      console.log(`✓ ${label}`);
    }
  } finally {
    await writeFile(path, original, 'utf8');
  }
}

for (const [from, to] of [
  ['longlist', 'shortlist'],
  ['shortlist', 'longlist'],
  ['shortlist', 'selected'],
  ['selected', 'detailed'],
  ['detailed', 'bookable'],
  ['bookable', 'booked'],
  ['booked', 'bookable'],
  ['detailed', 'archived'],
  ['archived', 'longlist']
]) {
  check(`transition autorisée: ${from} → ${to}`, canTransitionLifecycle(from, to));
}

for (const [from, to] of [
  ['longlist', 'selected'],
  ['shortlist', 'detailed'],
  ['selected', 'bookable'],
  ['longlist', 'booked'],
  ['archived', 'detailed']
]) {
  check(`transition refusée: ${from} → ${to}`, !canTransitionLifecycle(from, to));
}

check(
  'renderer détaillé: dataFile seul ne suffit pas',
  !tripDetailAvailable({ id: 'x', dataFile: 'data/trips/x.json' })
);
check(
  'renderer détaillé: dataFile + defaults rendent le dossier ouvrable',
  tripDetailAvailable({ id: 'x', dataFile: 'data/trips/x.json', defaultVariant: 'balanced', defaultBudget: 'comfort' })
);

const sandboxRoot = await mkdtemp(resolve(tmpdir(), 'atlas-voyage-lifecycle-'));
try {
  await cp(resolve(root, 'data'), resolve(sandboxRoot, 'data'), { recursive: true });
  await cp(resolve(root, 'assets/js/lifecycle-contract.js'), resolve(sandboxRoot, 'assets/js/lifecycle-contract.js'), { recursive: true });
  await cp(resolve(root, 'scripts/validate-lifecycle.mjs'), resolve(sandboxRoot, 'scripts/validate-lifecycle.mjs'), { recursive: true });
  await cp(resolve(root, 'scripts/validate-data.mjs'), resolve(sandboxRoot, 'scripts/validate-data.mjs'), { recursive: true });

  await expectAccepts(sandboxRoot, {
    label: 'longlist: aucun faux dossier détaillé requis',
    validator: 'scripts/validate-lifecycle.mjs',
    mutations: [{
      file: 'data/catalog.json',
      mutate: data => {
        const trip = data.trips.find(item => item.id === 'australia-queensland-nov-2026');
        delete trip.dataFile;
        delete trip.defaultVariant;
        delete trip.defaultBudget;
        delete trip.variantCount;
      }
    }]
  });

  await expectAccepts(sandboxRoot, {
    label: 'validate-data: longlist sans dataFile reste valide',
    validator: 'scripts/validate-data.mjs',
    mutations: [{
      file: 'data/catalog.json',
      mutate: data => {
        const trip = data.trips.find(item => item.id === 'australia-queensland-nov-2026');
        delete trip.dataFile;
        delete trip.defaultVariant;
        delete trip.defaultBudget;
        delete trip.variantCount;
      }
    }]
  });

  await expectAccepts(sandboxRoot, {
    label: 'selected: shortlist promue sans faux itinéraire détaillé',
    validator: 'scripts/validate-lifecycle.mjs',
    mutations: [{
      file: 'data/catalog.json',
      mutate: data => {
        const trip = data.trips.find(item => item.id === 'seychelles-nov-2026');
        trip.status = 'selected';
        delete trip.dataFile;
        delete trip.defaultVariant;
        delete trip.defaultBudget;
        delete trip.variantCount;
      }
    }]
  });

  await expectRejects(sandboxRoot, {
    label: 'detailed: dataFile devient obligatoire',
    validator: 'scripts/validate-lifecycle.mjs',
    file: 'data/catalog.json',
    expected: 'dataFile obligatoire au statut detailed',
    mutate: data => {
      const trip = data.trips.find(item => item.id === 'komodo-flores-nov-2026');
      delete trip.dataFile;
    }
  });

  await expectRejects(sandboxRoot, {
    label: 'shortlist: recherche marché obligatoire',
    validator: 'scripts/validate-lifecycle.mjs',
    file: 'data/shortlist-market-scan.json',
    expected: 'seychelles-nov-2026: recherche marché requise au statut shortlist',
    mutate: data => {
      data.destinations = data.destinations.filter(item => item.tripId !== 'seychelles-nov-2026');
    }
  });

  await expectRejects(sandboxRoot, {
    label: 'bookable: readiness booking_ready obligatoire',
    validator: 'scripts/validate-lifecycle.mjs',
    file: 'data/catalog.json',
    expected: 'readiness.state=blocked incompatible avec lifecycle bookable',
    mutate: data => {
      data.trips.find(item => item.id === 'komodo-flores-nov-2026').status = 'bookable';
    }
  });
} finally {
  await rm(sandboxRoot, { recursive: true, force: true });
}

const rendererFiles = [
  ['assets/js/home.js', 'tripDetailAvailable'],
  ['assets/js/destination-compare.js', 'tripDetailAvailable'],
  ['assets/js/trip.js', 'tripDetailAvailable'],
  ['assets/js/booking-readiness.js', 'requiresBookingReadiness']
];

for (const [file, marker] of rendererFiles) {
  const source = await readFile(resolve(root, file), 'utf8');
  check(`renderer lifecycle: ${file}`, source.includes(marker), `marqueur absent: ${marker}`);
}

if (failures.length) {
  console.error(`\nÉchecs lifecycle (${failures.length})`);
  for (const item of failures) {
    console.error(`\n- ${item.label}: ${item.message}`);
    if (item.output) console.error(item.output);
  }
  process.exit(1);
}

console.log(`\nRégressions lifecycle OK: ${passed} contrôles.`);
