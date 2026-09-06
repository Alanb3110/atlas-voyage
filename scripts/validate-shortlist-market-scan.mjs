import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const file = 'data/shortlist-market-scan.json';
const data = JSON.parse(await readFile(resolve(root, file), 'utf8'));
const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog.json'), 'utf8'));
const errors = [];
const fail = message => errors.push(`${file}: ${message}`);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const dateMatches = new Set(['exact','nearby','month']);
const confidences = new Set(['high','medium','low']);
const priceStatuses = new Set(['observed','estimated','hypothesis','to_recheck','confirmed']);
const catalogIds = new Set((catalog.trips || []).map(x => x.id));

if (!dateRe.test(data.checkedAt || '')) fail('checkedAt invalide');
if (!dateRe.test(data.targetWindow?.departure || '')) fail('targetWindow.departure invalide');
if (!dateRe.test(data.targetWindow?.return || '')) fail('targetWindow.return invalide');
if (!Number.isFinite(Number(data.travelers)) || Number(data.travelers) < 1) fail('travelers invalide');

const seenTrips = new Set();
const seenObs = new Set();
for (const destination of data.destinations || []) {
  if (!destination.tripId) { fail('destination sans tripId'); continue; }
  if (seenTrips.has(destination.tripId)) fail(`${destination.tripId}: destination dupliquée`);
  seenTrips.add(destination.tripId);
  if (!catalogIds.has(destination.tripId)) fail(`${destination.tripId}: absent du catalogue`);
  if (!destination.arrivalAirport) fail(`${destination.tripId}: arrivalAirport manquant`);
  if (!destination.currentLeader) fail(`${destination.tripId}: currentLeader manquant`);
  if (!confidences.has(destination.leaderConfidence)) fail(`${destination.tripId}: leaderConfidence invalide`);
  const origins = new Set();

  for (const obs of destination.observations || []) {
    if (!obs.id) { fail(`${destination.tripId}: observation sans id`); continue; }
    if (seenObs.has(obs.id)) fail(`${obs.id}: id observation dupliqué`);
    seenObs.add(obs.id);
    origins.add(obs.origin);
    if (!obs.origin || !obs.destination || !obs.airline) fail(`${obs.id}: origine/destination/airline manquant`);
    if (!dateMatches.has(obs.dateMatch)) fail(`${obs.id}: dateMatch invalide`);
    if (!dateRe.test(obs.checkedAt || '')) fail(`${obs.id}: checkedAt invalide`);
    if (!/^https:\/\//.test(obs.source || '')) fail(`${obs.id}: source HTTPS manquante`);
    if (!confidences.has(obs.confidence)) fail(`${obs.id}: confidence invalide`);
    if (!Number.isFinite(Number(obs.price?.value)) || Number(obs.price.value) < 0) fail(`${obs.id}: price.value invalide`);
    if (!obs.price?.currency) fail(`${obs.id}: price.currency manquante`);
    if (!priceStatuses.has(obs.price?.status)) fail(`${obs.id}: price.status invalide`);
    if (obs.price?.status === 'observed' && !obs.source) fail(`${obs.id}: prix observé sans source`);

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
    if (hasDates && (!dateRe.test(obs.observedDates.departure) || !dateRe.test(obs.observedDates.return))) {
      fail(`${obs.id}: observedDates invalides`);
    }
  }

  if (!(destination.observations || []).length) fail(`${destination.tripId}: aucune observation`);
  if (!origins.has(destination.currentLeader)) fail(`${destination.tripId}: currentLeader absent des observations`);
}

if (seenTrips.size !== 3) fail(`attendu 3 destinations shortlist, trouvé ${seenTrips.size}`);

if (errors.length) {
  console.error(`\nErreurs scan marché (${errors.length})`);
  errors.forEach(x => console.error(`- ${x}`));
  process.exit(1);
}
console.log(`\nValidation scan marché OK: ${seenTrips.size} destinations, ${seenObs.size} observations tarifaires.`);
