import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { test, expect } from '../material-network.js';
import { browserOrigin } from '../origin.js';
import { settleCapture } from '../capture.js';
import { compare } from '../compare.js';
import { ownedLibraryReference, type OwnedLibraryState } from '../owned-read-reference.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission, BuiltAdmissionTarget } from '../../../apps/api/test/auth-built-fixture.js';
import type { preparePagedSavedWork as PreparePagedSavedWork, PagedSavedWork } from '../../../apps/api/test/paged-saved-work.js';

let target: BuiltAdmissionTarget; let saved: PagedSavedWork;
let release!: () => void; let backend: Promise<void>;
const cleanup: (() => void | Promise<void>)[] = [];
test.beforeAll(async () => {
  test.setTimeout(120000);
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const { preparePagedSavedWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/paged-saved-work.js')).href) as { preparePagedSavedWork: typeof PreparePagedSavedWork };
  const gate = new Promise<void>(resolve => { release = resolve; });
  let ready!: () => void; let fail!: (error: unknown) => void;
  const available = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
  backend = verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async value => { target = value; ready(); await gate; }, { browserOrigin, prepareSavedWork: async setup => { saved = await preparePagedSavedWork(setup); } });
  void backend.catch(fail); await available;
});
test.afterAll(async () => { try { release?.(); await backend; } finally { for (const fn of cleanup.reverse()) await fn(); } });

for (const width of [1440, 390, 820, 821]) for (const state of ['page', 'loading', 'error', 'complete', 'empty'] as OwnedLibraryState[]) test(`owned Library ${state} approved pagination at ${width}`, async ({ page, context, materialNetwork }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const allow = (path: string, query: Record<string, string> = {}) => materialNetwork.expectOperations({ origin: target.origin, method: 'GET', path, query, count: 1 });
  const conversationId = state === 'empty' ? saved.emptyB : saved.conversationA;
  allow(`/v1/conversations/${conversationId}/workspace`);
  if (state !== 'empty') { allow(`/v1/versions/${saved.current.id}`); allow(`/v1/conversations/${conversationId}/generation-requests`); }
  await page.goto('/saved-work.html');
  await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
  await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[state === 'empty' ? 1 : 0]!, accountId: state === 'empty' ? saved.accountB : saved.accountA, conversationId });
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  if (state !== 'empty') await expect(page.getByRole('tabpanel')).toContainText('Ada waits beside the station clock.');
  allow('/v1/library');
  const firstResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/library');
  if (width <= 820) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  const first = await (await firstResponse).json() as { nextCursor: string | null };
  if (state !== 'empty' && !first.nextCursor) throw new Error('Required stored pagination prerequisite is absent');
  await expect(page.locator('.wp-picker-tile')).toHaveCount(state === 'empty' ? 0 : 20);
  if (state === 'empty') await expect(page.getByRole('dialog')).toContainText('Your saved work will appear here.');
  let resume = () => {}; let completion: Promise<unknown> | undefined;
  try {
    if (state !== 'page' && state !== 'empty') {
      allow('/v1/library', { cursor: first.nextCursor! });
      if (state === 'loading' || state === 'error') {
        let held!: () => void;
        const available = new Promise<void>(resolve => { held = resolve; });
        const gate = new Promise<void>(resolve => { resume = resolve; });
        await page.route(url => url.pathname === '/v1/library' && url.searchParams.has('cursor'), async route => {
          const response = await route.fetch();
          if (response.status() !== 200) throw new Error('Required real owned next-page read failed');
          held();
          if (state === 'error') await route.abort('failed');
          else { await gate; await route.fulfill({ response }); }
        });
        if (state === 'loading') completion = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/library' && new URL(response.url()).searchParams.has('cursor'));
        await page.getByRole('button', { name: 'Load more', exact: true }).press('Enter'); await available;
        await expect(page.getByRole('status')).toHaveText(state === 'loading' ? 'Loading more Library items…' : 'More Library items could not be loaded. The items already shown are unchanged.');
      } else {
        await page.getByRole('button', { name: 'Load more', exact: true }).press('Enter');
        await expect(page.locator('.wp-picker-tile')).toHaveCount(24);
      }
    }
    const source = await ownedLibraryReference(state);
    const reference = await context.newPage();
    await reference.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await reference.setContent(source.html);
    if (state !== 'empty') await reference.evaluate(complete => {
      const grid = document.querySelector('.wp-picker-grid');
      const template = grid?.firstElementChild;
      if (!grid || !template) throw new Error('Approved tile template missing');
      const rows = Array.from({ length: complete ? 24 : 20 }, (_, index) => {
        const tile = template.cloneNode(true) as HTMLElement;
        tile.querySelector('.wp-picker-label')!.textContent = complete && index === 22 ? 'Reference' : 'Script';
        tile.querySelector('.wp-picker-sub')!.textContent = complete && index === 23 ? 'Version 23' : 'Version 1';
        return tile;
      });
      grid.replaceChildren(...rows);
    }, state === 'complete');
    const selector = state === 'empty' ? '.wp-library-feedback' : state === 'complete' ? '.wp-picker-tile:last-child' : '.preview-library-controls';
    const actualSelector = state === 'empty' ? '.wp-library-feedback' : state === 'complete' ? '.wp-picker-tile:last-child' : '.wp-picker-pagination';
    const measure = async (side: typeof page, selector: string) => {
      if (state !== 'empty') await side.locator('.wp-picker-body').evaluate(node => { node.scrollTop = node.scrollHeight; });
      await side.bringToFront(); await settleCapture(side);
      return await side.locator(selector).evaluate(node => {
        if (node.classList.contains('wp-library-feedback')) { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height, font: getComputedStyle(node).font, overflow: document.documentElement.scrollWidth > innerWidth }; }
        const body = node.closest('.wp-picker-body'); const grid = body?.querySelector('.wp-picker-grid'); const tray = body?.parentElement?.querySelector('.wp-picker-tray');
        if (!body || !grid || !tray || body.contains(tray)) throw new Error('Grid/tray containment differs from approved placement');
        const box = node.getBoundingClientRect(), g = grid.getBoundingClientRect();
        return { width: box.width, height: box.height, leftFromGrid: box.left - g.left, afterGrid: box.top - g.bottom, font: getComputedStyle(node).font, overflow: document.documentElement.scrollWidth > innerWidth };
      });
    };
    const expectedGeometry = await measure(reference, selector);
    const expected = await reference.locator(selector).screenshot({ path: info.outputPath('reference-region.png'), animations: 'disabled' });
    await reference.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
    await reference.close();
    const actualGeometry = await measure(page, actualSelector);
    const actual = await page.locator(actualSelector).screenshot({ path: info.outputPath('actual-region.png'), animations: 'disabled' });
    await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    const changedPixels = await compare(expected, actual, info.outputPath('comparison'));
    await writeFile(info.outputPath('result.json'), JSON.stringify({ state, width, changedPixels, tolerance: 0, expectedGeometry, actualGeometry, referenceHashes: source.hashes, approval: 'docs/design/design.md#phase-3-saved-work-reads', revision: info.config.metadata, scope: 'Real stored Library and native owned conversation; approved inert pagination region or terminal tile, with full context and independent geometry. Existing picker visual suite owns unchanged surrounding chrome.' }, null, 2));
    expect(actualGeometry).toEqual(expectedGeometry); expect(changedPixels).toBe(0);
  } finally { resume(); if (completion) { await completion; await expect(page.locator('.wp-picker-tile')).toHaveCount(24); } }
});
