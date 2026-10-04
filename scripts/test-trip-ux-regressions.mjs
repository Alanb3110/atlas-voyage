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

const [html, css, styles, js, bookingJs, sw] = await Promise.all([
  readFile(resolve(root, 'trip.html'), 'utf8'),
  readFile(resolve(root, 'assets/css/trip-v2.css'), 'utf8'),
  readFile(resolve(root, 'assets/css/styles.css'), 'utf8'),
  readFile(resolve(root, 'assets/js/trip.js'), 'utf8'),
  readFile(resolve(root, 'assets/js/booking-readiness.js'), 'utf8'),
  readFile(resolve(root, 'sw.js'), 'utf8')
]);

check(html.includes('role="tablist"') && (html.match(/role="tab"/g) || []).length === 4,
  'onglets: tablist ARIA et quatre tabs');
check(html.includes('aria-expanded="false" aria-controls="tripConfigDialog"'),
  'header mobile: aria-expanded/aria-controls présents');
check(html.includes('<dialog id="tripConfigDialog"') && html.includes('aria-labelledby="tripConfigTitle"'),
  'configuration mobile: dialogue accessible et labellisé');
check(html.includes('id="configCloseBtn"') && html.includes('aria-label="Fermer la configuration"'),
  'configuration mobile: fermeture explicite accessible');

check(css.includes('html{scroll-padding-top:var(--trip-scroll-offset,150px)}'),
  'sticky: scroll-padding dynamique pour les ancres');
check(css.includes('.trip-tabs{position:sticky;top:var(--trip-appbar-height,70px)'),
  'sticky: onglets positionnés sous le header mesuré');
check(css.includes('scroll-margin-top:var(--trip-scroll-offset,150px)'),
  'sticky: étapes compensées pour scrollIntoView');
check(js.includes("document.documentElement.style.setProperty('--trip-scroll-offset', `${appbarHeight + tabsHeight + 12}px`)"),
  'sticky: offset calculé à partir des hauteurs réelles');

const setTabStart = js.indexOf('function setActiveTab(');
const setTabEnd = js.indexOf('function renderTabs()', setTabStart);
const setTab = js.slice(setTabStart, setTabEnd);
check(setTab.includes('map.invalidateSize({pan:false});'),
  'Leaflet: invalidateSize après réaffichage du Circuit');
check(setTab.includes('fitMapToCurrentRoute();'),
  'Leaflet: recadrage après rendu dans un onglet précédemment masqué');
const renderMapStart = js.indexOf('function renderMap()');
const renderMapEnd = js.indexOf('function detailBlock(', renderMapStart);
const renderMap = js.slice(renderMapStart, renderMapEnd);
check(renderMap.includes("if (activeTab !== 'circuit')") && renderMap.includes('map.remove();') && renderMap.includes('map = null;'),
  'Leaflet: aucun rendu de carte dans un panneau Circuit masqué');

const canonicalStart = js.indexOf('function canonicalizeUrl()');
const canonicalEnd = js.indexOf('function populateSelectors()', canonicalStart);
const canonical = js.slice(canonicalStart, canonicalEnd);
check(canonical.includes('new URL(buildTripUrl(trip.id, variant.id, budget.id), location.href)'),
  'URL: reconstruction canonique sans paramètres étrangers');
check(canonical.includes('selectableActivities().filter(activity => activityState.has(activity.id))'),
  'URL: activités sérialisées uniquement si applicables à la variante');
check(canonical.includes("history.replaceState(null, '', `./trip.html?${base.searchParams.toString()}`)"),
  'URL: état partageable synchronisé sans navigation');

const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
check(occurrences(css, '.activity-filter{min-height:44px') >= 2,
  'tactile: filtres activités à 44 px desktop/mobile');
check(occurrences(css, '.activity-actions .button{') >= 2 && !/\.activity-actions \.button\{[^}]*min-height:(?:3\d|4[0-3])px/.test(css),
  'tactile: actions activités à 44 px');
check(css.includes('.activity-toggle{position:relative;width:44px;height:44px') &&
      css.includes('  .activity-toggle{width:44px;height:44px}'),
  'tactile: interrupteurs activités 44 × 44 px');
check(css.includes('.trip-tab{min-width:0;min-height:44px') && css.includes('  .trip-tab{min-height:44px'),
  'tactile: onglets ≥44 px');
check(css.includes('.trip-appbar-actions .icon-button{min-height:44px'),
  'tactile: Configurer/Partager ≥44 px');
check(css.includes('.atlas-marker{background:transparent;border:0;width:44px!important;height:44px!important}'),
  'tactile: marqueurs Leaflet 44 × 44 px');
check(css.includes('.budget-card-compact .button{align-self:flex-start;min-height:44px'),
  'tactile: choix de budget ≥44 px');
check(css.includes('.activity-book-link{display:inline-flex;align-items:center;min-height:44px') &&
      css.includes('.step-expanded .text-link{display:inline-flex;min-height:44px'),
  'tactile: liens d’action principaux ≥44 px');
check(css.includes('.trip-appbar .brand,') && css.includes('.trip-appbar .theme-toggle,') &&
      css.includes('.trip-appbar select,') && css.includes('.trip-shell .button{min-height:44px}'),
  'tactile: garde-fou global header/boutons');
check(css.includes(':focus-visible{') && css.includes('UX audit guardrails: keyboard focus'),
  'clavier: focus visible explicite sur contrôles principaux');
check(css.includes('.trip-hero-copy h1{margin-bottom:16px;overflow-wrap:anywhere}'),
  'mobile: titre principal protégé contre le débordement');

check(js.includes("const MOBILE_DENSITY_QUERY = '(max-width: 620px)';") &&
      js.includes("!compactMobile && i===activeStepIndex?'open':''"),
  'densité mobile: aucune étape ouverte par défaut à 620 px et moins');
check(js.includes('class="days-disclosure"') && js.includes('class="day-card"') &&
      js.includes("!compactMobile && i===0?'open':''"),
  'densité mobile: programme replié sans changer le jour 1 ouvert sur desktop');
check(js.includes('class="budget-drivers-disclosure"') &&
      js.includes('class="budget-detail"'),
  'densité mobile: détails budget conservés derrière des disclosures fermés');
check(bookingJs.includes("window.matchMedia('(max-width: 620px)').matches") &&
      bookingJs.includes('booking-group-disclosure'),
  'densité mobile: groupes de réservation repliés');
check(css.includes('#mapSection .stops{display:none}') &&
      css.includes('#mapSection .map{height:300px;min-height:300px'),
  'densité mobile: doublon des étapes retiré au-dessus de la carte et carte compactée');
check(js.includes('class="step-expanded-tags"') &&
      css.includes('.step-expanded-tags{display:flex'),
  'densité mobile: tags d’étape déplacés dans le détail plutôt que supprimés');

function parseHex(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}
function luminance(hex) {
  return parseHex(hex).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
const rootVars = Object.fromEntries([...styles.matchAll(/--([a-z-]+):(#[0-9a-f]{6})/gi)].map(match => [match[1], match[2]]));
check(contrast(rootVars.muted, rootVars.bg) >= 4.5,
  'contraste clair: texte secondaire / fond ≥ 4,5:1',
  `${contrast(rootVars.muted, rootVars.bg).toFixed(2)}:1`);
check(contrast(rootVars.accent, rootVars.panel) >= 4.5,
  'contraste clair: accent éditorial / panneau ≥ 4,5:1',
  `${contrast(rootVars.accent, rootVars.panel).toFixed(2)}:1`);
check(contrast('#ffffff', rootVars.accent) >= 4.5,
  'contraste clair: texte blanc / accent ≥ 4,5:1',
  `${contrast('#ffffff', rootVars.accent).toFixed(2)}:1`);

check(sw.includes("const CACHE = 'atlas-v27-shell';"),
  'PWA: cache shell versionné v27');
check(sw.includes('async function networkFirstShell(request)') &&
      sw.includes('event.respondWith(networkFirstShell(request));'),
  'PWA: CSS/JS shell servis network-first');
check(!sw.includes('event.respondWith(cacheFirst(request));'),
  'PWA: absence de cache-first persistant sur le shell');
check(sw.includes("key.startsWith('atlas-') && key !== CACHE"),
  'PWA: anciens caches Atlas purgés à activation');

if (failures.length) {
  console.error(`\nÉchecs UX statiques (${failures.length})`);
  for (const item of failures) console.error(`- ${item.label}${item.detail ? `: ${item.detail}` : ''}`);
  process.exit(1);
}

console.log(`\nValidation UX statique OK: ${passed} contrôles.`);
