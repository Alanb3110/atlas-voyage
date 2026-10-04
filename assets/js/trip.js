import { loadCatalog, loadTrip, params, buildTripUrl, formatEUR, formatDateFR, escapeHtml } from './store.js';

const $ = s => document.querySelector(s);
const p = params();
const catalog = await loadCatalog();
let entry = catalog.trips.find(t => t.id === p.get('trip')) || catalog.trips[0];
if (!entry) throw new Error('Aucun voyage dans le catalogue.');
let trip = await loadTrip(entry.dataFile);
let variant = trip.variants.find(v => v.id === p.get('variant')) || trip.variants.find(v => v.id === trip.defaultVariant) || trip.variants[0];
let budget = trip.budgets.find(b => b.id === p.get('budget')) || trip.budgets.find(b => b.id === trip.defaultBudget) || trip.budgets[0];
const TAB_IDS = ['circuit','choice','budget','practical'];
let activeTab = TAB_IDS.includes(p.get('tab')) ? p.get('tab') : 'circuit';
let map;
let mapMarkers = [];
let activeStepIndex = 0;
let appbarResizeObserver;
let tabsResizeObserver;
let responsiveHeaderMedia;
let configReturnFocus;
const MOBILE_HEADER_QUERY = '(max-width: 899px)';
const ACTIVITY_MOBILE_QUERY = '(max-width: 760px)';
let activityState = new Set();
let activityFilter = window.matchMedia(ACTIVITY_MOBILE_QUERY).matches ? 'selected' : 'all';
const activityOpenState = new Set();

function formatEURPrecise(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value));
}

function formatIDR(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value));
}

function activityApplies(activity) {
  const variants = activity.applicableVariants || [];
  return !variants.length || variants.includes(variant.id);
}

function selectableActivities() {
  return (trip.activities || []).filter(activity => !activity.locked && activityApplies(activity));
}

function initActivityState() {
  const allSelectable = (trip.activities || []).filter(activity => !activity.locked);
  const requested = p.get('activities');
  if (requested == null) {
    activityState = new Set(allSelectable.filter(activity => activity.defaultSelected).map(activity => activity.id));
    return;
  }
  if (requested === 'none') {
    activityState = new Set();
    return;
  }
  const allowed = new Set(allSelectable.map(activity => activity.id));
  activityState = new Set(requested.split(',').map(x => x.trim()).filter(id => allowed.has(id)));
}

function activityPriceEUR(activity, forBudget = budget) {
  const mapped = activity.priceByBudgetEUR?.[forBudget.id];
  if (mapped != null && Number.isFinite(Number(mapped))) return Number(mapped);
  return Number(activity.priceEUR) || 0;
}

function selectedActivityTotal(forBudget = budget) {
  return selectableActivities().reduce((sum, activity) => sum + (activityState.has(activity.id) ? activityPriceEUR(activity, forBudget) : 0), 0);
}

const DEFAULT_BUDGET_TARGET_EUR = 5000;
const BUDGET_STATUS_LABELS = {
  confirmed: 'Confirmé',
  observed: 'Observé',
  estimated: 'Estimé',
  to_recheck: 'À revérifier'
};
const BUDGET_STATUS_PRIORITY = {
  confirmed: 0,
  observed: 1,
  estimated: 2,
  to_recheck: 3
};

function foldBudgetText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeBudgetStatus(value = 'estimated') {
  const status = foldBudgetText(value).replace(/[_-]+/g, ' ');
  if (status.includes('confirm')) return 'confirmed';
  if (status.includes('observ')) return 'observed';
  if (status.includes('recheck') || status.includes('reverif') || status.includes('verif')) return 'to_recheck';
  if (status.includes('estim')) return 'estimated';
  return 'estimated';
}

function selectedActivityBudgetStatus() {
  const selected = selectableActivities().filter(activity => activityState.has(activity.id));
  if (!selected.length) return 'estimated';
  return selected
    .map(activity => normalizeBudgetStatus(activity.status))
    .reduce((worst, status) => BUDGET_STATUS_PRIORITY[status] > BUDGET_STATUS_PRIORITY[worst] ? status : worst, 'confirmed');
}

function budgetRowsFor(forBudget = budget) {
  return (forBudget.breakdown || []).map(row => row.activityBaseline
    ? {
        ...row,
        label:'Activités à la carte sélectionnées',
        amount:selectedActivityTotal(forBudget),
        status:selectedActivityBudgetStatus()
      }
    : row
  );
}

function projectedBudgetTotal(forBudget = budget) {
  return budgetRowsFor(forBudget).reduce((sum,row)=>sum+(Number(row.amount)||0),0);
}

function budgetTargetEUR() {
  const target = Number(trip.budgetTargetEUR);
  return Number.isFinite(target) && target > 0 ? target : DEFAULT_BUDGET_TARGET_EUR;
}

function budgetStatusCounts(rows) {
  const counts = {confirmed:0, observed:0, estimated:0, to_recheck:0};
  rows.forEach(row => { counts[normalizeBudgetStatus(row.status)] += 1; });
  return counts;
}

function budgetConfidence() {
  const full = String(budget.confidence || trip.traceability?.budgetConfidence || 'Non renseignée').trim();
  const short = full.split(/\s+[—–]\s+/)[0].trim() || full;
  return {short, full};
}

function budgetDrivers(limit = 5) {
  const budgets = trip.budgets || [];
  if (budgets.length < 2) return [];
  const rowsByBudget = budgets.map(item => budgetRowsFor(item));
  const activeRows = budgetRowsFor(budget);
  const rowCount = Math.max(0, ...rowsByBudget.map(rows => rows.length));
  const drivers = [];

  for (let index = 0; index < rowCount; index += 1) {
    const entries = rowsByBudget
      .map((rows, budgetIndex) => ({budget:budgets[budgetIndex], row:rows[index]}))
      .filter(entry => entry.row && Number.isFinite(Number(entry.row.amount)));
    if (entries.length < 2) continue;

    const ordered = [...entries].sort((a,b)=>(Number(a.row.amount)||0)-(Number(b.row.amount)||0));
    const min = ordered[0];
    const max = ordered[ordered.length - 1];
    const spread = (Number(max.row.amount)||0) - (Number(min.row.amount)||0);
    const activeRow = activeRows[index] || entries[0].row;
    const selectedImpact = activeRow.activityBaseline ? Number(activeRow.amount)||0 : 0;
    const impact = Math.max(spread, selectedImpact);
    if (impact < 1) continue;

    drivers.push({
      label: activeRow.label || entries[0].row.label || 'Poste',
      impact,
      kind: activeRow.activityBaseline ? 'Sélection' : 'Écart de gamme',
      detail: activeRow.activityBaseline
        ? `${formatEUR(selectedImpact)} avec les activités actuellement sélectionnées`
        : `${formatEUR(spread)} d’écart entre ${min.budget.label} et ${max.budget.label}`
    });
  }

  return drivers.sort((a,b)=>b.impact-a.impact).slice(0,limit);
}

const SCORE_LABELS = [
  ['wildlife','Faune'],['relaxation','Détente'],['culture','Culture'],['beach','Plage'],['logistics','Logistique']
];
const ROUTE_STYLES = {
  air:{color:'#c66c55',label:'Aérien'},
  sea:{color:'#2e7196',label:'Maritime'},
  road:{color:'#1f5a49',label:'Routier'},
  rail:{color:'#866f45',label:'Rail'}
};

function safeUrl(value='') {
  try {
    const u = new URL(value, location.href);
    return ['http:','https:'].includes(u.protocol) ? u.href : '#';
  } catch { return '#'; }
}

function canonicalizeUrl() {
  const base = new URL(buildTripUrl(trip.id, variant.id, budget.id), location.href);
  if ((trip.activities || []).some(activity => !activity.locked)) {
    const selected = [...activityState].sort();
    base.searchParams.set('activities', selected.length ? selected.join(',') : 'none');
  }
  base.searchParams.set('tab', activeTab);
  history.replaceState(null, '', `./trip.html?${base.searchParams.toString()}`);
}

function populateSelectors() {
  $('#tripSelector').innerHTML = catalog.trips.map(t => `<option value="${escapeHtml(t.id)}" ${t.id===trip.id?'selected':''}>${escapeHtml(t.title)}</option>`).join('');
  $('#variantSelector').innerHTML = trip.variants.map(v => `<option value="${escapeHtml(v.id)}" ${v.id===variant.id?'selected':''}>${escapeHtml(v.label)}</option>`).join('');
  $('#budgetSelector').innerHTML = trip.budgets.map(b => `<option value="${escapeHtml(b.id)}" ${b.id===budget.id?'selected':''}>${escapeHtml(b.label)}</option>`).join('');
  $('#tripSelector').onchange = e => {
    const next = new URL(buildTripUrl(e.target.value), location.href);
    next.searchParams.set('tab', activeTab);
    location.href = `./trip.html?${next.searchParams.toString()}`;
  };
  $('#variantSelector').onchange = e => { variant = trip.variants.find(v=>v.id===e.target.value); activeStepIndex = 0; canonicalizeUrl(); render(); };
  $('#budgetSelector').onchange = e => { budget = trip.budgets.find(b=>b.id===e.target.value); canonicalizeUrl(); render(); };
}

function renderHero() {
  document.title = `${trip.meta.title} — Atlas Voyage`;
  $('#hero').style.backgroundImage = `url('${safeUrl(trip.meta.heroImage || '')}')`;
  $('#tripTitle').textContent = trip.meta.title;
  $('#heroTags').innerHTML = [trip.meta.dates,trip.meta.duration].filter(Boolean).map(x=>`<span class="chip light">${escapeHtml(x)}</span>`).join('');
  const kpis = [
    ['Variante sélectionnée', variant.label],
    ['Budget projeté', formatEUR(projectedBudgetTotal(budget))]
  ];
  $('#kpis').innerHTML = kpis.map(([a,b])=>`<div class="kpi"><span>${escapeHtml(a)}</span><strong>${escapeHtml(b)}</strong></div>`).join('');
}

function syncStickyOffset() {
  const appbar = $('.trip-appbar');
  const tabs = $('#tripTabs');
  if (!appbar) return;
  const appbarHeight = Math.ceil(appbar.getBoundingClientRect().height);
  const tabsHeight = tabs ? Math.ceil(tabs.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--trip-appbar-height', `${appbarHeight}px`);
  document.documentElement.style.setProperty('--trip-tabs-height', `${tabsHeight}px`);
  document.documentElement.style.setProperty('--trip-scroll-offset', `${appbarHeight + tabsHeight + 12}px`);
}

function closeConfigDialog({restoreFocus=true}={}) {
  const dialog = $('#tripConfigDialog');
  if (!dialog?.open) return;
  dialog.dataset.restoreFocus = restoreFocus ? 'true' : 'false';
  dialog.close();
}

function syncResponsiveHeader() {
  const dialog = $('#tripConfigDialog');
  const switchers = $('#tripSwitchers');
  const themeToggle = $('[data-theme-toggle]');
  const mobile = responsiveHeaderMedia?.matches ?? false;

  if (!mobile && dialog?.open) closeConfigDialog({restoreFocus:false});

  const switcherTarget = mobile ? $('#mobileSwitcherSlot') : $('#desktopSwitcherSlot');
  const themeTarget = mobile ? $('#mobileThemeSlot') : $('#desktopThemeSlot');
  if (switchers && switcherTarget && switchers.parentElement !== switcherTarget) switcherTarget.appendChild(switchers);
  if (themeToggle && themeTarget && themeToggle.parentElement !== themeTarget) themeTarget.appendChild(themeToggle);

  if (!mobile) $('#configBtn')?.setAttribute('aria-expanded','false');
  requestAnimationFrame(syncStickyOffset);
}

function openConfigDialog() {
  const dialog = $('#tripConfigDialog');
  const trigger = $('#configBtn');
  if (!dialog || !trigger || dialog.open) return;
  configReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;
  trigger.setAttribute('aria-expanded','true');
  dialog.showModal();
  requestAnimationFrame(() => $('#tripSelector')?.focus({preventScroll:true}));
}

function initResponsiveHeader() {
  const dialog = $('#tripConfigDialog');
  const trigger = $('#configBtn');
  const closeButton = $('#configCloseBtn');
  const doneButton = $('#configDoneBtn');
  if (!dialog || !trigger) return;

  responsiveHeaderMedia = window.matchMedia(MOBILE_HEADER_QUERY);
  if (responsiveHeaderMedia.addEventListener) responsiveHeaderMedia.addEventListener('change', syncResponsiveHeader);
  else responsiveHeaderMedia.addListener?.(syncResponsiveHeader);

  trigger.addEventListener('click', openConfigDialog);
  closeButton?.addEventListener('click', () => closeConfigDialog());
  doneButton?.addEventListener('click', () => closeConfigDialog());

  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeConfigDialog();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeConfigDialog();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeConfigDialog();
  });
  dialog.addEventListener('close', () => {
    trigger.setAttribute('aria-expanded','false');
    const shouldRestore = dialog.dataset.restoreFocus !== 'false' && responsiveHeaderMedia.matches;
    dialog.dataset.restoreFocus = 'true';
    if (shouldRestore) {
      const target = configReturnFocus?.isConnected ? configReturnFocus : trigger;
      target?.focus?.({preventScroll:true});
    }
  });

  syncResponsiveHeader();
}

function fitMapToCurrentRoute() {
  if (!map) return;
  const coords = (variant.steps || []).map(step => step.coords).filter(Array.isArray);
  (variant.routes || []).forEach(route => (route.points || []).forEach(point => coords.push(point)));
  if (coords.length) map.fitBounds(coords,{padding:[40,40]});
}

function setActiveTab(tab,{syncUrl=false,focus=false}={}) {
  activeTab = TAB_IDS.includes(tab) ? tab : 'circuit';
  const tabs = [...document.querySelectorAll('#tripTabs [role="tab"]')];
  let selectedTab = null;
  tabs.forEach(node => {
    const selected = node.dataset.tab === activeTab;
    node.setAttribute('aria-selected', selected ? 'true' : 'false');
    node.tabIndex = selected ? 0 : -1;
    if (selected) selectedTab = node;
  });
  document.querySelectorAll('[data-tab-panel]').forEach(panel => {
    panel.hidden = panel.dataset.tabPanel !== activeTab;
  });
  if (syncUrl) canonicalizeUrl();
  if (focus) selectedTab?.focus();
  if (activeTab === 'circuit') {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!map) return;
      map.invalidateSize({pan:false});
      syncActiveStepVisuals();
    }));
  }
}

function renderTabs() {
  const tabs = [...document.querySelectorAll('#tripTabs [role="tab"]')];
  tabs.forEach((tab,index) => {
    tab.onclick = () => setActiveTab(tab.dataset.tab,{syncUrl:true});
    tab.onkeydown = event => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex == null) return;
      event.preventDefault();
      setActiveTab(tabs[nextIndex].dataset.tab,{syncUrl:true,focus:true});
    };
  });
  setActiveTab(activeTab);
  syncStickyOffset();
}

function initStickyOffset() {
  const appbar = $('.trip-appbar');
  const tabs = $('#tripTabs');
  if (!appbar) return;
  if ('ResizeObserver' in window) {
    appbarResizeObserver?.disconnect();
    tabsResizeObserver?.disconnect();
    appbarResizeObserver = new ResizeObserver(syncStickyOffset);
    tabsResizeObserver = new ResizeObserver(syncStickyOffset);
    appbarResizeObserver.observe(appbar);
    if (tabs) tabsResizeObserver.observe(tabs);
  }
  window.addEventListener('resize', syncStickyOffset,{passive:true});
  syncStickyOffset();
}

function renderOverview() {
  $('#variantSubtitle').textContent = variant.subtitle || trip.meta.subtitle || '';
  $('#overviewIntro').textContent = variant.overviewIntro || trip.overviewIntro || '';
  $('#decisionMeta').innerHTML = [trip.meta.travelers,trip.meta.departure,variant.rhythm].filter(Boolean).map(x=>`<span class="chip">${escapeHtml(x)}</span>`).join('');
  const summary = variant.summary?.length ? variant.summary : (trip.summary || []);
  const normalize = value => String(value ?? '').trim().toLocaleLowerCase('fr-FR').replace(/\s+/g,' ');
  const heroValues = new Set([
    trip.meta.dates,
    trip.meta.duration,
    variant.label,
    budget.label,
    formatEUR(projectedBudgetTotal(budget))
  ].filter(Boolean).map(normalize));
  const visibleSummary = summary.filter(item => !heroValues.has(normalize(item.value)));
  const node = $('#summaryCards');
  node.hidden = visibleSummary.length === 0;
  node.innerHTML = visibleSummary.map(x=>`<article class="summary-card"><div class="metric">${escapeHtml(x.value)}</div><p>${escapeHtml(x.text)}</p></article>`).join('');
}

function scoreBar(key, value) {
  const n = Math.max(0,Math.min(5,Number(value)||0));
  const label = SCORE_LABELS.find(([k])=>k===key)?.[1] || key;
  return `<div class="score-row"><span>${escapeHtml(label)}</span><div class="score-track"><div class="score-fill" style="width:${n*20}%"></div></div><span class="score-value">${n}</span></div>`;
}

function renderVariantCompare() {
  $('#variantCompare').innerHTML = trip.variants.map(v=>{
    const scores = v.scores || {};
    const bars = SCORE_LABELS.filter(([key])=>scores[key]!=null).map(([key])=>scoreBar(key,scores[key])).join('');
    return `<article class="variant-card ${v.id===variant.id?'active':''}">
      <div class="variant-card-head"><div><span class="status">${v.id===variant.id?'Option active':escapeHtml(v.rhythm||'Option')}</span><h3>${escapeHtml(v.label)}</h3></div>${v.id===trip.defaultVariant?'<span class="badge">Défaut</span>':''}</div>
      <p class="variant-tradeoff">${escapeHtml(v.tradeoff || v.overviewIntro || v.subtitle || '')}</p>
      ${bars?`<div class="score-list">${bars}</div>`:''}
      <button class="button ${v.id===variant.id?'secondary':''}" type="button" data-variant="${escapeHtml(v.id)}">${v.id===variant.id?'Sélectionnée':'Choisir cette option'}</button>
    </article>`;
  }).join('');
  document.querySelectorAll('[data-variant]').forEach(btn=>btn.onclick=()=>{
    const next = trip.variants.find(v=>v.id===btn.dataset.variant);
    if (!next || next.id===variant.id) return;
    variant = next;
    activeStepIndex = 0;
    $('#variantSelector').value = variant.id;
    canonicalizeUrl();
    render();
  });
}

function lodgingFor(step) {
  return step.lodging?.[budget.id] || step.lodging?.[trip.defaultBudget] || 'À sélectionner';
}

function stayStatusLabel(value='') {
  const normalized = String(value).trim().toLowerCase();
  if (['observed','observe','observé'].includes(normalized)) return 'observé';
  if (['estimated','estimate','estimé'].includes(normalized)) return 'estimé';
  if (/recheck|revérifier|reverifier|check|verify|vérifier|verifier/.test(normalized)) return 'à revérifier';
  return value || 'à revérifier';
}

function selectedLodgingPrice(step) {
  const selected = lodgingFor(step);
  const match = String(selected).match(/(?:≈\s*)?([0-9][0-9\s.,]*)\s*€/i);
  if (match) {
    const pair = /€\s*\/\s*2\b/i.test(selected) ? ' / 2' : '';
    return `≈ ${match[1].trim()} €${pair}`;
  }
  if (step.recommendedStay?.priceEUR != null) return `≈ ${formatEURPrecise(step.recommendedStay.priceEUR)}`;
  return 'Tarif à confirmer';
}

function stepIsHighlight(step) {
  if (step.highlight || step.featured) return true;
  if ((step.tags || []).some(tag => /^temps fort$/i.test(String(tag).trim()))) return true;
  return /temps fort|cœur .{0,24}voyage|coeur .{0,24}voyage/i.test(`${step.summary || ''} ${step.signature || ''}`);
}

function syncActiveStepVisuals() {
  document.querySelectorAll('[data-stop]').forEach(node => {
    const active = Number(node.dataset.stop) === activeStepIndex;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current','step');
    else node.removeAttribute('aria-current');
  });
  document.querySelectorAll('.step-accordion[data-step]').forEach(node => {
    node.classList.toggle('active', Number(node.dataset.step) === activeStepIndex);
  });
  mapMarkers.forEach((marker,index) => marker.getElement()?.classList.toggle('active', index === activeStepIndex));
}

function activateStep(index,{openAccordion=true,centerMap=true,openPopup=true,scrollAccordion=false}={}) {
  const steps = variant.steps || [];
  if (!Number.isInteger(index) || index < 0 || index >= steps.length) return;
  activeStepIndex = index;

  const target = document.querySelector(`.step-accordion[data-step="${index}"]`);
  if (openAccordion && target) {
    document.querySelectorAll('.step-accordion[open]').forEach(node => {
      if (node !== target) node.open = false;
    });
    target.open = true;
  }

  syncActiveStepVisuals();

  const coords = steps[index]?.coords;
  if (centerMap && map && Array.isArray(coords)) {
    map.flyTo(coords, Math.max(map.getZoom(), 9), {duration:.45});
    if (openPopup) mapMarkers[index]?.openPopup();
  }

  if (scrollAccordion && target) {
    requestAnimationFrame(() => target.scrollIntoView({behavior:'smooth',block:'start'}));
  }
}

function renderMap() {
  const steps = variant.steps || [];
  const routes = variant.routes || [];
  activeStepIndex = Math.min(Math.max(activeStepIndex,0),Math.max(steps.length-1,0));
  $('#mapNote').textContent = variant.mapNote || (routes.some(r=>r.real===false) ? 'Les liaisons pointillées sont schématiques et ne représentent pas un itinéraire routier ou maritime exact.' : 'Tracés issus des données du voyage.');
  $('#stops').innerHTML = steps.map((s,i)=>`<button class="stop ${i===activeStepIndex?'active':''}" type="button" data-stop="${i}" ${i===activeStepIndex?'aria-current="step"':''}><span class="stop-num">${i+1}</span><span class="stop-copy"><span class="stop-title">${escapeHtml(s.name)}</span><small>${escapeHtml(s.nights)}</small></span></button>`).join('');
  if (!window.L || !steps.length) return;
  if (map) map.remove();
  mapMarkers = [];
  map = L.map('map',{scrollWheelZoom:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(map);
  const allCoords = [...steps.map(s=>s.coords)];
  routes.forEach(r=>{
    const meta = ROUTE_STYLES[r.type] || {color:'#67736d',label:r.type||'Liaison'};
    const points = r.points || [];
    points.forEach(pt=>allCoords.push(pt));
    const line = L.polyline(points,{color:meta.color,weight:4,dashArray:r.real===false?'8 8':null,opacity:.82}).addTo(map);
    const status = r.real===false ? 'schématique' : 'tracé documenté';
    if (r.label) line.bindPopup(`<strong>${escapeHtml(r.label)}</strong><br>${escapeHtml(meta.label)} · ${status}`);
  });
  mapMarkers = steps.map((s,i)=>{
    const marker = L.marker(s.coords,{icon:L.divIcon({className:'atlas-marker',html:`<div class="marker-pin"><span>${i+1}</span></div>`,iconSize:[34,34],iconAnchor:[17,32]})})
      .addTo(map)
      .bindPopup(`<strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.nights)}<br>${escapeHtml(s.summary||'')}`);
    marker.on('click', () => activateStep(i,{openAccordion:true,centerMap:true,openPopup:false,scrollAccordion:true}));
    return marker;
  });
  map.fitBounds(allCoords,{padding:[40,40]});
  document.querySelectorAll('.stop').forEach((node,i)=>node.onclick=()=>activateStep(i,{openAccordion:true,centerMap:true,openPopup:true,scrollAccordion:true}));
  const unique = [...new Map(routes.map(r=>[r.type,r])).values()];
  $('#mapLegend').innerHTML = unique.map(r=>{
    const meta=ROUTE_STYLES[r.type]||{label:r.type||'Liaison'};
    return `<span class="legend-item"><span class="legend-line ${escapeHtml(r.type||'')} ${r.real===false?'schematic':''}"></span>${escapeHtml(meta.label)}${r.real===false?' · schématique':''}</span>`;
  }).join('');
  setTimeout(()=>{
    map.invalidateSize();
    syncActiveStepVisuals();
  },100);
}

function detailBlock(label,value) {
  if (!value) return '';
  return `<div class="step-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderSteps() {
  const steps = variant.steps || [];
  activeStepIndex = Math.min(Math.max(activeStepIndex,0),Math.max(steps.length-1,0));
  $('#steps').innerHTML = steps.map((s,i)=>{
    const image = s.image ? `<img class="step-image" loading="lazy" src="${safeUrl(s.image)}" alt="">` : '';
    const details = [
      ['Transfert',s.transfer],['Faune',s.wildlife],['Plage / eau',s.beach],['Culture',s.culture],['Gastronomie',s.food],
      ['Activité',s.activity],['Fréquentation',s.crowding],['Météo',s.weather],['Sécurité',s.safety]
    ].map(([a,b])=>detailBlock(a,b)).join('');
    const stay = s.recommendedStay;
    const stayStatus = stayStatusLabel(stay?.status);
    const stayBlock = stay ? `<div class="stay-choice">
      <div class="stay-choice-head"><div><span class="stay-kicker">Option de travail</span><strong>${escapeHtml(stay.name||'Hébergement')}</strong></div><span class="budget-status ${stayStatus==='estimé'?'estimated':''}">${escapeHtml(stayStatus)}</span></div>
      <div class="stay-meta">${stay.priceIDR ? `<span>${escapeHtml(formatIDR(stay.priceIDR))}</span>` : ''}${stay.priceEUR != null ? `<span>≈ ${escapeHtml(formatEURPrecise(stay.priceEUR))}</span>` : ''}${stay.checkedAt ? `<span>Vérifié ${escapeHtml(formatDateFR(stay.checkedAt))}</span>` : ''}</div>
      ${stay.note?`<p>${escapeHtml(stay.note)}</p>`:''}
      ${stay.url?`<a class="text-link" href="${safeUrl(stay.url)}" target="_blank" rel="noopener noreferrer">Voir le prestataire / l’offre ↗</a>`:''}
    </div>` : '';
    const tags = (s.tags||[]).slice(0,4);
    const highlight = stepIsHighlight(s);
    return `<details class="step-card step-accordion ${i===activeStepIndex?'active':''}" data-step="${i}" ${i===activeStepIndex?'open':''}>
      <summary class="step-summary">
        <span class="step-summary-main">
          <span class="step-summary-title-line"><span class="step-number">${i+1}</span><span class="step-title-wrap"><span class="step-title">${escapeHtml(s.name)}</span><span class="step-nights">${escapeHtml(s.nights)}</span></span>${highlight?'<span class="step-highlight">Temps fort</span>':''}</span>
          <span class="step-summary-text">${escapeHtml(s.summary||'')}</span>
          ${tags.length?`<span class="step-summary-tags">${tags.map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join('')}</span>`:''}
          <span class="step-summary-meta"><span>Fatigue <strong>${escapeHtml(s.fatigue||'—')}</strong></span><span>Hébergement <strong>${escapeHtml(selectedLodgingPrice(s))}</strong></span></span>
        </span>
      </summary>
      <div class="step-expanded ${image?'has-image':''}">
        ${image}
        <div class="step-expanded-copy">
          ${details?`<div class="step-details">${details}</div>`:''}
          ${s.signature?`<div class="signature"><strong>Expérience signature :</strong> ${escapeHtml(s.signature)}</div>`:''}
          <div class="selected-lodging"><span class="stay-kicker">Hébergement · ${escapeHtml(budget.label)}</span><strong>${escapeHtml(lodgingFor(s))}</strong></div>
          ${stayBlock}
        </div>
      </div>
    </details>`;
  }).join('');

  document.querySelectorAll('.step-accordion').forEach((node,i)=>{
    node.addEventListener('toggle',()=>{
      if (!node.open) return;
      document.querySelectorAll('.step-accordion[open]').forEach(other=>{
        if (other !== node) other.open = false;
      });
      activateStep(i,{openAccordion:false,centerMap:true,openPopup:true,scrollAccordion:false});
    });
  });
  syncActiveStepVisuals();
}

function normalizeItem(item) {
  if (Array.isArray(item)) return {label:item[0],value:item[1],warn:Boolean(item[2])};
  return {label:item.label||'',value:item.value||'',warn:Boolean(item.warn)};
}

function renderInfoCards(selector,cards=[]) {
  $(selector).innerHTML = cards.map(card=>`<article class="info-card"><h3>${escapeHtml(card.title)}</h3>${card.note?`<p class="muted">${escapeHtml(card.note)}</p>`:''}<div class="info-rows">${(card.items||[]).map(raw=>{const item=normalizeItem(raw);const warn=item.warn||/à vérifier|variable|moyen|possible|non évalué|à rechercher/i.test(item.value);return `<div class="info-row"><span>${escapeHtml(item.label)}</span><span class="value-pill ${warn?'warn':''}">${escapeHtml(item.value)}</span></div>`}).join('')}</div></article>`).join('');
}

function renderActivities() {
  const section = $('#activitiesSection');
  const activities = (trip.activities || []).filter(activity => activityApplies(activity));
  if (!activities.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  $('#activitiesIntro').textContent = trip.activitiesIntro || 'Active ou désactive les activités à la carte.';

  const priorityLabel = {
    must:'À faire',
    recommended:'Recommandé',
    splurge:'Upgrade intéressant',
    nice:'Option plaisir',
    skip:'À couper'
  };
  const priorityTradeoff = {
    must:'Structure le circuit : ce choix est verrouillé ici et se modifie via la variante.',
    recommended:'Bon rapport intérêt / coût ; à conserver sauf contrainte de temps ou de budget.',
    splurge:'Gain de confort ou d’expérience contre un surcoût ; pertinent si la marge le permet.',
    nice:'Plaisir secondaire, facile à retirer pour préserver la marge ou alléger le programme.',
    skip:'Valeur ajoutée limitée au regard du coût ou du temps consommé.'
  };
  const sourceFor = activity => {
    if (!activity.url) return '—';
    const normalize = value => String(value || '').replace(/\/+$/,'');
    const exact = (trip.sources || []).find(source => normalize(source.url) === normalize(activity.url));
    if (exact?.label) return exact.label;
    try { return new URL(activity.url, location.href).hostname.replace(/^www\./,''); }
    catch { return 'Source externe'; }
  };
  const isIncludedByBudget = activity => (activity.includedBudgets || []).includes(budget.id);
  const isSelected = activity => activity.locked || isIncludedByBudget(activity) || activityState.has(activity.id);
  const matchesFilter = activity => {
    if (activityFilter === 'selected') return isSelected(activity);
    if (activityFilter === 'recommended') return ['must','recommended','splurge'].includes(activity.priority) || activity.defaultSelected;
    return true;
  };
  const compactPrice = activity => {
    if (isIncludedByBudget(activity)) return 'Inclus · 0 € / 2';
    const value = activityPriceEUR(activity,budget);
    if (value === 0) return 'Sans surcoût';
    return `≈ ${formatEURPrecise(value)} / 2`;
  };
  const euroPrice = activity => {
    if (isIncludedByBudget(activity)) return `Inclus dans ${budget.label} · surcoût 0 €`;
    const value = activityPriceEUR(activity,budget);
    return value === 0 ? 'Sans surcoût' : `${formatEURPrecise(value)} / 2`;
  };

  const projected = projectedBudgetTotal(budget);
  const target = Number(trip.activityBudget?.targetEUR) || 0;
  const margin = target ? target - projected : null;
  const selectedCount = selectableActivities().filter(activity => activityState.has(activity.id)).length;
  const marginTitle = margin == null ? 'Marge' : margin >= 0 ? 'Marge restante' : 'Dépassement';
  const marginValue = margin == null ? '—' : formatEUR(Math.abs(margin));

  $('#activityBudgetSummary').innerHTML = `
    <div class="activity-budget-metric primary"><span>Budget projeté</span><strong>${escapeHtml(formatEUR(projected))}</strong><small>${escapeHtml(budget.label)}</small></div>
    <div class="activity-budget-metric"><span>Objectif</span><strong>${target ? escapeHtml(formatEUR(target)) : '—'}</strong><small>pour 2 adultes</small></div>
    <div class="activity-budget-metric"><span>${escapeHtml(marginTitle)}</span><strong class="${margin != null && margin < 0 ? 'over' : 'ok'}">${escapeHtml(marginValue)}</strong><small>${margin == null ? 'objectif non défini' : margin >= 0 ? 'sous l’objectif' : 'au-dessus de l’objectif'}</small></div>
    <div class="activity-budget-metric"><span>Options sélectionnées</span><strong>${selectedCount}</strong><small>hors blocs structurels</small></div>
    ${trip.activityBudget?.currencyNote ? `<small class="activity-budget-note">${escapeHtml(trip.activityBudget.currencyNote)}</small>` : ''}
  `;

  document.querySelectorAll('[data-activity-filter]').forEach(button => {
    const active = button.dataset.activityFilter === activityFilter;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.onclick = () => {
      activityFilter = button.dataset.activityFilter;
      renderActivities();
    };
  });

  const visibleActivities = activities.filter(matchesFilter);
  $('#activities').innerHTML = visibleActivities.length ? visibleActivities.map(activity => {
    const includedByBudget = isIncludedByBudget(activity);
    const selected = isSelected(activity);
    const disabled = activity.locked || includedByBudget;
    const open = activityOpenState.has(activity.id);
    const status = stayStatusLabel(activity.status);
    const image = activity.image ? `<img class="activity-image" loading="lazy" src="${safeUrl(activity.image)}" alt="">` : '';
    const selectionLabel = activity.locked
      ? `Activité structurelle verrouillée : ${activity.title || 'activité'}`
      : includedByBudget
        ? `Activité incluse dans le budget ${budget.label} : ${activity.title || 'activité'}`
        : `${selected ? 'Désélectionner' : 'Sélectionner'} ${activity.title || 'activité'}`;
    const interest = activity.interest || activity.recommendation || priorityLabel[activity.priority] || 'À évaluer';
    const tradeoff = activity.tradeoff || activity.compromise || priorityTradeoff[activity.priority] || 'À arbitrer selon le temps disponible et la marge budgétaire.';
    const priceIDR = activity.priceIDR != null ? formatIDR(activity.priceIDR) : '—';
    const verifiedAt = activity.checkedAt ? formatDateFR(activity.checkedAt) : 'à revérifier';
    return `<details class="activity-card ${selected?'selected':''} ${activity.locked?'locked':''}" data-activity-card="${escapeHtml(activity.id)}" ${open?'open':''}>
      <summary class="activity-summary">
        <span class="activity-summary-main">
          <span class="activity-title-line"><h3>${escapeHtml(activity.title||'Activité')}</h3><span class="activity-priority ${escapeHtml(activity.priority||'nice')}">${escapeHtml(priorityLabel[activity.priority]||'Option plaisir')}</span></span>
          <span class="activity-compact-meta"><span>${escapeHtml([activity.date,activity.location].filter(Boolean).join(' · '))}</span><strong>${escapeHtml(compactPrice(activity))}</strong></span>
        </span>
        <label class="activity-toggle" title="${escapeHtml(selectionLabel)}">
          <input type="checkbox" data-activity-toggle="${escapeHtml(activity.id)}" aria-label="${escapeHtml(selectionLabel)}" ${selected?'checked':''} ${disabled?'disabled':''}>
          <span class="activity-toggle-ui" aria-hidden="true"></span>
        </label>
      </summary>
      <div class="activity-expanded ${image?'has-image':''}">
        ${image}
        <div class="activity-expanded-copy">
          <p class="activity-description">${escapeHtml(activity.description||'')}</p>
          <dl class="activity-detail-grid">
            <div><dt>Intérêt</dt><dd>${escapeHtml(interest)}</dd></div>
            <div><dt>Compromis</dt><dd>${escapeHtml(tradeoff)}</dd></div>
            <div><dt>Prix IDR</dt><dd>${escapeHtml(priceIDR)}</dd></div>
            <div><dt>Prix EUR</dt><dd>${escapeHtml(euroPrice(activity))}</dd></div>
            <div><dt>Statut</dt><dd><span class="budget-status ${status==='estimé'?'estimated':''}">${escapeHtml(status)}</span></dd></div>
            <div><dt>Source</dt><dd>${escapeHtml(sourceFor(activity))}</dd></div>
            <div><dt>Vérification</dt><dd>${escapeHtml(verifiedAt)}</dd></div>
          </dl>
          ${activity.url ? `<a class="activity-book-link" href="${safeUrl(activity.url)}" target="_blank" rel="noopener noreferrer">Source / réservation ↗</a>` : ''}
          ${activity.note ? `<div class="activity-note"><strong>Note</strong><span>${escapeHtml(activity.note)}</span></div>` : ''}
        </div>
      </div>
    </details>`;
  }).join('') : '<p class="activity-empty">Aucune activité dans ce filtre. Utilise « Toutes » pour revoir l’ensemble des options.</p>';

  document.querySelectorAll('.activity-toggle').forEach(label => {
    label.addEventListener('click', event => event.stopPropagation());
    label.addEventListener('keydown', event => event.stopPropagation());
  });
  document.querySelectorAll('[data-activity-card]').forEach(card => card.addEventListener('toggle', () => {
    if (card.open) activityOpenState.add(card.dataset.activityCard);
    else activityOpenState.delete(card.dataset.activityCard);
  }));
  document.querySelectorAll('[data-activity-toggle]').forEach(input => input.addEventListener('change', () => {
    if (input.disabled) return;
    if (input.checked) activityState.add(input.dataset.activityToggle);
    else activityState.delete(input.dataset.activityToggle);
    canonicalizeUrl();
    renderHero();
    renderActivities();
    renderBudgets();
  }));

  $('#activitiesReset').onclick = () => {
    (trip.activities || []).filter(activity => !activity.locked).forEach(activity => {
      if (activity.defaultSelected) activityState.add(activity.id);
      else activityState.delete(activity.id);
    });
    canonicalizeUrl();
    renderHero();
    renderActivities();
    renderBudgets();
  };
  $('#activitiesClear').onclick = () => {
    selectableActivities().forEach(activity => activityState.delete(activity.id));
    canonicalizeUrl();
    renderHero();
    renderActivities();
    renderBudgets();
  };
}

function renderNatureFoodWeather() {
  renderInfoCards('#wildlifeCards', trip.wildlife || []);
  $('#foodIntro').textContent = trip.food?.intro || 'Données à compléter lors de la recherche détaillée.';
  renderInfoCards('#foodCards', trip.food?.cards || []);
  $('#weatherIntro').textContent = trip.weather?.intro || 'Données à compléter lors de la recherche détaillée.';
  renderInfoCards('#weatherCards', trip.weather?.cards || []);
}

function renderPractical() {
  const practical = trip.practical || {};
  let cards = [];
  let rules = [];
  let intro = '';
  if (Array.isArray(practical)) {
    cards = practical.filter(c=>!/règles/i.test(c.title||''));
    const legacyRules = practical.filter(c=>/règles/i.test(c.title||''));
    rules = legacyRules.flatMap(c=>(c.items||[]).map(i=>({label:i[0],value:i[1],level:i[2]?'check':'regulation'})));
  } else {
    cards = practical.cards || practical.healthSafety || [];
    rules = practical.rules || [];
    intro = practical.intro || '';
  }
  $('#practicalIntro').textContent = intro || 'Formalités, santé, transport et risques à revérifier avant réservation et avant départ.';
  renderInfoCards('#practicalCards',cards);
  $('#rules').innerHTML = rules.map(rule=>`<article class="rule-card"><div class="rule-top"><h3>${escapeHtml(rule.label||rule.title||'Règle')}</h3><span class="status-pill ${escapeHtml(rule.level||'check')}">${escapeHtml(({law:'Loi',regulation:'Réglementation',culture:'Usage',check:'À vérifier'})[rule.level]||rule.level||'À vérifier')}</span></div><p>${escapeHtml(rule.value||rule.detail||'')}</p></article>`).join('');
}

function renderBudgets() {
  const target = budgetTargetEUR();
  const total = projectedBudgetTotal(budget);
  const margin = target - total;
  const rows = budgetRowsFor(budget);
  const counts = budgetStatusCounts(rows);
  const confidence = budgetConfidence();
  const underTarget = margin >= 0;

  $('#budgetTitle').textContent = `Est-ce qu’on reste sous les ${formatEUR(target)} pour deux ?`;
  $('#budgetIntro').textContent = trip.budgetIntro || 'Totaux pour deux personnes, activités sélectionnées incluses.';

  $('#budgetSummary').innerHTML = `
    <div class="budget-answer ${underTarget?'within':'over'}">
      <span>Budget projeté pour 2</span>
      <strong>${formatEUR(total)}</strong>
      <small>${underTarget?'Sous l’objectif':'Au-dessus de l’objectif'}</small>
    </div>
    <div class="budget-overview-metrics">
      <div class="budget-overview-metric"><span>Objectif</span><strong>${formatEUR(target)}</strong></div>
      <div class="budget-overview-metric"><span>${underTarget?'Marge restante':'Dépassement'}</span><strong class="${underTarget?'ok':'over'}">${formatEUR(Math.abs(margin))}</strong></div>
      <div class="budget-overview-metric"><span>Niveau sélectionné</span><strong>${escapeHtml(budget.label)}</strong></div>
      <div class="budget-overview-metric" title="${escapeHtml(confidence.full)}"><span>Confiance globale</span><strong>${escapeHtml(confidence.short)}</strong></div>
    </div>
    <div class="budget-status-summary" aria-label="Répartition des postes par statut">
      ${Object.entries(BUDGET_STATUS_LABELS).map(([key,label])=>`<span class="budget-status-count"><span class="budget-status ${key}">${escapeHtml(label)}</span><strong>${counts[key]}</strong></span>`).join('')}
    </div>`;

  $('#budgetCards').innerHTML = trip.budgets.map(item=>{
    const active = item.id === budget.id;
    const differences = (item.items || []).slice(0,3);
    return `<article class="budget-card budget-card-compact ${active?'active':''}">
      <div class="budget-card-top">
        <div>
          <div class="budget-card-badges">${item.recommended?'<span class="badge">Recommandé</span>':''}${active?'<span class="budget-active-badge">Actif</span>':''}</div>
          <h3>${escapeHtml(item.label)}</h3>
        </div>
        <div class="price">${formatEUR(projectedBudgetTotal(item))}</div>
      </div>
      ${differences.length?`<ul class="budget-card-differences">${differences.map(text=>`<li>${escapeHtml(text)}</li>`).join('')}</ul>`:''}
      <button class="button ${active?'secondary':''}" type="button" data-budget="${escapeHtml(item.id)}" aria-pressed="${active?'true':'false'}">${active?'Sélectionné':'Choisir'}</button>
    </article>`;
  }).join('');

  document.querySelectorAll('[data-budget]').forEach(btn=>btn.onclick=()=>{
    budget=trip.budgets.find(item=>item.id===btn.dataset.budget);
    $('#budgetSelector').value=budget.id;
    canonicalizeUrl();
    render();
  });

  $('#budgetBreakdown').innerHTML = `
    <details class="budget-detail">
      <summary>
        <span><strong>Détail poste par poste</strong><small>${rows.length} poste${rows.length>1?'s':''} · ${escapeHtml(budget.label)}</small></span>
        <span class="budget-detail-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="budget-table-wrap">
        <table class="budget-table">
          <thead><tr><th>Poste</th><th>Statut</th><th>Montant</th></tr></thead>
          <tbody>${rows.map(row=>{
            const status = normalizeBudgetStatus(row.status);
            return `<tr><td>${escapeHtml(row.label)}</td><td><span class="budget-status ${status}">${escapeHtml(BUDGET_STATUS_LABELS[status])}</span></td><td>${formatEUR(row.amount)}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </details>`;

  const drivers = budgetDrivers(5);
  $('#budgetDrivers').innerHTML = `
    <div class="budget-drivers-head">
      <div><p class="eyebrow">Sensibilité</p><h3>Ce qui fait varier le budget</h3></div>
      <p class="muted">Calculé automatiquement à partir des écarts entre les trois niveaux et des activités sélectionnées.</p>
    </div>
    ${drivers.length
      ? `<div class="budget-driver-list">${drivers.map(driver=>`<article class="budget-driver"><span>${escapeHtml(driver.kind)}</span><strong>${escapeHtml(driver.label)}</strong><small>${escapeHtml(driver.detail)}</small></article>`).join('')}</div>`
      : '<p class="muted budget-driver-empty">Pas assez de détail poste par poste pour calculer les principaux écarts.</p>'}`;
}
function renderDays() {
  $('#daysIntro').textContent = variant.daysIntro || '';
  $('#days').innerHTML = (variant.days||[]).map((d,i)=>`<details class="day-card" ${i===0?'open':''}><summary><span>${escapeHtml(d.day)}</span><span>${escapeHtml(d.title)}</span></summary><div class="day-body">${escapeHtml(d.detail||'')}</div></details>`).join('');
}

function renderSources() {
  const t = trip.traceability || {};
  $('#traceability').textContent = `Recherche : ${formatDateFR(t.researchDate)} · tarifs : ${formatDateFR(t.priceDate)} · confiance budget : ${t.budgetConfidence || '—'}`;
  $('#sources').innerHTML = (trip.sources||[]).map(s=>`<div class="source-item"><span class="source-type">${escapeHtml(s.type||'source')}</span><br><a href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a><div>${escapeHtml(s.note||'')}</div><div class="source-meta">consulté ${formatDateFR(s.checkedAt||t.lastChecked)}</div></div>`).join('');
}

function render() {
  renderHero(); renderOverview(); renderVariantCompare(); renderMap(); renderSteps();
  renderActivities(); renderNatureFoodWeather(); renderPractical(); renderBudgets(); renderDays(); renderSources();
  renderTabs();
}

function toast(text){const node=$('#toast');node.textContent=text;node.classList.add('show');setTimeout(()=>node.classList.remove('show'),1800)}
$('#shareBtn').onclick = async () => {
  try {
    if (navigator.share) await navigator.share({title:document.title,url:location.href});
    else { await navigator.clipboard.writeText(location.href); toast('Lien copié'); }
  } catch (err) {
    if (err?.name !== 'AbortError') toast('Partage indisponible');
  }
};

initActivityState();
populateSelectors();
initResponsiveHeader();
initStickyOffset();
canonicalizeUrl();
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
