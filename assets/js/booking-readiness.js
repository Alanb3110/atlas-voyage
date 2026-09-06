import { params, escapeHtml, formatDateFR } from './store.js';

const section = document.querySelector('#bookingSection');
if (!section) throw new Error('bookingSection absent du DOM');

const tripId = params().get('trip');
if (!tripId) section.hidden = true;
else init().catch(error => {
  console.warn('Suivi réservation indisponible:', error);
  section.hidden = true;
});

const STATUS = {
  research: { label: 'À rechercher', progress: 0.15 },
  shortlisted: { label: 'Présélectionné', progress: 0.45 },
  verified: { label: 'Vérifié', progress: 0.75 },
  booked: { label: 'Réservé', progress: 1 },
  recheck: { label: 'À revérifier', progress: 0.5 },
  not_needed: { label: 'Non nécessaire', progress: null }
};

const READINESS = {
  blocked: 'Pas encore réservable',
  decision_ready: 'Prêt à arbitrer',
  booking_ready: 'Prêt à réserver',
  booked: 'Réservé'
};

async function init() {
  const response = await fetch(`./data/booking-status/${encodeURIComponent(tripId)}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.tripId !== tripId) throw new Error('tripId incohérent');
  render(data);
  ensureNavLink();
}

function render(data) {
  const items = data.items || [];
  const active = items.filter(item => STATUS[item.status]?.progress != null);
  const progress = active.length ? active.reduce((sum, item) => sum + (STATUS[item.status]?.progress ?? 0), 0) / active.length * 100 : 0;
  const booked = items.filter(item => item.status === 'booked').length;
  const verified = items.filter(item => item.status === 'verified').length;
  const recheck = items.filter(item => item.status === 'recheck').length;
  const readiness = data.readiness;
  const blockerIds = new Set(readiness?.blockerIds || []);
  const blockers = items.filter(item => blockerIds.has(item.id));

  document.querySelector('#bookingIntro').textContent = data.intro || 'Suivi des éléments à rechercher, vérifier puis réserver.';
  document.querySelector('#bookingSummary').innerHTML = readiness ? `
    <article class="booking-progress-card">
      <div>
        <p class="eyebrow">État de préparation</p>
        <h3>${escapeHtml(READINESS[readiness.state] || readiness.state || 'Inconnu')}</h3>
        <p>${blockers.length} bloqueur${blockers.length > 1 ? 's' : ''} actif${blockers.length > 1 ? 's' : ''} · ${verified} vérifié(s) · ${booked} réservé(s)</p>
        <p><strong>Prochaine action :</strong> ${escapeHtml(readiness.nextAction || '—')}</p>
      </div>
      <div class="booking-progress-track" title="Avancement documentaire indicatif"><div class="booking-progress-fill" style="width:${Math.max(0,Math.min(100,progress))}%"></div></div>
    </article>` : `
    <article class="booking-progress-card">
      <div><p class="eyebrow">Avancement documentaire</p><h3>${Math.round(progress)} %</h3><p>${booked} réservé(s) · ${verified} vérifié(s) · ${recheck} à revérifier</p></div>
      <div class="booking-progress-track"><div class="booking-progress-fill" style="width:${Math.max(0,Math.min(100,progress))}%"></div></div>
    </article>`;

  const groups = [...new Set(items.map(item => item.category || 'Autre'))];
  document.querySelector('#bookingGroups').innerHTML = groups.map(group => `
    <article class="booking-group">
      <div class="booking-group-head"><h3>${escapeHtml(group)}</h3><span>${items.filter(i => (i.category || 'Autre') === group).length} élément(s)</span></div>
      <div class="booking-items">
        ${items.filter(i => (i.category || 'Autre') === group).map(item => renderItem(item, blockerIds.has(item.id))).join('')}
      </div>
    </article>`).join('');

  const traceDate = data.checkedAt || data.updatedAt;
  document.querySelector('#bookingTrace').textContent = `${data.status === 'demo' ? 'Données de démonstration' : 'État du voyage'} · ${traceDate ? formatDateFR(traceDate) : 'date inconnue'}${data.publicNote ? ` · ${data.publicNote}` : ''}`;
}

function renderItem(item, isBlocker = false) {
  const meta = STATUS[item.status] || { label: item.status || 'Inconnu' };
  return `<div class="booking-item">
    <div class="booking-item-main"><strong>${escapeHtml(item.label || '')}</strong><span>${escapeHtml(item.note || '')}</span></div>
    <div class="booking-item-side">
      ${isBlocker ? '<span class="booking-status research">Bloquant</span>' : ''}
      <span class="booking-status ${escapeHtml(item.status || 'research')}">${escapeHtml(meta.label)}</span>
      ${item.checkedAt ? `<small>${formatDateFR(item.checkedAt)}</small>` : ''}
    </div>
  </div>`;
}

function ensureNavLink() {
  const nav = document.querySelector('#sectionNav');
  if (!nav || nav.querySelector('[data-section="bookingSection"]')) return;
  const link = document.createElement('a');
  link.href = '#bookingSection';
  link.dataset.section = 'bookingSection';
  link.textContent = 'Préparation';
  const after = nav.querySelector('[data-section="budgetSection"]');
  if (after) after.insertAdjacentElement('afterend', link); else nav.appendChild(link);

  const observer = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a === link));
  }, { rootMargin: '-28% 0px -62% 0px', threshold: [0, .15, .35] });
  observer.observe(section);
}
