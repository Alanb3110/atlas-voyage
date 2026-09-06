const CRITERIA = ['wildlife','season','relaxation','beach','culture','food','safety','logistics'];

function requireFiniteNumber(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${label} doit être un nombre réel entre ${min} et ${max}`);
  }
  return value;
}

export function assertDestinationComparisonNumericContract(data) {
  if (!data || typeof data !== 'object') throw new TypeError('destination-comparison: objet racine invalide');

  const weights = data.weights;
  if (!weights || typeof weights !== 'object') throw new TypeError('destination-comparison: pondérations absentes');

  let totalWeight = 0;
  for (const key of CRITERIA) {
    totalWeight += requireFiniteNumber(weights[key], `pondération ${key}`, { min: 0 });
  }
  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new RangeError(`somme des pondérations=${totalWeight}, attendu 100`);
  }

  if (!Array.isArray(data.destinations)) throw new TypeError('destination-comparison: destinations doit être un tableau');

  for (const [index, row] of data.destinations.entries()) {
    const label = row?.tripId || `destination ${index + 1}`;
    if (!row || typeof row !== 'object') throw new TypeError(`${label}: destination invalide`);

    requireFiniteNumber(row.uncertaintyHalfWidth, `${label}: uncertaintyHalfWidth`, { min: 0, max: 2 });

    const overrides = row.uncertaintyOverrides;
    if (overrides != null) {
      if (typeof overrides !== 'object' || Array.isArray(overrides)) {
        throw new TypeError(`${label}: uncertaintyOverrides doit être un objet`);
      }
      for (const [key, value] of Object.entries(overrides)) {
        if (!CRITERIA.includes(key)) throw new TypeError(`${label}: incertitude inconnue ${key}`);
        requireFiniteNumber(value, `${label}: incertitude ${key}`, { min: 0, max: 2 });
      }
    }

    for (const key of CRITERIA) {
      requireFiniteNumber(row.scores?.[key], `${label}: score ${key}`, { min: 0, max: 5 });
    }
  }

  return data;
}
