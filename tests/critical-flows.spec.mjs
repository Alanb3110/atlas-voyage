import { test, expect } from '@playwright/test';

const ROOT = 'http://127.0.0.1:4173/';

async function getJson(request, relativePath) {
  const response = await request.get(new URL(relativePath, ROOT).href);
  expect(response.ok(), `${relativePath} doit être chargeable`).toBeTruthy();
  return response.json();
}

async function getTripData(request, entry) {
  return getJson(request, entry.dataFile);
}

async function waitForTrip(page) {
  await expect.poll(async () => (await page.locator('#tripTitle').textContent())?.trim() || '').not.toBe('');
}

function currentParams(page) {
  return new URL(page.url()).searchParams;
}

async function findMultiVariantTrip(request, catalog) {
  for (const entry of catalog.trips) {
    const data = await getTripData(request, entry);
    if ((data.variants || []).length > 1) return { entry, data };
  }
  throw new Error('Le catalogue doit contenir au moins un voyage multi-variante pour tester les sélecteurs.');
}

async function expectCanonicalSelection(page, expected) {
  const url = new URL(page.url());
  expect(url.searchParams.get('trip')).toBe(expected.trip);
  expect(url.searchParams.get('variant')).toBe(expected.variant);
  expect(url.searchParams.get('budget')).toBe(expected.budget);
  expect(url.searchParams.get('tab')).toBe(expected.tab);
  await expect(page.locator('#tripSelector')).toHaveValue(expected.trip);
  await expect(page.locator('#variantSelector')).toHaveValue(expected.variant);
  await expect(page.locator('#budgetSelector')).toHaveValue(expected.budget);
  await expect(page.locator(`#tab-${expected.tab}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#panel-${expected.tab}`)).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(node => {
        const style = getComputedStyle(node);
        if (style.position === 'fixed' || node.getClientRects().length === 0) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
      })
      .slice(0, 10)
      .map(node => ({ tag: node.tagName, id: node.id, className: String(node.className || '') }))
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics.offenders)).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

test('catalogue: tous les dossiers sont rendus, un voyage s’ouvre et Back/Forward restaure le parcours', async ({ page, request }) => {
  const catalog = await getJson(request, 'data/catalog.json');
  const target = catalog.trips.find(entry => entry.id === 'komodo-flores-nov-2026') || catalog.trips[0];

  await page.goto(`${ROOT}index.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#tripCount')).toHaveText(String(catalog.trips.length));
  await expect(page.locator('#tripGrid .trip-card')).toHaveCount(catalog.trips.length);

  const opener = page.locator(`#tripGrid a.button[href*="trip=${target.id}"]`).filter({ hasText: 'Ouvrir' }).first();
  await expect(opener).toBeVisible();
  await opener.click();
  await waitForTrip(page);

  expect(currentParams(page).get('trip')).toBe(target.id);
  expect(currentParams(page).get('variant')).toBe(target.defaultVariant);
  expect(currentParams(page).get('budget')).toBe(target.defaultBudget);
  expect(currentParams(page).get('tab')).toBe('circuit');

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-page', 'home');
  await expect(page.locator('#tripGrid .trip-card')).toHaveCount(catalog.trips.length);

  await page.goForward({ waitUntil: 'domcontentloaded' });
  await waitForTrip(page);
  expect(currentParams(page).get('trip')).toBe(target.id);
});

test('URL: ordre libre, paramètres absents/inconnus et combinaisons impossibles retombent sur un état canonique valide', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const catalog = await getJson(request, 'data/catalog.json');
  const firstEntry = catalog.trips[0];
  const firstTrip = await getTripData(request, firstEntry);
  const multi = await findMultiVariantTrip(request, catalog);
  const alternateVariant = multi.data.variants.find(item => item.id !== multi.data.defaultVariant) || multi.data.variants[0];
  const alternateBudget = multi.data.budgets.find(item => item.id !== multi.data.defaultBudget) || multi.data.budgets[0];
  const singleEntry = catalog.trips.find(entry => entry.id !== multi.entry.id && entry.variantCount === 1) || firstEntry;
  const singleTrip = await getTripData(request, singleEntry);

  const cases = [
    {
      name: 'ordre différent',
      url: `trip.html?budget=${encodeURIComponent(alternateBudget.id)}&junk=drop-me&tab=budget&variant=${encodeURIComponent(alternateVariant.id)}&trip=${encodeURIComponent(multi.entry.id)}`,
      expected: { trip: multi.entry.id, variant: alternateVariant.id, budget: alternateBudget.id, tab: 'budget' },
      absent: ['junk']
    },
    {
      name: 'paramètres absents',
      url: 'trip.html',
      expected: { trip: firstEntry.id, variant: firstTrip.defaultVariant, budget: firstTrip.defaultBudget, tab: 'circuit' },
      absent: []
    },
    {
      name: 'valeurs inconnues',
      url: 'trip.html?trip=voyage-inconnu&variant=variante-inconnue&budget=budget-inconnu&tab=onglet-inconnu&junk=x',
      expected: { trip: firstEntry.id, variant: firstTrip.defaultVariant, budget: firstTrip.defaultBudget, tab: 'circuit' },
      absent: ['junk']
    },
    {
      name: 'combinaison impossible',
      url: `trip.html?trip=${encodeURIComponent(singleEntry.id)}&variant=__impossible__&budget=__impossible__&tab=choice`,
      expected: { trip: singleEntry.id, variant: singleTrip.defaultVariant, budget: singleTrip.defaultBudget, tab: 'choice' },
      absent: []
    }
  ];

  for (const scenario of cases) {
    await test.step(scenario.name, async () => {
      await page.goto(`${ROOT}${scenario.url}`, { waitUntil: 'domcontentloaded' });
      await waitForTrip(page);
      await expectCanonicalSelection(page, scenario.expected);
      for (const key of scenario.absent) expect(currentParams(page).has(key)).toBe(false);
    });
  }
});

test('sélecteurs Voyage / Variante / Budget: état conservé au reload puis restauré par Back/Forward', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const catalog = await getJson(request, 'data/catalog.json');
  const multi = await findMultiVariantTrip(request, catalog);
  const targetEntry = catalog.trips.find(entry => entry.id !== multi.entry.id) || catalog.trips[0];
  const targetTrip = await getTripData(request, targetEntry);
  const alternateVariant = multi.data.variants.find(item => item.id !== multi.data.defaultVariant) || multi.data.variants[0];
  const alternateBudget = multi.data.budgets.find(item => item.id !== multi.data.defaultBudget) || multi.data.budgets[0];

  await page.goto(`${ROOT}trip.html?trip=${encodeURIComponent(multi.entry.id)}&tab=choice`, { waitUntil: 'domcontentloaded' });
  await waitForTrip(page);
  await page.locator('#variantSelector').selectOption(alternateVariant.id);
  await page.locator('#budgetSelector').selectOption(alternateBudget.id);

  const selectedState = {
    trip: multi.entry.id,
    variant: alternateVariant.id,
    budget: alternateBudget.id,
    tab: 'choice'
  };
  await expectCanonicalSelection(page, selectedState);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForTrip(page);
  await expectCanonicalSelection(page, selectedState);

  await page.locator('#tripSelector').selectOption(targetEntry.id);
  await expect.poll(() => currentParams(page).get('trip')).toBe(targetEntry.id);
  await waitForTrip(page);
  const targetState = {
    trip: targetEntry.id,
    variant: targetTrip.defaultVariant,
    budget: targetTrip.defaultBudget,
    tab: 'choice'
  };
  await expectCanonicalSelection(page, targetState);

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await waitForTrip(page);
  await expectCanonicalSelection(page, selectedState);

  await page.goForward({ waitUntil: 'domcontentloaded' });
  await waitForTrip(page);
  await expectCanonicalSelection(page, targetState);
});

test('Configurer mobile: sélecteurs utilisables, Escape ferme et restitue le focus', async ({ browser, request }) => {
  const catalog = await getJson(request, 'data/catalog.json');
  const multi = await findMultiVariantTrip(request, catalog);
  const alternateBudget = multi.data.budgets.find(item => item.id !== multi.data.defaultBudget) || multi.data.budgets[0];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  await page.goto(`${ROOT}trip.html?trip=${encodeURIComponent(multi.entry.id)}`, { waitUntil: 'domcontentloaded' });
  await waitForTrip(page);
  await page.locator('#configBtn').click();

  await expect(page.locator('#configBtn')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#tripConfigDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#tripSelector')).toBeVisible();
  await expect(page.locator('#variantSelector')).toBeVisible();
  await expect(page.locator('#budgetSelector')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('tripSelector');

  await page.locator('#budgetSelector').selectOption(alternateBudget.id);
  expect(currentParams(page).get('budget')).toBe(alternateBudget.id);

  await page.keyboard.press('Escape');
  await expect(page.locator('#tripConfigDialog')).not.toHaveAttribute('open', '');
  await expect(page.locator('#configBtn')).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('configBtn');
  await expectNoHorizontalOverflow(page);

  await context.close();
});

for (const viewport of [
  { width: 430, height: 932, label: '430 px mobile large' },
  { width: 1024, height: 768, label: '1024 px desktop compact' }
]) {
  test(`responsive manquant: géométrie fonctionnelle et ancre sticky — ${viewport.label}`, async ({ browser, request }) => {
    const catalog = await getJson(request, 'data/catalog.json');
    const target = catalog.trips.find(entry => entry.id === 'komodo-flores-nov-2026') || catalog.trips[0];
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();

    await page.goto(`${ROOT}trip.html?trip=${encodeURIComponent(target.id)}`, { waitUntil: 'domcontentloaded' });
    await waitForTrip(page);
    await expectNoHorizontalOverflow(page);

    const geometry = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('#tripTabs [role="tab"]')].map(node => node.getBoundingClientRect());
      const selects = [...document.querySelectorAll('#tripSwitchers select')].map(node => node.getBoundingClientRect());
      const title = rect('#tripTitle');
      const appbar = rect('.trip-appbar');
      const config = rect('#configBtn');
      const share = rect('#shareBtn');
      return {
        titleWidth: title?.width || 0,
        appbarHeight: appbar?.height || 0,
        tabs: tabs.map(item => ({ width: item.width, height: item.height })),
        selects: selects.map(item => ({ width: item.width, height: item.height })),
        config: config ? { left: config.left, right: config.right, width: config.width } : null,
        share: share ? { left: share.left, right: share.right, width: share.width } : null,
        viewportWidth: document.documentElement.clientWidth
      };
    });

    for (const tab of geometry.tabs) {
      expect(tab.height).toBeGreaterThanOrEqual(44);
      expect(tab.width).toBeGreaterThanOrEqual(56);
    }

    if (viewport.width < 900) {
      await expect(page.locator('#configBtn')).toBeVisible();
      await expect(page.locator('#desktopSwitcherSlot')).toBeHidden();
      expect(geometry.appbarHeight).toBeLessThanOrEqual(64);
      expect(geometry.titleWidth).toBeGreaterThanOrEqual(viewport.width - 72);
      expect(geometry.config.width).toBeGreaterThanOrEqual(44);
      expect(geometry.share.width).toBeGreaterThanOrEqual(44);
      expect(geometry.config.left).toBeGreaterThanOrEqual(0);
      expect(geometry.share.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
      expect(geometry.config.right).toBeLessThanOrEqual(geometry.share.left + 1);
    } else {
      await expect(page.locator('#configBtn')).toBeHidden();
      await expect(page.locator('#tripSwitchers')).toBeVisible();
      expect(geometry.selects).toHaveLength(3);
      for (const select of geometry.selects) {
        expect(select.width).toBeGreaterThanOrEqual(96);
        expect(select.height).toBeGreaterThanOrEqual(44);
      }
    }

    await page.locator('#tab-circuit').click();
    await page.locator('#stepsSection').evaluate(node => node.scrollIntoView());
    await page.waitForTimeout(120);
    const sticky = await page.evaluate(() => {
      const appbar = document.querySelector('.trip-appbar').getBoundingClientRect();
      const tabs = document.querySelector('#tripTabs').getBoundingClientRect();
      const section = document.querySelector('#stepsSection').getBoundingClientRect();
      return { appbarHeight: appbar.height, tabsHeight: tabs.height, sectionTop: section.top };
    });
    expect(sticky.sectionTop).toBeGreaterThanOrEqual(sticky.appbarHeight + sticky.tabsHeight - 3);

    await context.close();
  });
}

test('PWA: cache unique, données publiques disponibles hors ligne et détails de voyage non persistés', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'La politique Cache Storage/service worker est validée une fois sous Chromium.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const page = await context.newPage();

  await page.goto(`${ROOT}index.html`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => navigator.serviceWorker.ready);

  const initial = await page.evaluate(async () => {
    const atlasCaches = (await caches.keys()).filter(key => key.startsWith('atlas-'));
    const cachedUrls = [];
    for (const key of atlasCaches) {
      const cache = await caches.open(key);
      cachedUrls.push(...(await cache.keys()).map(request => request.url));
    }
    return { atlasCaches, cachedUrls };
  });
  expect(initial.atlasCaches).toHaveLength(1);
  expect(initial.cachedUrls.some(url => url.endsWith('/index.html'))).toBe(true);
  expect(initial.cachedUrls.some(url => url.endsWith('/trip.html'))).toBe(true);
  expect(initial.cachedUrls.some(url => url.endsWith('/data/catalog.json'))).toBe(true);
  expect(initial.cachedUrls.some(url => url.includes('/data/trips/'))).toBe(false);

  const detailedFetchWorked = await page.evaluate(() =>
    fetch('./data/trips/komodo-flores-nov-2026.json', { cache: 'no-store' }).then(response => response.ok));
  expect(detailedFetchWorked).toBe(true);

  const detailedCachedAfterFetch = await page.evaluate(async () => {
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      if ((await cache.keys()).some(request => request.url.includes('/data/trips/'))) return true;
    }
    return false;
  });
  expect(detailedCachedAfterFetch).toBe(false);

  await context.setOffline(true);
  const offline = await page.evaluate(async () => ({
    catalog: await fetch('./data/catalog.json').then(response => response.ok).catch(() => false),
    tripShell: await fetch('./trip.html?trip=komodo-flores-nov-2026').then(response => response.ok).catch(() => false),
    detailedTrip: await fetch('./data/trips/komodo-flores-nov-2026.json', { cache: 'no-store' }).then(response => response.ok).catch(() => false)
  }));
  expect(offline.catalog).toBe(true);
  expect(offline.tripShell).toBe(true);
  expect(offline.detailedTrip).toBe(false);

  await context.close();
});
