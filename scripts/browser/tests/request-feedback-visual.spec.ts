import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import { compare } from '../compare.js';
import { settleCapture } from '../capture.js';
import { referenceFonts } from '../material-reference.js';
import { requestReference } from '../storyboard-reference.js';

test('real unavailable cancellation reference at desktop and narrow', async ({ page, context }, info) => {
  test.setTimeout(120000);
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      await context.route('**/*', async route => { if (!['http://127.0.0.1:4179', origin].includes(new URL(route.request().url()).origin)) throw new Error('Unauthorized cancellation visual egress'); await route.continue(); });
      await context.route('**/references/app-r11.css', async route => { const response = await route.fetch(); await route.fulfill({ response, body: `${await response.text()}\n${referenceFonts}` }); });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.goto('/references/flow2-step1-r73.html'); await page.addStyleTag({ content: referenceFonts }); await page.evaluate(requestReference, { feedback: true });
        const measure = () => page.evaluate(() => ['.panel','.need,.wp-request-card','.choice,.wp-request-action button','#p-takes .pempty,.wp-panel-body .wp-empty'].map(selector => { const nodes = [...document.querySelectorAll(selector)]; if (!nodes.length) throw new Error(`Missing paired geometry ${selector}`); return { selector, boxes: nodes.map(node => node.getBoundingClientRect().toJSON()) }; }));
        await settleCapture(page);
        const reference = await measure(); const expected = await page.screenshot({ path: info.outputPath(`${width}-reference-full.png`), fullPage: true, animations: 'disabled' });
        await page.goto('/storyboard-visual.html'); await page.waitForFunction(() => !!(window as unknown as { storyboardVisual?: unknown }).storyboardVisual);
        await page.evaluate(input => (window as unknown as { storyboardVisual: { configure(input: unknown): void } }).storyboardVisual.configure(input), { origin, token: accessTokens[0] });
        const card = page.locator('[data-request-id="request-running"]');
        await expect(page.getByText('Generation requests are not available yet.', { exact: true })).toBeVisible();
        const response = page.waitForResponse(value => value.url() === `${origin}/v1/generation-requests/request-running/cancel`);
        await card.getByRole('button', { name: 'Cancel request', exact: true }).click(); expect((await response).status()).toBe(501);
        await expect(card.getByRole('status')).toHaveText('Cancelling this request is not available yet. The last known state is still shown.');
        await expect(card.getByRole('button', { name: 'Cancel request', exact: true })).toBeEnabled();
        await settleCapture(page);
        const actual = await measure(); await writeFile(info.outputPath(`${width}-geometry.json`), JSON.stringify({ reference, actual }, null, 2));
        const image = await page.screenshot({ path: info.outputPath(`${width}-actual-full.png`), fullPage: true, animations: 'disabled' });
        const changedPixels = await compare(expected, image, info.outputPath(`${width}-comparison`));
        await writeFile(info.outputPath(`${width}-result.json`), JSON.stringify({ width, changedPixels, tolerance: 0, revision: info.config.metadata, browser: context.browser()?.version(), source: 'docs/design/flow2-step1-r73.html#p-takes + app-r11.css item/disclosure/control treatments', approval: 'docs/design/design.md#shell-and-remaining-phase-2-feedback', response: 501, prerequisite: 'Labelled read-only public request examples, actual loopback admission for list/cancel; not persisted product work' }, null, 2));
        expect(actual.map(row => row.boxes)).toEqual(reference.map(row => row.boxes)); expect(changedPixels).toBe(0);
      }
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});
