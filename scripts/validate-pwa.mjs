import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const errors = [];
const fail = message => errors.push(message);

const manifestPath = resolve(root, 'manifest.webmanifest');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.id !== './') fail(`manifest: id inattendu (${manifest.id})`);
if (manifest.start_url !== './index.html') fail(`manifest: start_url inattendu (${manifest.start_url})`);
if (manifest.scope !== './') fail(`manifest: scope inattendu (${manifest.scope})`);
if (manifest.display !== 'standalone') fail(`manifest: display inattendu (${manifest.display})`);

const expectedIcons = new Map([
  ['192x192', { path: './assets/icons/icon-192.png', width: 192, height: 192 }],
  ['512x512', { path: './assets/icons/icon-512.png', width: 512, height: 512 }]
]);

const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
for (const [size, expected] of expectedIcons) {
  const icon = icons.find(item => item?.sizes === size);
  if (!icon) {
    fail(`manifest: icône ${size} manquante`);
    continue;
  }
  if (icon.src !== expected.path) fail(`manifest: ${size} src ${icon.src} ≠ ${expected.path}`);
  if (icon.type !== 'image/png') fail(`manifest: ${size} type doit être image/png`);
  if (icon.purpose !== 'any') fail(`manifest: ${size} purpose doit rester "any" tant qu'aucune zone maskable n'est validée`);
  const diskPath = resolve(root, icon.src.replace(/^\.\//, ''));
  try {
    await access(diskPath);
    const png = await readFile(diskPath);
    const signature = '89504e470d0a1a0a';
    if (png.subarray(0, 8).toString('hex') !== signature) {
      fail(`manifest: ${size} n'est pas un PNG valide`);
    } else if (png.length < 24) {
      fail(`manifest: ${size} PNG tronqué`);
    } else {
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      if (width !== expected.width || height !== expected.height) {
        fail(`manifest: ${size} dimensions réelles ${width}x${height}`);
      }
    }
  } catch {
    fail(`manifest: fichier ${icon.src} absent`);
  }
}

const index = await readFile(resolve(root, 'index.html'), 'utf8');
const trip = await readFile(resolve(root, 'trip.html'), 'utf8');
const touchLink = '<link rel="apple-touch-icon" href="./assets/icons/icon-192.png">';
if (!index.includes(touchLink)) fail('index.html: apple-touch-icon manquant');
if (!trip.includes(touchLink)) fail('trip.html: apple-touch-icon manquant');

const leafletCssUrl = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const leafletJsUrl = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const leafletCssSri = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const leafletJsSri = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';

if (!trip.includes(`href="${leafletCssUrl}"`) || !trip.includes(`integrity="${leafletCssSri}"`)) {
  fail('trip.html: Leaflet CSS 1.9.4/SRI attendu manquant');
}
if (!trip.includes(`src="${leafletJsUrl}"`) || !trip.includes(`integrity="${leafletJsSri}"`)) {
  fail('trip.html: Leaflet JS 1.9.4/SRI attendu manquant');
}
if ((trip.match(/crossorigin="anonymous"/g) || []).length < 2) {
  fail('trip.html: crossorigin="anonymous" manquant sur une ressource Leaflet SRI');
}

const sw = await readFile(resolve(root, 'sw.js'), 'utf8');
for (const iconPath of ['./assets/icons/icon-192.png', './assets/icons/icon-512.png']) {
  if (!sw.includes(`'${iconPath}'`)) fail(`sw.js: ${iconPath} absent du shell PWA`);
}

if (errors.length) {
  console.error(`\nErreurs PWA (${errors.length})`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log('\nValidation PWA OK: identité manifest, icônes PNG, touch icons, Leaflet SRI et shell cache cohérents.');
