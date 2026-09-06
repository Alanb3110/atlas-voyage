import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const file = 'data/airport-access/reims-ground-costs.json';
const data = JSON.parse(await readFile(resolve(root, file), 'utf8'));
const access = JSON.parse(await readFile(resolve(root, 'data/airport-access/reims-airports.json'), 'utf8'));
const errors = [];
const fail = message => errors.push(`${file}: ${message}`);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const finite = value => Number.isFinite(Number(value));
const requiredCodes = new Set((access.airports || []).map(item => item.code));

if (!validDate(data.checkedAt)) fail('checkedAt invalide');
if (!finite(data.tripDurationDays) || Number(data.tripDurationDays) <= 0) fail('tripDurationDays invalide');
if (!Array.isArray(data.airports)) fail('airports doit être un tableau');

const seen = new Set();
for (const airport of data.airports || []) {
  const code = airport.code || '???';
  if (!requiredCodes.has(code)) fail(`${code}: absent de la base d'accès Reims`);
  if (seen.has(code)) fail(`${code}: dupliqué`);
  seen.add(code);

  const road = airport.road;
  if (!road || typeof road !== 'object') { fail(`${code}: road manquant`); continue; }
  if (!/^https:\/\//.test(road.source || '')) fail(`${code}: source route HTTPS manquante`);
  for (const key of ['fuelEUR','tollEUR']) {
    const range = road.oneWay?.[key];
    if (!range || !finite(range.low) || !finite(range.high) || Number(range.low) < 0 || Number(range.high) < Number(range.low)) {
      fail(`${code}: plage ${key} invalide`);
    }
  }
  const round = road.roundTripRouteEUR;
  if (!round || !finite(round.low) || !finite(round.high) || Number(round.low) < 0 || Number(round.high) < Number(round.low)) {
    fail(`${code}: roundTripRouteEUR invalide`);
  } else if (road.oneWay?.fuelEUR && road.oneWay?.tollEUR) {
    const expectedLow = 2 * (Number(road.oneWay.fuelEUR.low) + Number(road.oneWay.tollEUR.low));
    const expectedHigh = 2 * (Number(road.oneWay.fuelEUR.high) + Number(road.oneWay.tollEUR.high));
    if (Math.abs(Number(round.low) - expectedLow) > 0.02) fail(`${code}: roundTripRouteEUR.low ${round.low} ≠ ${expectedLow.toFixed(2)}`);
    if (Math.abs(Number(round.high) - expectedHigh) > 0.02) fail(`${code}: roundTripRouteEUR.high ${round.high} ≠ ${expectedHigh.toFixed(2)}`);
  }

  const parking = airport.parking20Days;
  if (!parking || typeof parking !== 'object') fail(`${code}: parking20Days manquant`);
  else {
    if (!/^https:\/\//.test(parking.source || '')) fail(`${code}: source parking HTTPS manquante`);
    const hasValue = finite(parking.valueEUR);
    if (['to_recheck','dynamic'].includes(parking.status) && hasValue) fail(`${code}: parking ${parking.status} ne doit pas avoir de valueEUR numérique`);
    if (parking.status === 'calculated_from_published_rates' && (!hasValue || Number(parking.valueEUR) < 0)) fail(`${code}: parking calculé sans valueEUR valide`);
    if (parking.publishedBenchmark) {
      if (!finite(parking.publishedBenchmark.durationDays) || !finite(parking.publishedBenchmark.fromEUR)) fail(`${code}: publishedBenchmark parking invalide`);
    }
  }

  const rail = airport.railFare;
  if (!rail || typeof rail !== 'object') fail(`${code}: railFare manquant`);
  else {
    if (!/^https:\/\//.test(rail.source || '')) fail(`${code}: source rail HTTPS manquante`);
    if (rail.oneWayPerPersonFromEUR != null && (!finite(rail.oneWayPerPersonFromEUR) || Number(rail.oneWayPerPersonFromEUR) < 0)) fail(`${code}: oneWayPerPersonFromEUR invalide`);
  }
}

for (const code of requiredCodes) if (!seen.has(code)) fail(`${code}: coût terrestre manquant`);
if (seen.size !== requiredCodes.size) fail(`attendu ${requiredCodes.size} aéroports, trouvé ${seen.size}`);

if (errors.length) {
  console.error(`\nErreurs coûts terrestres (${errors.length})`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`\nValidation coûts terrestres OK: ${seen.size} aéroports.`);
