import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '../material-network.js';
import { startReadBackend } from '../qualified-saved-backend.js';
import { libraryReuseReference, mountReuseLibrary } from '../library-reuse-reference.js';
import { settleCapture } from '../capture.js';
import { compare } from '../compare.js';
import type { prepareLibraryReuseWork as Prepare } from '../../../apps/api/test/library-reuse-work.js';
import type { OperationResponse } from '../../../packages/contracts/src/index.js';

for (const width of [1440, 390, 820, 821]) test(`typed Library main surface matches independent approved sources at ${width}`, async ({ page, context, materialNetwork }, info) => {
  test.setTimeout(180000);
  const { prepareLibraryReuseWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/library-reuse-work.js')).href) as { prepareLibraryReuseWork: typeof Prepare };
  const backend = await startReadBackend(prepareLibraryReuseWork);
  try {
    const { target, saved } = backend.data;
    const facts = new Map([[saved.script.id, { name: 'Station script', sub: 'Version 1 · Script' }], [saved.builtin.id, { name: 'Station script', sub: 'Version 1 · Script' }], [saved.reference.id, { name: 'Ada reference', sub: 'Version 1 · character' }], [saved.secondReference.id, { name: 'Station reference', sub: 'Version 1 · environment' }], [saved.planning.id, { name: 'Storyboard', sub: 'Version 1 · Storyboard' }]]);
      const height = width === 390 ? 844 : 900; await page.setViewportSize({ width, height });
      materialNetwork.expectOperations(...[`/v1/conversations/${saved.conversationId}/workspace`, `/v1/conversations/${saved.conversationId}/generation-requests`, `/v1/versions/${saved.script.id}`, '/v1/library'].map(path => ({ origin: target.origin, method: 'GET', path, query: {}, count: 1 })));
      await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
      await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountId, conversationId: saved.conversationId });
      await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
      const response = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/library');
      if (width <= 820) await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('button', { name: 'Library', exact: true }).click();
      const library = await (await response).json() as OperationResponse<'library'>; await expect(page.locator('.wp-picker-tile')).toHaveCount(5);
      const items = library.items.map(item => { const fact = facts.get(item.latestVersion.id); if (!fact) throw new Error('Unexpected visual fixture identity'); return fact; });
      const source = await libraryReuseReference('library-ready'), reference = await context.newPage();
      await reference.setViewportSize({ width, height }); await mountReuseLibrary(reference, source, items);
      const measure = async (side: typeof page) => {
        await side.bringToFront(); await settleCapture(side);
        return side.locator('.wp-picker').evaluate(node => {
          const box = node.getBoundingClientRect(), body = node.querySelector('.wp-picker-body')!, grid = node.querySelector('.wp-picker-grid')!, tray = node.querySelector('.wp-picker-tray')!, g = grid.getBoundingClientRect(), b = body.getBoundingClientRect();
          return { width: box.width, height: box.height, gridWidth: g.width, inset: g.left - b.left, gap: getComputedStyle(grid).gap, trayInsideBody: body.contains(tray), overflow: document.documentElement.scrollWidth > innerWidth, horizontalOverflow: node.scrollWidth > node.clientWidth };
        });
      };
      const drawingGeometry = async (side: typeof page, selectors: string) => side.locator(selectors).evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect(), style = getComputedStyle(node);
        return { box: { x: box.x, y: box.y, width: box.width, height: box.height }, font: style.font, lineHeight: style.lineHeight, color: style.color, background: style.backgroundColor, border: style.border, radius: style.borderRadius, stroke: style.stroke, strokeWidth: style.strokeWidth, transform: style.transform };
      }));
      const referenceDrawing = await drawingGeometry(reference, '.reuse-kind,.lp-search svg'), actualDrawing = await drawingGeometry(page, '.wp-picker-pill,.wp-search-control svg');
      await writeFile(info.outputPath(`${width}-drawing.json`), JSON.stringify({ referenceDrawing, actualDrawing }, null, 2));
      const expectedGeometry = await measure(reference), expected = await reference.locator('.wp-picker').screenshot({ path: info.outputPath(`${width}-reference.png`), animations: 'disabled' });
      await reference.screenshot({ path: info.outputPath(`${width}-reference-full.png`), fullPage: true, animations: 'disabled' });
      const actualGeometry = await measure(page), actual = await page.locator('.wp-picker').screenshot({ path: info.outputPath(`${width}-actual.png`), animations: 'disabled' });
      await page.screenshot({ path: info.outputPath(`${width}-actual-full.png`), fullPage: true, animations: 'disabled' });
      const changedPixels = await compare(expected, actual, info.outputPath(`${width}-comparison`));
      await writeFile(info.outputPath(`${width}-result.json`), JSON.stringify({ width, changedPixels, tolerance: 0, expectedGeometry, actualGeometry, referenceHashes: source.hashes, approval: 'docs/design/design.md#exact-library-reuse-and-reference-editing', revision: info.config.metadata, scope: 'Real built Auth/API/Postgres typed Library. Entire picker region; full context retained. Shared dialog framing remains covered by the existing picker suite.' }, null, 2));
      expect(actualGeometry).toEqual(expectedGeometry); expect(changedPixels).toBe(0);
      if (width === 1440) { await reference.addStyleTag({ content: '.wp-picker-grid { gap:15px!important }' }); const canary = await reference.locator('.wp-picker').screenshot({ animations: 'disabled' }); expect(await compare(expected, canary, info.outputPath('spacing-canary'))).toBeGreaterThan(0); }
      await reference.close();
  } finally { await backend.close(); }
});
