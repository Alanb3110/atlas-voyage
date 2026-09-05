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
  $('#hero').style.backgroundImage = `url('${trip.meta.heroImage || ''}')`;
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
  const items = [['overview','Synthèse'],['mapSection','Carte'],['stepsSection','Étapes'],['budgetSection','Budgets'],['daysSection','Programme'],['sourcesSection','Sources']];
  $('#sectionNav').innerHTML = items.map(([id,label])=>`<a href="#${id}">${label}</a>`).join('');
}

function renderOverview() {
  $('#overviewIntro').textContent = variant.overviewIntro || '';
  $('#summaryCards').innerHTML = (variant.summary || []).map(x=>`<article class="summary-card"><div class="metric">${escapeHtml(x.value)}</div><p>${escapeHtml(x.text)}</p></article>`).join('');
}

function lodgingFor(step) {
  return step.lodging?.[budget.id] || step.lodging?.[trip.defaultBudget] || 'À sélectionner';
}

function renderMap() {
  const steps = variant.steps || [];
  $('#stops').innerHTML = steps.map((s,i)=>`<article class="stop" data-stop="${i}"><div class="stop-num">${i+1}</div><div><h3>${escapeHtml(s.name)}</h3><small>${escapeHtml(s.nights)}</small><p>${escapeHtml(s.summary)}</p></div></article>`).join('');
  if (!window.L || !steps.length) return;
  if (map) map.remove();
  map = L.map('map',{scrollWheelZoom:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(map);
  const coords = steps.map(s=>s.coords);
  L.polyline(coords,{weight:4,dashArray:'8 8',opacity:.75}).addTo(map);
  const markers = steps.map((s,i)=>L.marker(s.coords).addTo(map).bindPopup(`<strong>${escapeHtml(s.name)}</strong><br>${escapeHtml(s.nights)}`));
  map.fitBounds(coords,{padding:[40,40]});
  document.querySelectorAll('.stop').forEach((node,i)=>node.onclick=()=>{map.flyTo(steps[i].coords,9);markers[i].openPopup();});
}

function renderSteps() {
  $('#steps').innerHTML = (variant.steps||[]).map(s=>`<article class="step-card"><div class="step-copy"><h3>${escapeHtml(s.name)}</h3><p><strong>${escapeHtml(s.nights)}</strong> — ${escapeHtml(s.summary)}</p><p><strong>Transfert :</strong> ${escapeHtml(s.transfer||'—')}<br><strong>Fatigue :</strong> ${escapeHtml(s.fatigue||'—')}</p><div class="selected-lodging"><strong>${escapeHtml(budget.label)} :</strong><br>${escapeHtml(lodgingFor(s))}</div><div class="chips">${(s.tags||[]).map(t=>`<span class="chip">${escapeHtml(t)}</span>`).join('')}</div></div></article>`).join('');
}

function renderBudgets() {
  $('#budgetIntro').textContent = trip.budgetIntro || '';
  $('#budgetCards').innerHTML = trip.budgets.map(b=>`<article class="budget-card ${b.id===budget.id?'active':''}">${b.recommended?'<span class="badge">Recommandé</span>':''}<h3>${escapeHtml(b.label)}</h3><div class="price">${formatEUR(b.total)}</div><ul>${(b.items||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><button class="button ${b.id===budget.id?'secondary':''}" data-budget="${escapeHtml(b.id)}">${b.id===budget.id?'Sélectionné':'Choisir'}</button></article>`).join('');
  document.querySelectorAll('[data-budget]').forEach(btn=>btn.onclick=()=>{budget=trip.budgets.find(b=>b.id===btn.dataset.budget);$('#budgetSelector').value=budget.id;canonicalizeUrl();render();});
  $('#budgetBreakdown').innerHTML = `<table class="budget-table"><thead><tr><th>Poste</th><th>Statut</th><th>Montant</th></tr></thead><tbody>${(budget.breakdown||[]).map(r=>`<tr><td>${escapeHtml(r.label)}</td><td>${escapeHtml(r.status||'estimé')}</td><td>${formatEUR(r.amount)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td>${formatEUR(budget.total)}</td></tr></tfoot></table>`;
}

function renderDays() {
  $('#daysIntro').textContent = variant.daysIntro || '';
  $('#days').innerHTML = (variant.days||[]).map((d,i)=>`<details class="day-card" ${i===0?'open':''}><summary><span>${escapeHtml(d.day)}</span><span>${escapeHtml(d.title)}</span></summary><div class="day-body">${escapeHtml(d.detail||'')}</div></details>`).join('');
}

function renderSources() {
  const t = trip.traceability || {};
  $('#traceability').textContent = `Recherche : ${formatDateFR(t.researchDate)} · tarifs : ${formatDateFR(t.priceDate)} · confiance budget : ${t.budgetConfidence || '—'}`;
  $('#sources').innerHTML = (trip.sources||[]).map(s=>`<div class="source-item"><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a><div>${escapeHtml(s.note||'')}</div><div class="source-meta">${escapeHtml(s.type||'source')} · consulté ${formatDateFR(s.checkedAt||t.lastChecked)}</div></div>`).join('');
}

function render() { renderHero(); renderNav(); renderOverview(); renderMap(); renderSteps(); renderBudgets(); renderDays(); renderSources(); }
function toast(text){const node=$('#toast');node.textContent=text;node.classList.add('show');setTimeout(()=>node.classList.remove('show'),1800)}
$('#shareBtn').onclick = async () => { try { await navigator.clipboard.writeText(location.href); toast('Lien copié'); } catch { toast('Copie du lien indisponible'); } };

canonicalizeUrl();
populateSelectors();
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
