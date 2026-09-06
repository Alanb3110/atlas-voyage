import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const file = 'data/shortlist-gateway-geometry.json';
const data = JSON.parse(await readFile(resolve(root, file), 'utf8'));
const market = JSON.parse(await readFile(resolve(root, 'data/shortlist-market-scan.json'), 'utf8'));
const errors = [];
const fail = message => errors.push(`${file}: ${message}`);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const alignments = new Set(['mismatch_in_current_market_scan','aligned_with_internal_inbound_transfer','aligned_with_ground_transfer']);
const geometryTypes = new Set(['open_jaw','roundtrip_gateway']);
const marketByTrip = new Map((market.destinations || []).map(item => [item.tripId, item]));

if (!dateRe.test(data.checkedAt || '')) fail('checkedAt invalide');
if (!Number.isFinite(Number(data.airportMarginMin?.value)) || Number(data.airportMarginMin.value) < 0) fail('airportMarginMin.value invalide');
if (data.airportMarginMin?.status !== 'hypothesis') fail('airportMarginMin doit rester hypothesis tant qu’aucun vol exact n’est figé');

const seen = new Set();
for (const item of data.destinations || []) {
  const id = item.tripId || '???';
  if (seen.has(id)) fail(`${id}: destination dupliquée`);
  seen.add(id);
  if (!marketByTrip.has(id)) fail(`${id}: absent du scan marché`);
  if (!item.firstBase || !item.finalBase) fail(`${id}: firstBase/finalBase manquant`);
  if (!alignments.has(item.alignment)) fail(`${id}: alignment invalide`);
  const geometry = item.preferredGeometry;
  if (!geometry || !geometryTypes.has(geometry.type)) fail(`${id}: preferredGeometry.type invalide`);
  if (!geometry?.inboundGateway || !geometry?.outboundGateway) fail(`${id}: gateways préféré(s) manquants`);
  if (!geometry?.status) fail(`${id}: preferredGeometry.status manquant`);

  if (item.alignment === 'mismatch_in_current_market_scan') {
    if (item.currentMarketScan?.role !== 'price_signal_only') fail(`${id}: mismatch doit être price_signal_only`);
    const gateway = item.currentMarketScan?.gateway;
    if (!gateway) fail(`${id}: currentMarketScan.gateway manquant`);
    const observations = marketByTrip.get(id)?.observations || [];
    if (gateway && !observations.some(obs => obs.destination === gateway)) fail(`${id}: gateway mismatch absent du scan marché`);
    if (!(item.currentMarketScan?.missingSegments || []).length) fail(`${id}: missingSegments requis pour mismatch`);
  }

  if (!(item.evidence || []).length) fail(`${id}: evidence vide`);
  for (const evidence of item.evidence || []) {
    if (!/^https:\/\//.test(evidence.url || '')) fail(`${id}: source evidence HTTPS manquante`);
    if (!dateRe.test(evidence.checkedAt || '')) fail(`${id}: evidence.checkedAt invalide`);
    if (!evidence.supports) fail(`${id}: evidence.supports manquant`);
  }
  if (!(item.nextResearch || []).length) fail(`${id}: nextResearch vide`);
}

if (seen.size !== 3) fail(`attendu 3 destinations, trouvé ${seen.size}`);
for (const id of marketByTrip.keys()) if (!seen.has(id)) fail(`${id}: scan marché sans géométrie`);

if (errors.length) {
  console.error(`\nErreurs géométrie shortlist (${errors.length})`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`\nValidation géométrie shortlist OK: ${seen.size} destinations.`);
