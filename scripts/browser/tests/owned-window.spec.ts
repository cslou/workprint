import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import type { Request } from '@playwright/test';
import { test, expect } from '../material-network.js';
import { browserOrigin } from '../origin.js';
import { ownedReadReference } from '../owned-read-reference.js';
import { mountOwnedWindowReference } from '../owned-read-mount.js';
import { ownedPanelFrame } from '../owned-panel-frame.js';
import { settleCapture } from '../capture.js';
import { compare } from '../compare.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import type { prepareLibraryWindow as PrepareLibraryWindow } from '../../../apps/api/test/paged-saved-work.js';

type Batch = { items: { id: string; latestVersion?: { id: string } }[]; nextCursor: string | null };
for (const width of [1440, 390]) test(`owned windows traverse 1105 records and return without losing exact choices at ${width}`, async ({ page, context, materialNetwork }, info) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const { prepareLibraryWindow } = await import(pathToFileURL(resolve('apps/api/.test-build/test/paged-saved-work.js')).href) as { prepareLibraryWindow: typeof PrepareLibraryWindow };
  let saved: Awaited<ReturnType<typeof PrepareLibraryWindow>> | undefined;
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async target => {
      if (!saved) throw new Error('Large owned prerequisites missing');
      const data = saved;
      const allow = (path: string, query: Record<string, string> = {}, method = 'GET') => materialNetwork.expectOperations({ origin: target.origin, method, path, query, count: 1 });
      const configure = async (panelOnly: boolean, other = false) => {
        const conversationId = other ? data.emptyB : data.conversationA;
        allow(`/v1/conversations/${conversationId}/workspace`);
        if (!other) { allow(`/v1/versions/${data.current.id}`); if (!panelOnly) allow(`/v1/conversations/${conversationId}/generation-requests`); }
        await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[other ? 1 : 0]!, accountId: other ? data.accountB : data.accountA, conversationId, panelOnly });
        await expect(page.getByRole('tabpanel')).toContainText(other ? 'Your script will appear here once you describe your video.' : 'Ada waits beside the station clock.');
      };
      const pair = async (feature: 'library' | 'history', loaded: number, terminal: boolean) => {
        const source = await ownedReadReference(feature === 'library' ? 'library-page' : 'script-history');
        const reference = await context.newPage(); await reference.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await mountOwnedWindowReference(reference, source, loaded - 999, loaded, 1105);
        if (terminal) await reference.locator('.preview-page-controls .ref-secondary').evaluate(node => node.remove());
        const expectedSelector = feature === 'library' ? '.preview-library-controls' : '.preview-page-controls';
        const actualSelector = feature === 'library' ? '.wp-picker-pagination' : '.wp-version-pagination';
        const prefix = `${feature}-${loaded}`;
        const measure = async (side: typeof page, selector: string) => {
          if (feature === 'library') await side.locator('.wp-picker-body').evaluate(node => { node.scrollTop = node.scrollHeight; });
          await side.bringToFront(); await settleCapture(side);
          await side.locator(selector).scrollIntoViewIfNeeded();
          return await side.locator(selector).evaluate(node => {
            const box = node.getBoundingClientRect(); const root = node.closest('.wp-picker-body,.wp-version-history');
            const rows = root?.querySelector('.wp-picker-grid') ?? [...root?.querySelectorAll('.wp-version-history-row') ?? []].at(-1);
            if (!root || !rows || (root.classList.contains('wp-picker-body') && root.contains(root.parentElement?.querySelector('.wp-picker-tray') ?? null))) throw new Error('Window controls must follow rows outside the tray');
            const row = rows.getBoundingClientRect();
            return { width: box.width, height: box.height, leftFromRows: box.left - row.left, afterRows: box.top - row.bottom, font: getComputedStyle(node).font, overflow: document.documentElement.scrollWidth > innerWidth };
          });
        };
        const expectedGeometry = await measure(reference, expectedSelector);
        const expected = await reference.locator(expectedSelector).screenshot({ path: info.outputPath(`${prefix}-reference.png`), animations: 'disabled' });
        await reference.screenshot({ path: info.outputPath(`${prefix}-reference-full.png`), fullPage: true }); await reference.close();
        const actualGeometry = await measure(page, actualSelector);
        const actual = await page.locator(actualSelector).screenshot({ path: info.outputPath(`${prefix}-actual.png`), animations: 'disabled' });
        await page.screenshot({ path: info.outputPath(`${prefix}-actual-full.png`), fullPage: true });
        const changedPixels = await compare(expected, actual, info.outputPath(prefix));
        await writeFile(info.outputPath(`${prefix}-result.json`), JSON.stringify({ width, loaded, terminal, expectedGeometry, actualGeometry, changedPixels, tolerance: 0, referenceHashes: source.hashes, revision: info.config.metadata, approval: 'docs/design/design.md#bounded-saved-work-navigation' }, null, 2));
        expect(actualGeometry).toEqual(expectedGeometry); expect(changedPixels).toBe(0);
      };
      await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
      await configure(false);
      if (width <= 820) await page.getByRole('button', { name: 'Menu', exact: true }).click({ timeout: 5000 });
      allow('/v1/library'); let pending = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/library');
      await page.getByRole('button', { name: 'Library', exact: true }).click({ timeout: 5000 });
      let batch = await (await pending).json() as Batch; const firstVersion = batch.items[0]!.latestVersion!.id;
      await expect(page.locator('.wp-picker-tile')).toHaveCount(20); await page.locator('.wp-picker-tile').first().click();
      const seen = new Set<string>();
      for (let index = 0; index < 60; index++) {
        batch.items.forEach(item => seen.add(item.id));
        await expect(page.locator(`.wp-picker-tile[data-page-id="${batch.items.at(-1)!.id}"]`)).toBeAttached();
        expect(await page.locator('.wp-picker-tile').count()).toBeLessThanOrEqual(1000);
        await expect(page.locator('.wp-picker-tray')).toContainText('1 selected');
        if (seen.size === 1020) await pair('library', seen.size, false);
        if (!batch.nextCursor) break;
        allow('/v1/library', { cursor: batch.nextCursor }); pending = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/library');
        await page.getByRole('button', { name: 'Load more', exact: true }).press('Enter'); batch = await (await pending).json() as Batch;
      }
      expect(seen.size).toBe(1105); expect(batch.nextCursor).toBeNull();
      await expect(page.locator(`.wp-picker-tile[data-page-id="${batch.items[0]!.id}"]`)).toBeFocused();
      const lastVersion = batch.items.at(-1)!.latestVersion!.id;
      await page.locator('.wp-picker-tile').last().click(); await pair('library', seen.size, true);
      await page.getByRole('button', { name: 'Back to first page', exact: true }).press('Enter');
      await expect(page.locator('.wp-picker-tile')).toHaveCount(20); await expect(page.locator('.wp-picker-tile').first()).toBeFocused();
      await expect(page.locator('.wp-picker-tile').first()).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('.wp-picker-tray')).toContainText('2 selected');
      await expect(page.getByRole('button', { name: 'Back to first page', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Remove Script', exact: true }).first().click();
      allow(`/v1/conversations/${data.conversationA}/uses`, {}, 'POST'); const request = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/uses'));
      await page.getByRole('button', { name: 'Attach (1)', exact: true }).click();
      expect((await request).postDataJSON().versionId).toBe(lastVersion); expect(lastVersion).not.toBe(firstVersion);
      await expect(page.getByRole('status')).toContainText('Attaching from your Library is not available yet.');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      const frame = await ownedReadReference('script-history'); await ownedPanelFrame(page, frame.html); await configure(true);
      const path = `/v1/artifacts/${data.current.artifactId}/versions`;
      allow(path); pending = page.waitForResponse(response => new URL(response.url()).pathname === path); await page.locator('.wp-version-history summary').click(); batch = await (await pending).json() as Batch;
      const firstHistoryCursor = batch.nextCursor;
      seen.clear();
      for (let index = 0; index < 60; index++) {
        batch.items.forEach(item => seen.add(item.id));
        await expect(page.locator(`[data-history-id="${batch.items.at(-1)!.id}"]`)).toBeAttached();
        expect(await page.locator('.wp-version-history-row').count()).toBeLessThanOrEqual(1000);
        if (seen.size === 1020) await pair('history', seen.size, false);
        if (!batch.nextCursor) break;
        allow(path, { cursor: batch.nextCursor }); pending = page.waitForResponse(response => new URL(response.url()).pathname === path);
        await page.getByRole('button', { name: 'Load earlier versions', exact: true }).press('Enter'); batch = await (await pending).json() as Batch;
      }
      expect(seen.size).toBe(1105); expect(batch.nextCursor).toBeNull(); await expect(page.getByRole('button', { name: 'View version 5', exact: true })).toBeFocused();
      await expect(page.locator('.wp-version-history summary')).toHaveText('Version history · 1104 earlier');
      await pair('history', seen.size, true);
      await page.getByRole('button', { name: 'Back to first page', exact: true }).press('Enter');
      await expect(page.getByRole('button', { name: 'View version 1104', exact: true })).toBeFocused(); await expect(page.getByRole('button', { name: 'View version 1104', exact: true })).toBeInViewport();
      await expect(page.locator('.wp-version-history-row')).toHaveCount(19);
      let release!: () => void; let entered!: () => void; let completed!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; }); const held = new Promise<void>(resolve => { entered = resolve; }); const completion = new Promise<void>(resolve => { completed = resolve; });
      await page.route(url => url.pathname === path && url.searchParams.has('cursor'), async route => { const response = await route.fetch(); entered(); await gate; try { await route.fulfill({ response }); } finally { completed(); } });
      if (!firstHistoryCursor) throw new Error('Large history continuation missing');
      allow(path, { cursor: firstHistoryCursor });
      let settled!: () => void; const settlement = new Promise<void>(resolve => { settled = resolve; });
      const onSettled = (request: Request) => { const url = new URL(request.url()); if (url.pathname === path && url.searchParams.get('cursor') === firstHistoryCursor) settled(); };
      page.on('requestfinished', onSettled); page.on('requestfailed', onSettled);
      try {
        await page.getByRole('button', { name: 'Load earlier versions', exact: true }).press('Enter'); await held;
        await configure(true, true); release(); await Promise.all([completion, settlement]);
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await expect(page.locator('.wp-version-history-row')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Back to first page', exact: true })).toHaveCount(0);
      } finally { release(); page.off('requestfinished', onSettled); page.off('requestfailed', onSettled); }
    }, { browserOrigin, prepareSavedWork: async setup => { saved = await prepareLibraryWindow(setup); } });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
});
