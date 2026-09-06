const CACHE = 'atlas-v21-shell';

const SHELL = [
  './index.html',
  './trip.html',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/css/styles.css',
  './assets/css/trip-v2.css',
  './assets/css/airport-access.css',
  './assets/css/destination-compare.css',
  './assets/css/shortlist-market.css',
  './assets/css/shortlist-door-to-door.css',
  './assets/css/booking-readiness.css',
  './assets/css/theme.css',
  './assets/js/store.js',
  './assets/js/home.js',
  './assets/js/trip.js',
  './assets/js/airport-access.js',
  './assets/js/destination-data-contract.js',
  './assets/js/destination-compare.js',
  './assets/js/destination-rank-robustness.js',
  './assets/js/shortlist-market-scan.js',
  './assets/js/shortlist-door-to-door.js',
  './assets/js/booking-readiness.js',
  './assets/js/theme.js'
];

// Explicitly public, non-sensitive comparison data only. Detailed trip, airport,
// ground-cost, gateway-geometry, market-scan, door-to-door and booking files are
// intentionally excluded so future protected data is never persisted by the
// application service worker by default.
const PUBLIC_DATA = [
  './data/catalog.json',
  './data/destination-comparison.json'
];

const absolute = relative => new URL(relative, self.registration.scope).href;
const shellUrls = new Set(SHELL.map(absolute));
const publicDataUrls = new Set(PUBLIC_DATA.map(absolute));
const indexUrl = absolute('./index.html');
const tripUrl = absolute('./trip.html');
const scopePath = new URL(self.registration.scope).pathname;

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([...SHELL, ...PUBLIC_DATA]))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith('atlas-') && key !== CACHE)
        .map(key => caches.delete(key))
    ))
  ]));
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstPublicData(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function navigationNetworkFirst(request, fallbackUrl) {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match(fallbackUrl);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const relativePath = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : '';
    if (!relativePath || relativePath === 'index.html') {
      event.respondWith(navigationNetworkFirst(request, indexUrl));
    } else if (relativePath === 'trip.html') {
      event.respondWith(navigationNetworkFirst(request, tripUrl));
    }
    return;
  }

  const normalizedUrl = new URL(request.url);
  normalizedUrl.search = '';
  if (shellUrls.has(normalizedUrl.href)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (publicDataUrls.has(normalizedUrl.href)) {
    event.respondWith(networkFirstPublicData(request));
  }
});