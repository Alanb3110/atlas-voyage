import { test, expect } from '@playwright/test';

const TRIP = 'http://127.0.0.1:4173/trip.html?trip=komodo-flores-nov-2026';

async function openTrip(page, suffix = '') {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`);
  });
  page.on('console', message => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });
  await page.goto(`${TRIP}${suffix}`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => (await page.locator('#tripTitle').textContent())?.trim() || '').not.toBe('');
  await page.waitForTimeout(180);
  return errors;
}

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(node => {
        const style = getComputedStyle(node);
        if (style.position === 'fixed') return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && (rect.right > document.documentElement.clientWidth + 1 || rect.left < -1);
      })
      .slice(0, 8)
      .map(node => ({ tag: node.tagName, id: node.id, className: String(node.className || '') }))
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics.offenders)).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function expectNoVisibleHeadingOverflow(page) {
  const offenders = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3')]
    .filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 1)
    .map(node => ({ text: node.textContent?.trim(), width: node.clientWidth, scrollWidth: node.scrollWidth })));
  expect(offenders).toEqual([]);
}

async function expectReadableMobileHero(page, viewportWidth) {
  const metrics = await page.evaluate(() => {
    const hero = document.querySelector('#hero');
    const title = document.querySelector('#tripTitle');
    const heroStyle = getComputedStyle(hero);
    const titleStyle = getComputedStyle(title);
    const heroRect = hero.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const contentWidth = heroRect.width
      - Number.parseFloat(heroStyle.paddingLeft)
      - Number.parseFloat(heroStyle.paddingRight);
    const lineHeight = Number.parseFloat(titleStyle.lineHeight);
    return {
      titleWidth: titleRect.width,
      contentWidth,
      lineCount: Number.isFinite(lineHeight) && lineHeight > 0 ? titleRect.height / lineHeight : 0,
      wordBreak: titleStyle.wordBreak,
      overflowWrap: titleStyle.overflowWrap
    };
  });

  expect(metrics.titleWidth).toBeGreaterThanOrEqual(viewportWidth - 72);
  expect(metrics.titleWidth).toBeGreaterThanOrEqual(metrics.contentWidth - 2);
  expect(metrics.lineCount).toBeLessThanOrEqual(3.1);
  expect(metrics.wordBreak).toBe('normal');
  expect(metrics.overflowWrap).toBe('normal');
}

const layouts = [
  { label: 'mobile 320', width: 320, height: 800 },
  { label: 'iPhone 375', width: 375, height: 812 },
  { label: 'iPhone 390', width: 390, height: 844 },
  { label: 'tablette 768', width: 768, height: 1024 },
  { label: 'desktop 1280', width: 1280, height: 900 },
  { label: 'desktop 1440', width: 1440, height: 900 }
];

for (const viewport of layouts) {
  test(`responsive/sticky/no-overflow — ${viewport.label}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = await openTrip(page);

    const mobileHeader = viewport.width < 900;
    if (mobileHeader) {
      await expect(page.locator('#configBtn')).toBeVisible();
      await expect(page.locator('#shareBtn')).toBeVisible();
      await expect(page.locator('#desktopSwitcherSlot')).toBeHidden();
      const headerHeight = await page.locator('.trip-appbar').evaluate(node => node.getBoundingClientRect().height);
      expect(headerHeight).toBeLessThanOrEqual(64);
      if (viewport.width <= 390) await expectReadableMobileHero(page, viewport.width);
    } else {
      await expect(page.locator('#configBtn')).toBeHidden();
      await expect(page.locator('#tripSwitchers')).toBeVisible();
    }

    for (const tab of ['circuit', 'choice', 'budget', 'practical']) {
      await page.locator(`#tab-${tab}`).click();
      await page.waitForTimeout(60);
      await expectNoHorizontalOverflow(page);
      await expectNoVisibleHeadingOverflow(page);
    }

    await page.locator('#tab-circuit').click();
    await page.evaluate(() => document.querySelector('#stepsSection')?.scrollIntoView());
    await page.waitForTimeout(120);
    const sticky = await page.evaluate(() => {
      const appbar = document.querySelector('.trip-appbar').getBoundingClientRect();
      const tabs = document.querySelector('#tripTabs').getBoundingClientRect();
      const section = document.querySelector('#stepsSection').getBoundingClientRect();
      return {
        appbarTop: appbar.top,
        appbarHeight: appbar.height,
        tabsTop: tabs.top,
        tabsHeight: tabs.height,
        sectionTop: section.top
      };
    });
    expect(Math.abs(sticky.appbarTop)).toBeLessThanOrEqual(1);
    expect(sticky.tabsTop).toBeGreaterThanOrEqual(sticky.appbarHeight - 2);
    expect(sticky.sectionTop).toBeGreaterThanOrEqual(sticky.appbarHeight + sticky.tabsHeight - 3);
    expect(errors).toEqual([]);

    await context.close();
  });
}

for (const [theme, viewport] of [
  ['light', { width: 390, height: 844 }],
  ['dark', { width: 390, height: 844 }],
  ['light', { width: 1280, height: 900 }],
  ['dark', { width: 1280, height: 900 }]
]) {
  test(`thème ${theme} — ${viewport.width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.addInitScript(value => localStorage.setItem('atlas-theme', value), theme);
    const errors = await openTrip(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('navigation clavier, focus, dialogue et accordéons — mobile', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = await openTrip(page);

  await page.locator('#configBtn').click();
  await expect(page.locator('#tripConfigDialog')).toHaveAttribute('open', '');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('tripSelector');
  await page.keyboard.press('Escape');
  await expect(page.locator('#tripConfigDialog')).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('configBtn');

  await page.locator('#tab-circuit').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-choice')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('tab-choice');
  const outline = await page.locator('#tab-choice').evaluate(node => ({
    style: getComputedStyle(node).outlineStyle,
    width: Number.parseFloat(getComputedStyle(node).outlineWidth)
  }));
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);

  await page.locator('#tab-circuit').click();
  const secondStep = page.locator('.step-accordion').nth(1);
  await secondStep.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(secondStep).toHaveAttribute('open', '');

  const secondDay = page.locator('.day-card').nth(1);
  await secondDay.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(secondDay).toHaveAttribute('open', '');

  await page.locator('#tab-practical').click();
  const practical = page.locator('.practical-accordion').nth(1);
  await practical.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(practical).toHaveAttribute('open', '');

  expect(errors).toEqual([]);
  await context.close();
});

test('Leaflet reste cadré et ouvre la bonne étape après changement de variante', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = await openTrip(page, '&variant=flores&budget=comfort&tab=choice');

  await page.locator('[data-variant="relaxed"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('variant')).toBe('relaxed');
  await page.locator('#tab-circuit').click();
  await page.waitForTimeout(320);

  const mapState = await page.evaluate(() => {
    const map = document.querySelector('#map').getBoundingClientRect();
    const markers = [...document.querySelectorAll('.leaflet-marker-icon')].map(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    return {
      width: map.width,
      height: map.height,
      count: markers.length,
      outside: markers.filter(point =>
        point.x < map.left || point.x > map.right || point.y < map.top || point.y > map.bottom
      ).length
    };
  });
  expect(mapState.width).toBeGreaterThan(250);
  expect(mapState.height).toBeGreaterThan(300);
  expect(mapState.count).toBe(5);
  expect(mapState.outside).toBe(0);

  await page.locator('#map').evaluate(node => node.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(180);
  const markerRects = await page.locator('.leaflet-marker-icon').evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect();
    return {
      step: node.dataset.step,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  }));
  for (const rect of markerRects) {
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  for (let i = 0; i < markerRects.length; i += 1) {
    for (let j = i + 1; j < markerRects.length; j += 1) {
      const a = markerRects[i];
      const b = markerRects[j];
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(overlapX > 0 && overlapY > 0, `marqueurs ${a.step}/${b.step} se chevauchent`).toBe(false);
    }
  }

  const marker = page.locator('.leaflet-marker-icon[data-step="1"]');
  await expect(marker).toHaveAttribute('aria-label', /Ouvrir l’étape 2/);
  await marker.locator('.marker-pin').click();
  const target = page.locator('.step-accordion[data-step="1"]');
  await expect(target).toHaveAttribute('open', '');
  await page.waitForTimeout(650);
  const position = await target.evaluate(node => ({
    top: node.getBoundingClientRect().top,
    offset: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--trip-scroll-offset')) || 0
  }));
  expect(position.top).toBeGreaterThanOrEqual(position.offset - 5);

  expect(errors).toEqual([]);
  await context.close();
});

test('activités, budget, URL et rechargement restent cohérents', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = await openTrip(page, '&variant=flores&budget=comfort&tab=choice&activities=none');

  await page.locator('[data-activity-filter="all"]').click();
  const projectedBefore = await page.locator('#activityBudgetSummary .activity-budget-metric.primary strong').textContent();
  const cooking = page.locator('[data-activity-toggle="sidemen-cooking"]');
  await cooking.check({ force: true });
  await expect(cooking).toBeChecked();
  const projectedAfter = await page.locator('#activityBudgetSummary .activity-budget-metric.primary strong').textContent();
  expect(projectedAfter).not.toBe(projectedBefore);
  expect(new URL(page.url()).searchParams.get('activities')).toBe('sidemen-cooking');

  await page.locator('#tab-budget').click();
  await page.locator('#tab-choice').click();
  await expect(page.locator('[data-activity-toggle="sidemen-cooking"]')).toBeChecked();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(async () => (await page.locator('#tripTitle').textContent())?.trim() || '').not.toBe('');
  await expect(page.locator('[data-activity-toggle="sidemen-cooking"]')).toBeChecked();
  expect(new URL(page.url()).searchParams.get('tab')).toBe('choice');

  await page.locator('#activitiesClear').click();
  expect(new URL(page.url()).searchParams.get('activities')).toBe('none');

  await page.locator('#tab-budget').click();
  await page.locator('[data-budget="essential"]').click();
  expect(new URL(page.url()).searchParams.get('budget')).toBe('essential');
  await expect(page.locator('[data-budget="essential"]')).toHaveAttribute('aria-pressed', 'true');

  expect(errors).toEqual([]);
  await context.close();
});

test('sélecteurs desktop et paramètres canoniques', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = await openTrip(page, '&variant=flores&budget=comfort&tab=circuit&junk=drop-me');

  expect(new URL(page.url()).searchParams.has('junk')).toBe(false);
  await page.locator('#variantSelector').selectOption('relaxed');
  expect(new URL(page.url()).searchParams.get('variant')).toBe('relaxed');
  await page.locator('#budgetSelector').selectOption('premium');
  expect(new URL(page.url()).searchParams.get('budget')).toBe('premium');

  expect(errors).toEqual([]);
  await context.close();
});

test('Partager transmet exactement l’URL canonique', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async data => { window.__atlasShared = data; }
    });
  });
  const errors = await openTrip(page, '&variant=flores&budget=comfort&tab=choice&activities=monkey-forest');
  await page.locator('#shareBtn').click();
  const shared = await page.evaluate(() => window.__atlasShared);
  expect(shared.url).toBe(page.url());
  expect(errors).toEqual([]);
  await context.close();
});

test('PWA: service worker actif, cache v27 et shell disponible hors ligne', async ({ browser, browserName }) => {
  test.skip(browserName === 'webkit', 'Le cache Service Worker hors ligne est validé dans Chromium ; WebKit couvre le rendu/navigation iPhone.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = await openTrip(page);

  const pwa = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    const manifest = await fetch('./manifest.webmanifest').then(response => response.json());
    await fetch('./assets/css/trip-v2.css');
    return {
      active: Boolean(registration.active),
      script: registration.active?.scriptURL || '',
      keys,
      display: manifest.display
    };
  });
  expect(pwa.active).toBe(true);
  expect(pwa.script).toContain('/sw.js');
  expect(pwa.keys).toContain('atlas-v27-shell');
  expect(pwa.display).toBe('standalone');

  const seededOldCache = await page.evaluate(async () => {
    const cache = await caches.open('atlas-v26-shell');
    await cache.put('./legacy-probe', new Response('legacy'));
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
    return (await caches.keys()).includes('atlas-v26-shell');
  });
  expect(seededOldCache).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('atlas-v26-shell');
  await expect.poll(() => page.evaluate(() => caches.keys())).toContain('atlas-v27-shell');

  await context.setOffline(true);
  const cachedShellWorks = await page.evaluate(() =>
    fetch('./assets/css/trip-v2.css').then(response => response.ok).catch(() => false));
  expect(cachedShellWorks).toBe(true);

  expect(errors).toEqual([]);
  await context.close();
});
