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
    console.log(`✓ ${label}`);
  } else {
    failures.push({ label, detail });
  }
}

const [html, homeJs, homeCss, workflow] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'assets/js/home.js'), 'utf8'),
  readFile(resolve(root, 'assets/css/home-ux.css'), 'utf8'),
  readFile(resolve(root, '.github/workflows/ux-browser-audit.yml'), 'utf8')
]);

const catalogIndex = html.indexOf('id="catalogSection"');
const compareIndex = html.indexOf('id="destinationCompareSection"');
const advancedIndex = html.indexOf('id="advancedAnalysis"');

check(catalogIndex >= 0 && compareIndex > catalogIndex && advancedIndex > compareIndex,
  'accueil: voyages avant comparaison puis analyses avancées');
check(html.includes('<option value="active">Destinations actives</option>'),
  'catalogue: destinations actives sélectionnées par défaut');
check(html.includes('<option value="archived">Archives</option>') &&
      html.includes('<option value="all">Toutes, archives incluses</option>'),
  'catalogue: archives accessibles explicitement sans être la vue par défaut');
check(html.includes('id="compareDestinationsLink"') && html.includes('href="#destinationCompareSection"'),
  'catalogue: CTA global explicite vers le comparateur');
check(html.includes('id="destinationAllDetails"') && html.includes('id="advancedAnalysis"'),
  'densité: détails comparatifs et analyses avancées repliables');
check(!html.slice(html.indexOf('<header class="appbar">'), html.indexOf('</header>')).includes('privacy-chip'),
  'mobile: le badge GitHub Pages ne surcharge plus le header sticky');
check(html.includes('<small>GitHub Pages · public</small>'),
  'confidentialité: le caractère public reste visible hors du header');

check(homeJs.includes("const ACTIVE_STATUSES = new Set(['longlist', 'shortlist', 'selected', 'detailed', 'bookable', 'booked']);"),
  'catalogue: définition explicite des statuts actifs');
check(homeJs.includes("if (selectedStatus === 'active') return ACTIVE_STATUSES.has(trip.status);"),
  'catalogue: archives exclues de la vue active');
check(homeJs.includes("if (tripStatus === 'shortlist') return 'Présélectionnée';"),
  'catalogue: présélection rendue compréhensible sans jargon');
check(homeJs.includes('const canCompareVariants = Number(trip.variantCount || 1) > 1;') &&
      homeJs.includes('data-action="compare-variants"'),
  'CTA: comparaison des variantes seulement quand elle a un sens');
check(homeJs.includes("return `${url}&tab=choice`;"),
  'CTA: comparer ouvre explicitement l’onglet Choix');
check(homeJs.includes('data-action="open-trip"'),
  'CTA: ouverture du dossier reste distincte de la comparaison');

check(homeCss.includes('body[data-page="home"] .theme-toggle{width:44px;height:44px'),
  'mobile: contrôle de thème ≥ 44 × 44 px');
check(homeCss.includes('body[data-page="home"] .toolbar input,') &&
      homeCss.includes('body[data-page="home"] .toolbar select{min-height:44px}'),
  'mobile: filtres du catalogue ≥ 44 px');
check(homeCss.includes('body[data-page="home"] .trip-actions .button{min-height:44px'),
  'mobile: CTA des voyages ≥ 44 px');
check(homeCss.includes('.market-confidence,') && homeCss.includes('.d2d-group-head>span,'),
  'mobile: micro-typographie des analyses avancées relevée');

check(/matrix:\s*\n\s*browser:\s*\[chromium, firefox, webkit\]/.test(workflow),
  'matrice navigateur: Chromium, Firefox et WebKit');

if (failures.length) {
  console.error(`\nÉchecs UX accueil (${failures.length})`);
  for (const item of failures) console.error(`- ${item.label}${item.detail ? `: ${item.detail}` : ''}`);
  process.exit(1);
}

console.log(`\nValidation UX accueil OK: ${passed} contrôles.`);
