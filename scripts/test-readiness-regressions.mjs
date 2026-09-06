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

async function expectRejects(sandboxRoot, { label, file, expected, mutate }) {
  const path = resolve(sandboxRoot, file);
  const original = await readFile(path, 'utf8');
  try {
    const data = JSON.parse(original);
    mutate(data);
    await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    const result = spawnSync(process.execPath, [resolve(sandboxRoot, 'scripts/validate-booking.mjs')], {
      cwd: sandboxRoot,
      encoding: 'utf8',
      env: process.env
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (result.error) fail(label, `validator non exécutable: ${result.error.message}`, output);
    else if (result.status === 0) fail(label, 'la mutation invalide a été acceptée', output);
    else if (!output.includes(expected)) fail(label, `diagnostic attendu absent: ${expected}`, output);
    else {
      passed += 1;
      console.log(`✓ ${label}`);
    }
  } finally {
    await writeFile(path, original, 'utf8');
  }
}

const sandboxRoot = await mkdtemp(resolve(tmpdir(), 'atlas-voyage-readiness-'));
try {
  await cp(resolve(root, 'data/catalog.json'), resolve(sandboxRoot, 'data/catalog.json'), { recursive: true });
  await cp(resolve(root, 'data/booking-status'), resolve(sandboxRoot, 'data/booking-status'), { recursive: true });
  await cp(resolve(root, 'scripts/validate-booking.mjs'), resolve(sandboxRoot, 'scripts/validate-booking.mjs'), { recursive: true });

  await expectRejects(sandboxRoot, {
    label: 'readiness shortlist: schema v1 est rejeté',
    file: 'data/booking-status/seychelles-nov-2026.json',
    expected: 'schemaVersion 2 obligatoire au statut shortlist',
    mutate: data => { data.schemaVersion = 1; }
  });

  await expectRejects(sandboxRoot, {
    label: 'readiness shortlist: bloqueur actif oublié est rejeté',
    file: 'data/booking-status/south-africa-nov-2026.json',
    expected: 'bloqueur actif absent de readiness.blockerIds: exact-openjaw-flight',
    mutate: data => {
      data.readiness.blockerIds = data.readiness.blockerIds.filter(id => id !== 'exact-openjaw-flight');
    }
  });

  await expectRejects(sandboxRoot, {
    label: 'readiness shortlist: booking_ready avec bloqueurs est rejeté',
    file: 'data/booking-status/komodo-flores-nov-2026.json',
    expected: 'readiness.state=booking_ready incompatible avec des bloqueurs actifs',
    mutate: data => { data.readiness.state = 'booking_ready'; }
  });

  await expectRejects(sandboxRoot, {
    label: 'readiness shortlist: checkedAt racine absent est rejeté',
    file: 'data/booking-status/seychelles-nov-2026.json',
    expected: 'checkedAt racine obligatoire en YYYY-MM-DD',
    mutate: data => { delete data.checkedAt; }
  });
} finally {
  await rm(sandboxRoot, { recursive: true, force: true });
}

const renderer = await readFile(resolve(root, 'assets/js/booking-readiness.js'), 'utf8');
for (const marker of ['Pas encore réservable', 'Prochaine action :', 'Bloquant', 'data.checkedAt || data.updatedAt']) {
  if (!renderer.includes(marker)) fail('renderer readiness: contrat v2 visible', `marqueur absent: ${marker}`);
  else {
    passed += 1;
    console.log(`✓ renderer readiness contient: ${marker}`);
  }
}

if (failures.length) {
  console.error(`\nÉchecs readiness (${failures.length})`);
  for (const item of failures) {
    console.error(`\n- ${item.label}: ${item.message}`);
    if (item.output) console.error(item.output);
  }
  process.exit(1);
}

console.log(`\nRégressions readiness OK: ${passed} contrôles.`);
