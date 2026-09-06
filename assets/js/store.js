export async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Erreur ${res.status} lors du chargement de ${path}`);
  return res.json();
}

export const loadCatalog = () => fetchJson('./data/catalog.json');
export const loadTrip = (path) => fetchJson(path.startsWith('.') ? path : `./${path}`);

export function params() { return new URLSearchParams(location.search); }
export function buildTripUrl(trip, variant = '', budget = '') {
  const p = new URLSearchParams();
  if (trip) p.set('trip', trip);
  if (variant) p.set('variant', variant);
  if (budget) p.set('budget', budget);
  return `./trip.html?${p.toString()}`;
}
export function statusLabel(status) {
  return ({
    longlist:'Longlist',
    shortlist:'Shortlist',
    selected:'Sélectionné',
    detailed:'Itinéraire détaillé',
    bookable:'Réservable',
    booked:'Réservé',
    archived:'Archivé',
    research:'À l’étude'
  })[status] || status || '—';
}
export function formatEUR(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(value));
}
export function formatDateFR(value) {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(d);
}
export function escapeHtml(value='') {
  return String(value).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
}
