import { test, expect } from '@playwright/test';

const HOME = 'http://127.0.0.1:4173/index.html';

async function openHome(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('response', response => {
    if (response.url().startsWith('http://127.0.0.1:4173/') && response.status() >= 400) {
      errors.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  page.on('console', message => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });
  await page.goto(HOME, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.locator('.trip-card').count()).toBeGreaterThan(0);
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
      .slice(0, 10)
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

const layouts = [
  { label: 'mobile 320', width: 320, height: 800 },
  { label: 'iPhone 375', width: 375, height: 812 },
  { label: 'iPhone 390', width: 390, height: 844 },
  { label: 'mobile 430', width: 430, height: 932 },
  { label: 'tablette 768', width: 768, height: 1024 },
  { label: 'desktop 1024', width: 1024, height: 900 },
  { label: 'desktop 1280', width: 1280, height: 900 }
];

for (const viewport of layouts) {
  test(`catalogue responsive et hiérarchie — ${viewport.label}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = await openHome(page);

    await expect(page.locator('#statusFilter')).toHaveValue('active');
    await expect(page.getByText('Bali + Komodo — Démo', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Costa Rica — Démo', { exact: true })).toHaveCount(0);
    await expect(page.locator('#compareDestinationsLink')).toBeVisible();
    await expect(page.locator('#destinationAllDetails')).not.toHaveAttribute('open', '');
    await expect(page.locator('#advancedAnalysis')).not.toHaveAttribute('open', '');

    const hierarchy = await page.evaluate(() => {
      const catalog = document.querySelector('#catalogSection').getBoundingClientRect();
      const compare = document.querySelector('#destinationCompareSection').getBoundingClientRect();
      return { catalogTop: catalog.top + window.scrollY, compareTop: compare.top + window.scrollY };
    });
    expect(hierarchy.catalogTop).toBeLessThan(hierarchy.compareTop);

    const activeCount = Number((await page.locator('#tripCount').textContent())?.trim());
    expect(activeCount).toBe(await page.locator('.trip-card').count());
    await expect(page.locator('.trip-card .status', { hasText: 'Présélectionnée' })).toHaveCount(2);

    if (viewport.width <= 430) {
      const controls = await page.evaluate(() => {
        const theme = document.querySelector('[data-theme-toggle]').getBoundingClientRect();
        const search = document.querySelector('#searchInput').getBoundingClientRect();
        const filter = document.querySelector('#statusFilter').getBoundingClientRect();
        const firstAction = document.querySelector('.trip-card .button').getBoundingClientRect();
        return {
          theme: [theme.width, theme.height],
          searchHeight: search.height,
          filterHeight: filter.height,
          actionHeight: firstAction.height,
          headerPrivacyChip: Boolean(document.querySelector('.appbar .privacy-chip'))
        };
      });
      expect(controls.theme[0]).toBeGreaterThanOrEqual(44);
      expect(controls.theme[1]).toBeGreaterThanOrEqual(44);
      expect(controls.searchHeight).toBeGreaterThanOrEqual(44);
      expect(controls.filterHeight).toBeGreaterThanOrEqual(44);
      expect(controls.actionHeight).toBeGreaterThanOrEqual(44);
      expect(controls.headerPrivacyChip).toBe(false);
    }

    await expectNoHorizontalOverflow(page);
    await expectNoVisibleHeadingOverflow(page);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('catalogue: présélection, archives et CTA ouverture/comparaison restent distincts', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = await openHome(page);

  const bali = page.locator('.trip-card').filter({ hasText: 'Bali + Komodo + Flores' });
  const baliLinks = bali.locator('.trip-actions a');
  await expect(baliLinks).toHaveCount(2);

  const openHref = await bali.locator('[data-action="open-trip"]').getAttribute('href');
  const compareHref = await bali.locator('[data-action="compare-variants"]').getAttribute('href');
  expect(openHref).toContain('trip=komodo-flores-nov-2026');
  expect(openHref).not.toContain('tab=');
  expect(compareHref).toContain('trip=komodo-flores-nov-2026');
  expect(compareHref).toContain('tab=choice');
  expect(compareHref).not.toBe(openHref);

  const thailand = page.locator('.trip-card').filter({ hasText: 'Thaïlande — Bangkok + Khao Sok + Khao Lak' });
  await expect(thailand.locator('.trip-actions a')).toHaveCount(1);

  await page.locator('#statusFilter').selectOption('shortlist');
  await expect(page.locator('.trip-card')).toHaveCount(2);
  await expect(page.locator('.trip-card .status')).toHaveText(['Présélectionnée', 'Présélectionnée']);

  await page.locator('#statusFilter').selectOption('archived');
  await expect(page.getByText('Bali + Komodo — Démo', { exact: true })).toBeVisible();
  await expect(page.getByText('Costa Rica — Démo', { exact: true })).toBeVisible();

  await page.locator('#statusFilter').selectOption('active');
  await page.locator('#compareDestinationsLink').click();
  await expect(page).toHaveURL(/#destinationCompareSection$/);

  await page.locator('.trip-card').filter({ hasText: 'Bali + Komodo + Flores' })
    .locator('[data-action="compare-variants"]').click();
  await expect(page).toHaveURL(/trip=komodo-flores-nov-2026/);
  expect(new URL(page.url()).searchParams.get('tab')).toBe('choice');
  await expect.poll(async () => (await page.locator('#tripTitle').textContent())?.trim() || '').not.toBe('');

  expect(errors).toEqual([]);
  await context.close();
});
