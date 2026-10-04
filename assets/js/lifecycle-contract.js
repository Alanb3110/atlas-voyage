export const ACTIVE_LIFECYCLE = Object.freeze([
  'longlist',
  'shortlist',
  'selected',
  'detailed',
  'bookable',
  'booked'
]);

export const LIFECYCLE = Object.freeze([...ACTIVE_LIFECYCLE, 'archived']);

export const LIFECYCLE_REQUIREMENTS = Object.freeze({
  longlist: Object.freeze({
    comparison: true,
    evidence: true,
    shortlistResearch: false,
    bookingReadiness: false,
    tripData: false,
    readinessStates: Object.freeze([])
  }),
  shortlist: Object.freeze({
    comparison: true,
    evidence: true,
    shortlistResearch: true,
    bookingReadiness: true,
    tripData: false,
    readinessStates: Object.freeze(['blocked', 'decision_ready'])
  }),
  selected: Object.freeze({
    comparison: true,
    evidence: true,
    shortlistResearch: true,
    bookingReadiness: true,
    tripData: false,
    readinessStates: Object.freeze(['blocked', 'decision_ready'])
  }),
  detailed: Object.freeze({
    comparison: true,
    evidence: true,
    shortlistResearch: true,
    bookingReadiness: true,
    tripData: true,
    readinessStates: Object.freeze(['blocked', 'decision_ready'])
  }),
  bookable: Object.freeze({
    comparison: true,
    evidence: true,
    shortlistResearch: true,
    bookingReadiness: true,
    tripData: true,
    readinessStates: Object.freeze(['booking_ready'])
  }),
  booked: Object.freeze({
    comparison: true,
    evidence: true,
    shortlistResearch: true,
    bookingReadiness: true,
    tripData: true,
    readinessStates: Object.freeze(['booked'])
  }),
  archived: Object.freeze({
    comparison: false,
    evidence: false,
    shortlistResearch: false,
    bookingReadiness: false,
    tripData: false,
    readinessStates: Object.freeze([])
  })
});

const ACTIVE_INDEX = new Map(ACTIVE_LIFECYCLE.map((status, index) => [status, index]));

const TRANSITIONS = Object.freeze({
  longlist: Object.freeze(['shortlist', 'archived']),
  shortlist: Object.freeze(['longlist', 'selected', 'archived']),
  selected: Object.freeze(['shortlist', 'detailed', 'archived']),
  detailed: Object.freeze(['selected', 'bookable', 'archived']),
  bookable: Object.freeze(['detailed', 'booked', 'archived']),
  booked: Object.freeze(['bookable', 'archived']),
  archived: Object.freeze(['longlist'])
});

export function isLifecycleStatus(status) {
  return LIFECYCLE.includes(status);
}

export function lifecycleAtLeast(status, minimum) {
  if (status === 'archived' || minimum === 'archived') return status === minimum;
  const current = ACTIVE_INDEX.get(status);
  const target = ACTIVE_INDEX.get(minimum);
  return current != null && target != null && current >= target;
}

export function lifecycleRequirements(status) {
  return LIFECYCLE_REQUIREMENTS[status] || null;
}

export function requiresTripData(status) {
  return Boolean(lifecycleRequirements(status)?.tripData);
}

export function requiresShortlistResearch(status) {
  return Boolean(lifecycleRequirements(status)?.shortlistResearch);
}

export function requiresBookingReadiness(status) {
  return Boolean(lifecycleRequirements(status)?.bookingReadiness);
}

export function allowedReadinessStates(status) {
  return lifecycleRequirements(status)?.readinessStates || [];
}

export function canTransitionLifecycle(from, to) {
  if (!isLifecycleStatus(from) || !isLifecycleStatus(to)) return false;
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) || false;
}

export function tripDetailAvailable(entry) {
  return Boolean(
    entry &&
    typeof entry.dataFile === 'string' &&
    entry.dataFile.trim() &&
    typeof entry.defaultVariant === 'string' &&
    entry.defaultVariant.trim() &&
    typeof entry.defaultBudget === 'string' &&
    entry.defaultBudget.trim()
  );
}
