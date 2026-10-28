import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { compare } from '../compare.js';

const fonts = ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}b,strong{font-weight:600}';
for (const width of [1440, 390, 820, 821]) for (const view of ['script', 'edit', 'history'] as const) test(`${view} material main reference at ${width}`, async ({ page, context }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4179') throw new Error('Unauthorized material visual egress');
    if (route.request().method() !== 'GET') throw new Error('Viewing/local editing must not mutate');
    await route.continue();
  });
  await context.route('**/references/app-r11.css', async (route) => { const response = await route.fetch(); await route.fulfill({ response, body: `${await response.text()}\n${fonts}` }); });
  await page.goto('/references/flow2-step2-r74.html');
  await page.addStyleTag({ content: fonts });
  await page.evaluate((view) => {
    const required = (selector: string) => { const element = document.querySelector(selector); if (!element) throw new Error(`Missing reference ${selector}`); return element; };
    required('#p-script > section:first-child > p').textContent = 'Mercer and Vale sit side by side on the gallery bench.';
    required('.breakdown li:first-child p').textContent = 'Both of them, seen together from the front.';
    required('.breakdown li:nth-child(2) p').textContent = 'Close on Vale as he recognises Mercer.';
    required('.breakdown li:nth-child(3)').remove();
    // Exact-version read-only prerequisites supply no shot-list editor or look mutations.
    required('#p-script > section:nth-child(2) .edit').remove();
    document.querySelectorAll('#p-script .chip .x,#p-script .chip.add,.ptabs .dot').forEach((element) => element.matches('.dot') ? element.classList.remove('dot') : element.remove());
    required('#p-script').insertAdjacentHTML('beforeend', `<details class="take-hist" ${view === 'history' ? 'open' : ''}><summary>Version history · 1 earlier</summary><div class="th-row" style="grid-template-columns:1fr auto"><span class="ftitle"><b>Version 6</b></span><button class="use" disabled style="opacity:.45">Use this version</button></div></details>`);
    if (view === 'edit') {
      required('#p-script > section:first-child > p').outerHTML = '<textarea rows="6" aria-label="What happens" style="display:block;width:100%;padding:8px 12px;border:1px solid var(--input-border);border-radius:10px;background:var(--bg);color:var(--fg);font:inherit;font-size:14px;line-height:1.5;resize:none">Mercer and Vale sit side by side on the gallery bench.</textarea><div class="approved-edit-actions" style="display:flex;align-items:center;gap:8px;margin-top:10px"><button class="choice">Cancel</button><button class="send" disabled>Save</button></div>';
      required('#p-script > section:first-child .edit').remove();
    }
  }, view);
  const selectors = ['.panel', '.ptabs,.wp-tabs', '#p-script > section:first-child,.wp-script > section:first-child', '.breakdown,.wp-script-shots', '.chips,.wp-script-look', '.take-hist,.wp-version-history', ...(view === 'edit' ? ['textarea', '.approved-edit-actions,.wp-version-edit-actions'] : []), ...(view === 'history' ? ['.th-row,.wp-version-history-row', '.use,.wp-version-use .wp-button-secondary'] : [])];
  const measure = () => page.evaluate((selectors) => selectors.map((selector) => {
    const node = document.querySelector(selector); if (!node) throw new Error(`Missing expected measurement ${selector}`);
    const style = getComputedStyle(node);
    return { selector, box: node.getBoundingClientRect().toJSON(), styles: Object.fromEntries(['font','color','background-color','border','padding','margin','opacity'].map((key) => [key, style.getPropertyValue(key)])) };
  }), selectors);
  await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); });
  const reference = await measure();
  const expected = await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
  await page.goto('/material.html?reference=script');
  await page.waitForFunction(() => !!(window as unknown as { materialTest?: unknown }).materialTest);
  await page.evaluate(() => (window as unknown as { materialTest: { configure(value: unknown): void } }).materialTest.configure({ prerequisites: true }));
  await expect(page.getByText('Natural colour', { exact: true })).toBeVisible();
  if (view === 'edit') await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
  if (view === 'history') await page.locator('.wp-version-history summary').click();
  await page.mouse.move(1, 1);
  await page.evaluate(async () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); await document.fonts.ready; scrollTo(0, 0); });
  const actual = await measure();
  await writeFile(info.outputPath('geometry.json'), JSON.stringify({ reference, actual }, null, 2));
  const screenshot = await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
  const changedPixels = await compare(expected, screenshot, info.outputPath('comparison'));
  await writeFile(info.outputPath('result.json'), JSON.stringify({ view, width, changedPixels, tolerance: 0, revision: info.config.metadata, browser: context.browser()?.version(), source: 'docs/design/flow2-step2-r74.html#p-script', sourceSha256: createHash('sha256').update(await readFile('docs/design/flow2-step2-r74.html')).digest('hex'), cssSha256: createHash('sha256').update(await readFile('docs/design/app-r11.css')).digest('hex'), approval: 'docs/design/design.md#shell-and-remaining-phase-2-feedback', substitutions: 'Explicit exact-version text/shot/look prerequisites, no untyped shot editor or look mutations; Script history reuses r82 take-hist/th-row/use without an unavailable thumbnail; existing disabled-control opacity .45; approved inline editor with Cancel then Save. Only MaterialPanel is mounted in inert tracked surroundings, never seeded product work.' }, null, 2));
  expect(actual.map((item) => item.box)).toEqual(reference.map((item) => item.box));
  expect(changedPixels).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
