import { loadCatalog, loadTrip, params, buildTripUrl, formatEUR, formatDateFR, escapeHtml } from './store.js';

const $ = s => document.querySelector(s);
const p = params();
const catalog = await loadCatalog();
let entry = catalog.trips.find(t => t.id === p.get('trip')) || catalog.trips[0];
if (!entry) throw new Error('Aucun voyage dans le catalogue.');
let trip = await loadTrip(entry.dataFile);
let variant = trip.variants.find(v => v.id === p.get('variant')) || trip.variants.find(v => v.id === trip.defaultVariant) || trip.variants[0];
let budget = trip.budgets.find(b => b.id === p.get('budget')) || trip.budgets.find(b => b.id === trip.defaultBudget) || trip.budgets[0];
let map;
let navObserver;

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
  history.replaceState(null, '', buildTripUrl(trip.id, variant.id, budget.id));
}

function populateSelectors() {
  $('#tripSelector').innerHTML = catalog.trips.map(t => `<option value="${escapeHtml(t.id)}" ${t.id===trip.id?'selected':''}>${escapeHtml(t.title)}</option>`).join('');
  $('#variantSelector').innerHTML = trip.variants.map(v => `<option value="${escapeHtml(v.id)}" ${v.id===variant.id?'selected':''}>${escapeHtml(v.label)}</option>`).join('');
  $('#budgetSelector').innerHTML = trip.budgets.map(b => `<option value="${escapeHtml(b.id)}" ${b.id===budget.id?'selected':''}>${escapeHtml(b.label)}</option>`).join('');
  $('#tripSelector').onchange = e => location.href = buildTripUrl(e.target.value);
  $('#variantSelector').onchange = e => { variant = trip.variants.find(v=>v.id===e.target.value); canonicalizeUrl(); render(); };
  $('#budgetSelector').onchange = e => { budget = trip.budgets.find(b=>b.id===e.target.value); canonicalizeUrl(); render(); };
}

function renderHero() {
  document.title = `${trip.meta.title} — Atlas Voyage`;
  $('#hero').style.backgroundImage = `url('${safeUrl(trip.meta.heroImage || '')}')`;
  $('#heroEyebrow').textContent = `${variant.label} · ${budget.label}`;
  $('#tripTitle').textContent = trip.meta.title;
  $('#tripSubtitle').textContent = variant.subtitle || trip.meta.subtitle || '';
  $('#heroTags').innerHTML = [trip.meta.travelers,trip.meta.duration,trip.meta.dates,trip.meta.departure].filter(Boolean).map(x=>`<span class="chip light">${escapeHtml(x)}</span>`).join('');
  const kpis = [
    ['Budget', formatEUR(budget.total)],
    ['Option', variant.label],
    ['Rythme', variant.rhythm || '—'],
    ['Vérifié', formatDateFR(trip.traceability?.lastChecked)]
  ];
  $('#kpis').innerHTML = kpis.map(([a,b])=>`<div class="kpi"><span>${escapeHtml(a)}</span><strong>${escapeHtml(b)}</strong></div>`).join('');
}

function renderNav() {
  const items = [
    ['overview','Synthèse'],['compareSection','Options'],['mapSection','Carte'],['stepsSection','Étapes'],
    ['wildlifeSection','Faune'],['foodSection','Cuisine'],['weatherSection','Météo'],
    ['practicalSection','Santé & sécurité'],['rulesSection','Règles'],['budgetSection','Budgets'],
    ['daysSection','Programme'],['sourcesSection','Sources']
  ];
  $('#sectionNav').innerHTML = items.map(([id,label])=>`<a href="#${id}" data-section="${id}">${label}</a>`).join('');
  navObserver?.disconnect();
  navObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(x=>x.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if (!visible) return;
    document.querySelectorAll('#sectionNav a').forEach(a=>a.classList.toggle('active', a.dataset.section===visible.target.id));
  }, {rootMargin:'-28% 0px -62% 0px',threshold:[0,.15,.35]});
  items.forEach(([id])=>{const node=document.getElementById(id);if(node)navObserver.observe(node)});
}

function renderOverview() {
  $('#overviewIntro').textContent = variant.overviewIntro || trip.overviewIntro || '';
  const summary = variant.summary?.length ? variant.summary : (trip.summary || []);
  $('#summaryCards').innerHTML = summary.map(x=>`<article class="summary-card"><div class="metric">${escapeHtml(x.value)}</div><p>${escapeHtml(x.text)}</p></article>`).join('');
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
    $('#variantSelector').value = variant.id;
    canonicalizeUrl();
    render();
  });
}

function lodgingFor(step) {
  return step.lodging?.[budget.id] || step.lodging?.[trip.defaultBudget] || 'À sélectionner';
}

function renderMap() {
  const steps = variant.steps || [];
  const routes = variant.routes || [];
  $('#mapNote').textContent = variant.mapNote || (routes.some(r=>r.real===false) ? 'Les liaisons pointillées sont schématiques et ne représentent pas un itinéraire routier ou maritime exact.' : 'Tracés issus des données du voyage.');
  $('#stops').innerHTML = steps.map((s,i)=>`<article class="stop" data-stop="${i}"><div class="stop-num">${i+1}</div><div><h3>${escapeHtml(s.name)}</h3><small>${escapeHtml(s.nights)}</small><p>${escapeHtml(s.summary)}</p></div></article>`).join('');
  if (!window.L || !steps.length) return;
  if (map) map.remove();
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
  const markers = steps.map((s,i)=>L.marker(s.coords,{icon:L.divIcon({className:'atlas-marker',html:`<div class="marker-pin"><span>${i+1}</span></div>`,iconSize:[34,34],iconAnchor:[17,32]})}).addTo(map).bindPopup(`<strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.nights)}<br>${escapeHtml(s.summary||'')}`));
  map.fitBounds(allCoords,{padding:[40,40]});
  document.querySelectorAll('.stop').forEach((node,i)=>node.onclick=()=>{
    document.querySelectorAll('.stop').forEach(x=>x.classList.remove('active'));
    node.classList.add('active');
    map.flyTo(steps[i].coords,9);
    markers[i].openPopup();
  });
  const unique = [...new Map(routes.map(r=>[r.type,r])).values()];
  $('#mapLegend').innerHTML = unique.map(r=>{
    const meta=ROUTE_STYLES[r.type]||{label:r.type||'Liaison'};
    return `<span class="legend-item"><span class="legend-line ${escapeHtml(r.type||'')} ${r.real===false?'schematic':''}"></span>${escapeHtml(meta.label)}${r.real===false?' · schématique':''}</span>`;
  }).join('');
  setTimeout(()=>map.invalidateSize(),100);
}

function detailBlock(label,value) {
  if (!value) return '';
  return `<div class="step-detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderSteps() {
  $('#steps').innerHTML = (variant.steps||[]).map(s=>{
    const image = s.image ? `<img class="step-image" loading="lazy" src="${safeUrl(s.image)}" alt="${escapeHtml(s.name)}">` : '';
    const details = [
      ['Faune',s.wildlife],['Plage / eau',s.beach],['Culture',s.culture],['Gastronomie',s.food],
      ['Activité',s.activity],['Fréquentation',s.crowding],['Météo',s.weather],['Sécurité',s.safety]
    ].map(([a,b])=>detailBlock(a,b)).join('');
    return `<article class="step-card ${image?'has-image':''}">${image}<div class="step-copy"><h3>${escapeHtml(s.name)}</h3><p><strong>${escapeHtml(s.nights)}</strong> — ${escapeHtml(s.summary)}</p><p><strong>Transfert :</strong> ${escapeHtml(s.transfer||'—')}<br><strong>Fatigue :</strong> ${escapeHtml(s.fatigue||'—')}</p>${details?`<div class="step-details">${details}</div>`:''}${s.signature?`<div class="signature"><strong>Expérience signature :</strong> ${escapeHtml(s.signature)}</div>`:''}<div class="selected-lodging"><strong>${escapeHtml(budget.label)} :</strong><br>${escapeHtml(lodgingFor(s))}</div><div class="chips">${(s.tags||[]).map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join('')}</div></div></article>`;
  }).join('');
}

function normalizeItem(item) {
  if (Array.isArray(item)) return {label:item[0],value:item[1],warn:Boolean(item[2])};
  return {label:item.label||'',value:item.value||'',warn:Boolean(item.warn)};
}

function renderInfoCards(selector,cards=[]) {
  $(selector).innerHTML = cards.map(card=>`<article class="info-card"><h3>${escapeHtml(card.title)}</h3>${card.note?`<p class="muted">${escapeHtml(card.note)}</p>`:''}<div class="info-rows">${(card.items||[]).map(raw=>{const item=normalizeItem(raw);const warn=item.warn||/à vérifier|variable|moyen|possible|non évalué|à rechercher/i.test(item.value);return `<div class="info-row"><span>${escapeHtml(item.label)}</span><span class="value-pill ${warn?'warn':''}">${escapeHtml(item.value)}</span></div>`}).join('')}</div></article>`).join('');
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
  $('#budgetIntro').textContent = trip.budgetIntro || '';
  $('#budgetCards').innerHTML = trip.budgets.map(b=>`<article class="budget-card ${b.id===budget.id?'active':''}">${b.recommended?'<span class="badge">Recommandé</span>':''}<h3>${escapeHtml(b.label)}</h3><div class="price">${formatEUR(b.total)}</div><ul>${(b.items||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><button class="button ${b.id===budget.id?'secondary':''}" data-budget="${escapeHtml(b.id)}">${b.id===budget.id?'Sélectionné':'Choisir'}</button></article>`).join('');
  document.querySelectorAll('[data-budget]').forEach(btn=>btn.onclick=()=>{budget=trip.budgets.find(b=>b.id===btn.dataset.budget);$('#budgetSelector').value=budget.id;canonicalizeUrl();render();});
  const rows = budget.breakdown || [];
  const sum = rows.reduce((acc,r)=>acc+(Number(r.amount)||0),0);
  const delta = (Number(budget.total)||0)-sum;
  $('#budgetBreakdown').innerHTML = `<table class="budget-table"><thead><tr><th>Poste</th><th>Statut</th><th>Montant</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.label)}</td><td><span class="budget-status ${/estim/i.test(r.status||'')?'estimated':''}">${escapeHtml(r.status||'estimé')}</span></td><td>${formatEUR(r.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td>${formatEUR(budget.total)}</td></tr></tfoot></table><div class="budget-reconcile">Somme des postes : ${formatEUR(sum)}${Math.abs(delta)>1?` · écart à expliquer : ${formatEUR(delta)}`:' · cohérent avec le total affiché'}.</div>`;
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
  renderHero(); renderNav(); renderOverview(); renderVariantCompare(); renderMap(); renderSteps();
  renderNatureFoodWeather(); renderPractical(); renderBudgets(); renderDays(); renderSources();
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

canonicalizeUrl();
populateSelectors();
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
