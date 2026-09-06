import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDestinationComparisonNumericContract } from '../assets/js/destination-data-contract.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const file = 'data/destination-comparison.json';

try {
  const data = JSON.parse(await readFile(resolve(root, file), 'utf8'));
  assertDestinationComparisonNumericContract(data);
  console.log(`${file}: contrat numérique destinations OK.`);
} catch (error) {
  console.error(`${file}: ${error.message}`);
  process.exit(1);
}
