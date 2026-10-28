import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compare } from '../compare.js';
import { settleCapture } from '../capture.js';
import { referenceFonts } from '../material-reference.js';
import { exportEntryMarkup, exportReference } from '../export-reference.js';
import { exportRecords, exportVideo } from '../../../apps/web/test/export-fixtures.js';

type Harness = { exportsTest: { configure(input: unknown): void } };
for (const view of ['entry', 'export', 'history', 'detail', 'failed', 'download', 'loading', 'history-unavailable', 'detail-unavailable']) for (const width of view === 'entry' ? [1440, 390, 820, 821] : [1440, 390]) test(`Export ${view} reference at ${width}`, async ({ page, context }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4179' || (request.method() !== 'GET' && !(request.method() === 'POST' && url.pathname === '/v1/conversations/conversation-a/exports'))) throw new Error('Unauthorized Export visual request');
    await route.continue();
  });
  await context.route('**/references/app-r11.css', async route => { const response = await route.fetch(); await route.fulfill({ response, body: `${await response.text()}\n${referenceFonts}` }); });
  await page.goto('/references/flow2-step1-r73.html');
  await page.addStyleTag({ content: referenceFonts });
  await page.evaluate(exportReference, { view, entry: exportEntryMarkup() });
  const selectors = view === 'entry' ? ['.panel', '.ptabs,.wp-tabs', '.export-entry,.wp-export-entry', '.take-item,.wp-video-row', '.need,.wp-request-card']
    : ['.lightbox .lb-panel,.wp-modal', '.lb-head,.wp-dialog-head', ...(view === 'history' ? ['.need,.wp-export-card'] : view === 'detail' || view === 'failed' ? ['.export-facts,.wp-export-facts', '.export-facts li,.wp-export-facts li'] : ['.lightbox .pempty,.wp-modal .wp-empty'])];
  const measure = () => page.evaluate(selectors => selectors.map(selector => {
    const nodes = [...document.querySelectorAll(selector)]; if (!nodes.length) throw new Error(`Missing paired Export geometry ${selector}`);
    return nodes.map(node => node.getBoundingClientRect().toJSON());
  }), selectors);
  await settleCapture(page);
  const referenceGeometry = await measure();
  await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
  const reference = view === 'entry' ? await page.screenshot({ animations: 'disabled', fullPage: true }) : await page.locator('.lightbox .lb-panel').screenshot({ animations: 'disabled' });
  await page.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (view === 'loading') { await new Promise<void>(() => {}); return; }
    if (view === 'entry') {
      await route.fulfill({ json: path.endsWith('generation-requests') ? { items: [], nextCursor: null } : exportVideo }); return;
    }
    if (view === 'history') { await route.fulfill({ json: { items: exportRecords, nextCursor: null } }); return; }
    if (view === 'detail' || view === 'failed') { await route.fulfill({ json: exportRecords[view === 'failed' ? 1 : 0] }); return; }
    await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Isolated visual failure' } } });
  });
  await page.goto('/exports.html'); await page.waitForFunction(() => !!(window as unknown as Harness).exportsTest);
  const mode = view === 'entry' ? 'videos' : view === 'export' ? 'entry' : view === 'history' || view === 'history-unavailable' || view === 'loading' ? 'history' : view === 'download' ? 'download' : 'detail';
  const title = mode === 'history' ? 'Export history' : mode === 'download' ? 'Download' : 'Export details';
  await page.evaluate(input => (window as unknown as Harness).exportsTest.configure(input), { apiOrigin: 'http://127.0.0.1:4179', mode, ...(view === 'entry' || view === 'export' ? {} : { dialogTitle: title }), ...(view === 'failed' ? { recordId: 'export-failed' } : {}) });
  if (view === 'export') await page.getByRole('button', { name: 'Export', exact: true }).click();
  else if (view !== 'entry') await page.getByRole('button', { name: 'Open dialog', exact: true }).click();
  if (view === 'entry') await expect(page.locator('.wp-request-card')).toHaveCount(1);
  else if (view === 'history') await expect(page.locator('.wp-export-card')).toHaveCount(2);
  else if (view === 'detail' || view === 'failed') await expect(page.locator('.wp-export-facts')).toHaveCount(1);
  else await expect(page.locator('.wp-modal .wp-empty')).toBeVisible();
  await settleCapture(page);
  const actualGeometry = await measure();
  await writeFile(info.outputPath('geometry.json'), JSON.stringify({ reference: referenceGeometry, actual: actualGeometry }, null, 2));
  await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
  const actual = view === 'entry' ? await page.screenshot({ animations: 'disabled', fullPage: true }) : await page.locator('.wp-modal').screenshot({ animations: 'disabled' });
  const changedPixels = await compare(reference, actual, info.outputPath('comparison'));
  await writeFile(info.outputPath('result.json'), JSON.stringify({ view, width, changedPixels, tolerance: 0, revision: info.config.metadata, source: 'docs/design/demo-18.html#p-takes + app-r11.css viewer/need/status + approved substitutions', sourceSha256: createHash('sha256').update(await readFile('docs/design/demo-18.html')).digest('hex'), approval: 'docs/design/design.md#shell-and-remaining-phase-2-feedback', browser: context.browser()?.version(), note: 'Labelled read-only fixtures; layout only, not export processing. Full-context captures accompany modal-region comparison.' }, null, 2));
  expect(actualGeometry).toEqual(referenceGeometry); expect(changedPixels).toBe(0);
});
