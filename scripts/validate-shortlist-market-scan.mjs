import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const file = 'data/shortlist-market-scan.json';
const data = JSON.parse(await readFile(resolve(root, file), 'utf8'));
const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog.json'), 'utf8'));
const access = JSON.parse(await readFile(resolve(root, 'data/airport-access/reims-airports.json'), 'utf8'));
const errors = [];
const fail = message => errors.push(`${file}: ${message}`);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const finiteNumber = value => typeof value === 'number' && Number.isFinite(value);
const dateMatches = new Set(['exact','nearby','month']);
const budgetUses = new Set(['exact_budget_candidate','signal_only']);
const confidences = new Set(['high','medium','low']);
const priceStatuses = new Set(['observed','estimated','hypothesis','to_recheck','confirmed']);
const catalogById = new Map((catalog.trips || []).map(x => [x.id, x]));
const airportCodes = new Set((access.airports || []).map(x => x.code));
const researchedStages = new Set(['shortlist','selected','detailed','bookable','booked']);
const day = value => Date.parse(`${value}T00:00:00Z`);

if (data.schemaVersion !== 2) fail(`schemaVersion attendu=2, trouvé ${data.schemaVersion}`);
if (!dateRe.test(data.checkedAt || '')) fail('checkedAt invalide');
if (!dateRe.test(data.targetWindow?.departure || '')) fail('targetWindow.departure invalide');
if (!dateRe.test(data.targetWindow?.return || '')) fail('targetWindow.return invalide');
if (dateRe.test(data.targetWindow?.departure || '') && dateRe.test(data.targetWindow?.return || '') && day(data.targetWindow.return) <= day(data.targetWindow.departure)) fail('targetWindow ordre invalide');
if (!finiteNumber(data.travelers) || data.travelers < 1) fail('travelers invalide');

const seenTrips = new Set();
const seenObs = new Set();
for (const destination of data.destinations || []) {
  if (!destination.tripId) { fail('destination sans tripId'); continue; }
  if (seenTrips.has(destination.tripId)) fail(`${destination.tripId}: destination dupliquée`);
  seenTrips.add(destination.tripId);
  const catalogTrip = catalogById.get(destination.tripId);
  if (!catalogTrip) fail(`${destination.tripId}: absent du catalogue`);
  else if (!researchedStages.has(catalogTrip.status)) fail(`${destination.tripId}: scan marché exige maturité shortlist ou supérieure, statut catalogue=${catalogTrip.status}`);
  if (!destination.arrivalAirport) fail(`${destination.tripId}: arrivalAirport manquant`);
  if (!destination.currentLeader) fail(`${destination.tripId}: currentLeader manquant`);
  if (!confidences.has(destination.leaderConfidence)) fail(`${destination.tripId}: leaderConfidence invalide`);
  const origins = new Set();

  for (const obs of destination.observations || []) {
    if (!obs.id) { fail(`${destination.tripId}: observation sans id`); continue; }
    if (seenObs.has(obs.id)) fail(`${obs.id}: id observation dupliqué`);
    seenObs.add(obs.id);
    if (origins.has(obs.origin)) fail(`${destination.tripId}: plusieurs observations pour l'origine ${obs.origin}; agréger ou identifier explicitement le produit de comparaison`);
    origins.add(obs.origin);
    if (!obs.origin || !obs.destination || !obs.airline) fail(`${obs.id}: origine/destination/airline manquant`);
    if (!airportCodes.has(obs.origin)) fail(`${obs.id}: origine ${obs.origin} absente de la base Reims`);
    if (obs.destination !== destination.arrivalAirport) fail(`${obs.id}: destination ${obs.destination} ≠ arrivalAirport ${destination.arrivalAirport}`);
    if (!dateMatches.has(obs.dateMatch)) fail(`${obs.id}: dateMatch invalide`);
    if (!budgetUses.has(obs.budgetUse)) fail(`${obs.id}: budgetUse invalide`);
    if (obs.dateMatch === 'exact' && obs.budgetUse !== 'exact_budget_candidate') fail(`${obs.id}: dateMatch exact exige budgetUse=exact_budget_candidate`);
    if (obs.dateMatch !== 'exact' && obs.budgetUse !== 'signal_only') fail(`${obs.id}: budgetUse incompatible avec dateMatch=${obs.dateMatch}`);
    if (!dateRe.test(obs.checkedAt || '')) fail(`${obs.id}: checkedAt invalide`);
    if (!/^https:\/\//.test(obs.source || '')) fail(`${obs.id}: source HTTPS manquante`);
    if (!confidences.has(obs.confidence)) fail(`${obs.id}: confidence invalide`);
    if (!finiteNumber(obs.price?.value) || obs.price.value < 0) fail(`${obs.id}: price.value invalide`);
    if (!obs.price?.currency) fail(`${obs.id}: price.currency manquante`);
    if (!priceStatuses.has(obs.price?.status)) fail(`${obs.id}: price.status invalide`);
    if (obs.price?.status === 'observed' && !obs.source) fail(`${obs.id}: prix observé sans source`);
    if (!Number.isInteger(obs.stops) || obs.stops < 0) fail(`${obs.id}: stops invalide`);
    if (obs.flightDurationMin != null && (!finiteNumber(obs.flightDurationMin) || obs.flightDurationMin <= 0)) fail(`${obs.id}: flightDurationMin invalide`);

    const hasDates = Boolean(obs.observedDates?.departure && obs.observedDates?.return);
    if (obs.dateMatch === 'exact') {
      if (!hasDates) fail(`${obs.id}: exact exige observedDates`);
      if (obs.observedDates?.departure !== data.targetWindow.departure || obs.observedDates?.return !== data.targetWindow.return) {
        fail(`${obs.id}: dateMatch exact mais dates différentes de la cible`);
      }
    }
    if (obs.dateMatch === 'nearby') {
      if (!hasDates) fail(`${obs.id}: nearby exige observedDates`);
      if (obs.observedDates?.departure === data.targetWindow.departure && obs.observedDates?.return === data.targetWindow.return) {
        fail(`${obs.id}: dates exactes mais dateMatch=nearby`);
      }
    }
    if (obs.dateMatch === 'month' && hasDates) fail(`${obs.id}: month ne doit pas exposer observedDates comme une paire tarifaire`);
    if (hasDates) {
      if (!dateRe.test(obs.observedDates.departure) || !dateRe.test(obs.observedDates.return)) fail(`${obs.id}: observedDates invalides`);
      else if (day(obs.observedDates.return) <= day(obs.observedDates.departure)) fail(`${obs.id}: observedDates ordre invalide`);
    }
  }

  if (!(destination.observations || []).length) fail(`${destination.tripId}: aucune observation`);
  if (!origins.has(destination.currentLeader)) fail(`${destination.tripId}: currentLeader absent des observations`);
}

const shortlistIds = new Set((catalog.trips || []).filter(x => x.status === 'shortlist').map(x => x.id));
for (const id of shortlistIds) if (!seenTrips.has(id)) fail(`${id}: shortlist catalogue absente du scan marché`);
if (seenTrips.size !== 3) fail(`scan actuel attendu sur 3 destinations approfondies, trouvé ${seenTrips.size}`);

if (errors.length) {
  console.error(`\nErreurs scan marché (${errors.length})`);
  errors.forEach(x => console.error(`- ${x}`));
  process.exit(1);
}
console.log(`\nValidation scan marché OK: ${seenTrips.size} destinations approfondies, ${seenObs.size} observations tarifaires.`);
