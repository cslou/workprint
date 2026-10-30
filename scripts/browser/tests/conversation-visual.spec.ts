import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from '../material-network.js';
import { navigationExamples, navigationReference, navigationGeometry } from '../navigation-reference.js';
import type { NavigationVisualInput } from '../../../apps/web/test/navigation-visual.types.js';
import { compare } from '../compare.js';
import { settleCapture } from '../capture.js';

const main = new Set(['navigation-closed', 'navigation-open', 'recents-first', 'history-loaded', 'history-empty', 'create-complete']);
for (const width of [1440, 390, 820, 821]) for (const example of navigationExamples) {
  if (width !== 1440 && width !== 390 && !main.has(example)) continue;
  test(`conversation ${example} approved reference at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const input = await navigationReference(page, example);
    await settleCapture(page);
    const referenceGeometry = await navigationGeometry(page, true);
    const reference = await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
    if (example === 'navigation-open' && width > 820) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/navigation-visual.html');
    await page.waitForFunction(() => !!(window as unknown as { navigationVisual?: unknown }).navigationVisual);
    await page.evaluate(serialized => (window as unknown as { navigationVisual: { configure(value: NavigationVisualInput): void } }).navigationVisual.configure(JSON.parse(serialized) as NavigationVisualInput), JSON.stringify(input));
    if (example === 'navigation-open') {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    }
    if (input.dialog || input.auth || example === 'navigation-open') await expect(page.getByRole('dialog')).toBeVisible();
    if (input.history?.thread) await expect(page.getByRole('tabpanel')).toHaveText('Loading this video is not available yet.');
    await settleCapture(page);
    if (example === 'recents-keyboard-focus') {
      await page.getByRole('button', { name: 'Next', exact: true }).focus();
      await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    }
    const actualGeometry = await navigationGeometry(page, false);
    await writeFile(info.outputPath('geometry.json'), JSON.stringify({ referenceGeometry, actualGeometry }, null, 2));
    const actual = await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    const changedPixels = await compare(reference, actual, info.outputPath('comparison'));
    const sources = example.startsWith('session-') ? ['docs/design/flow2-step1-r73.html', 'docs/design/app-r11.css', 'scripts/browser/account-reference.ts', 'scripts/browser/account-examples.ts', 'scripts/browser/navigation-reference.ts'] : [`apps/web/test/navigation-reference/${example}.html`, 'apps/web/test/navigation-reference/assets/reference.css', 'apps/web/test/navigation-reference/assets/preview.css', 'scripts/browser/navigation-reference.ts'];
    const sourceHashes = Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
    await writeFile(info.outputPath('result.json'), JSON.stringify({ state: example, width, reference: sources, sourceHashes, approval: 'docs/design/design.md#owned-conversation-navigation-and-history', approvalCommit: '74f2c4b45b21efeac5931060db97b232d815dd90', revision: info.config.metadata, changedPixels, tolerance: 0, referenceGeometry, actualGeometry }, null, 2));
    expect(referenceGeometry.overflow).toBe(false); expect(actualGeometry.overflow).toBe(false);
    expect(actualGeometry.boxes).toEqual(referenceGeometry.boxes); expect(actualGeometry.rows).toEqual(referenceGeometry.rows); expect(changedPixels).toBe(0);
  });
}
