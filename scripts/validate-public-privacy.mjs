import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const errors = [];
const fail = message => errors.push(message);

const blockedPaths = [
  'private',
  'secrets',
  'data/private',
  'data/personal',
  'data/reservations',
  'data/tickets',
  'data/documents'
];

const forbiddenKeys = new Set([
  'pnr',
  'recordlocator',
  'bookingreference',
  'bookingref',
  'reservationreference',
  'reservationref',
  'confirmationcode',
  'confirmationnumber',
  'ticketnumber',
  'eticketnumber',
  'passportnumber',
  'passportexpiry',
  'passportissuedate',
  'nationalidnumber',
  'identitynumber',
  'dateofbirth',
  'birthdate',
  'cardnumber',
  'creditcardnumber',
  'cvv',
  'cvc',
  'insurancepolicynumber',
  'policynumber',
  'claimnumber',
  'frequentflyernumber',
  'loyaltynumber',
  'personalemail',
  'personalphone',
  'homeaddress',
  'emergencycontact'
]);

const normalizeKey = key => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');

async function exists(path) {
  try { await stat(path); return true; }
  catch { return false; }
}

async function hasFiles(path) {
  if (!(await exists(path))) return false;
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(path, entry.name);
    if (entry.isFile()) return true;
    if (entry.isDirectory() && await hasFiles(full)) return true;
  }
  return false;
}

for (const blocked of blockedPaths) {
  const full = resolve(root, blocked);
  if (await hasFiles(full)) fail(`${blocked}: contenu privé interdit dans le dépôt public`);
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function scanObject(value, file, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanObject(item, file, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (forbiddenKeys.has(normalized)) {
      fail(`${file}: champ sensible interdit ${path}.${key}`);
    }
    scanObject(child, file, `${path}.${key}`);
  }
}

const dataDir = resolve(root, 'data');
if (await exists(dataDir)) {
  const jsonFiles = (await walk(dataDir)).filter(file => extname(file).toLowerCase() === '.json');
  for (const full of jsonFiles) {
    const file = relative(root, full).replaceAll('\\', '/');
    let parsed;
    try {
      parsed = JSON.parse(await readFile(full, 'utf8'));
    } catch (error) {
      fail(`${file}: JSON illisible (${error.message})`);
      continue;
    }
    scanObject(parsed, file);
  }
}

const gitignore = await readFile(resolve(root, '.gitignore'), 'utf8');
for (const required of ['.env', '*.local.json', '*.private.json', 'data/private/', 'data/personal/', 'data/reservations/', 'data/tickets/', 'data/documents/']) {
  if (!gitignore.split(/\r?\n/).includes(required)) fail(`.gitignore: règle manquante ${required}`);
}

if (errors.length) {
  console.error(`\nErreurs confidentialité dépôt public (${errors.length})`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log('\nValidation confidentialité OK: aucun champ de réservation/identité interdit dans data/*.json et chemins privés ignorés.');
