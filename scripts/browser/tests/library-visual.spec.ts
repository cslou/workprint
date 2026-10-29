import { browserOrigin } from '../origin.js';
import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compare } from '../compare.js';
import { settleCapture } from '../capture.js';

// Approved in the Story 2 continuation; independent expected copy, not imported from the component.
const states = [
  ['unauthenticated', 'Sign-in required', 'Your Library cannot be loaded without a valid session.'],
  ['unavailable', 'Library not available yet', 'Library loading is not implemented in this build.'],
  ['error', 'Library could not be loaded', 'No saved material was changed.'],
  ['loading', 'Loading Library…', 'Looking for saved characters, places and props.'],
  ['unconfigured', 'Library connection not configured', 'No API origin is configured for this build.'],
  ['empty', 'Nothing saved yet', 'Your saved work will appear here.'],
] as const;
for (const width of [1440, 390, 820, 821]) for (const [state, title, message] of states) {
  test(`Library ${state} approved reference at ${width}`, async ({ page, context }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await context.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== browserOrigin) throw new Error('Unauthorized visual egress');
      await route.continue();
    });
    await page.goto('/references/demo-05.html#lib-yours');
    await page.addStyleTag({ content: ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}.lp-empty b{font-weight:600}' });
    await page.locator('.lp-empty').evaluate((element, copy) => { element.querySelector('b')!.textContent = copy[0] ?? ''; element.querySelector('span')!.textContent = copy[1] ?? ''; }, [title, message]);
    await settleCapture(page);
    const bounds = await page.locator('.lp-empty').boundingBox();
    const reference = await page.locator('.lp-empty').screenshot({ path: info.outputPath('reference-region.png'), animations: 'disabled' });
    const referenceFull = await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
    await page.goto('/library.html?reference');
    await page.waitForFunction(() => typeof (window as unknown as { libraryTest?: { configure?: unknown } }).libraryTest?.configure === 'function');
    let release: (() => void) | undefined;
    await page.route('**/v1/library', async (route) => {
      if (state === 'loading') await new Promise<void>((resolve) => { release = resolve; });
      if (state === 'error') await route.abort();
      else await route.fulfill({ status: state === 'empty' ? 200 : state === 'unauthenticated' ? 401 : 501, contentType: 'application/json', body: JSON.stringify(state === 'empty' ? { items: [], nextCursor: null } : { error: { code: state === 'unauthenticated' ? 'unauthenticated' : 'not_implemented', message: 'Controlled visual prerequisite' } }) });
    });
    await page.evaluate((apiOrigin) => (window as unknown as { libraryTest: { configure(value: unknown): void } }).libraryTest.configure({ apiOrigin, token: null, accountId: 'read-only-visual-scope' }), state === 'unconfigured' ? '' : browserOrigin);
    await expect(page.getByRole('status')).toHaveText(title + message);
    await settleCapture(page);
    expect(await page.getByRole('status').boundingBox()).toEqual(bounds);
    const actual = await page.getByRole('status').screenshot({ path: info.outputPath('actual-region.png'), animations: 'disabled' });
    const actualFull = await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    const changed = await compare(reference, actual, info.outputPath('comparison'));
    const fullPageChanged = await compare(referenceFull, actualFull, info.outputPath('full-page-comparison'));
    await writeFile(info.outputPath('result.json'), JSON.stringify({ state, width, reference: 'docs/design/demo-05.html#lib-yours', referenceHash: createHash('sha256').update(await readFile('docs/design/demo-05.html')).digest('hex'), approval: 'docs/design/design.md#library-feedback', revision: info.config.metadata, browser: context.browser()?.version(), changedPixels: changed, fullPageChangedPixels: fullPageChanged, tolerance: 0, scope: 'Actual Library consumer, controlled read-only state, approved reference surroundings' }, null, 2));
    release?.();
    expect(changed).toBe(0);
    expect(fullPageChanged).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
