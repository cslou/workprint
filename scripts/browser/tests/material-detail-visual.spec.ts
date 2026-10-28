import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import { compare } from '../compare.js';
import { referenceFonts, scriptPrerequisite, assetPrerequisite } from '../material-reference.js';

let origin = ''; let token = ''; let release!: () => void; let backend: Promise<void>;
const cleanup: (() => void | Promise<void>)[] = [];
test.beforeAll(async () => {
  test.setTimeout(120000);
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let ready!: () => void; let fail!: (reason: unknown) => void;
  const available = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
  backend = verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async (fixture) => { origin = fixture.origin; token = fixture.accessTokens[0]!; ready(); await gate; }, { browserOrigin: 'http://127.0.0.1:4179' });
  void backend.catch(fail); await available;
});
test.afterAll(async () => { try { release?.(); await backend; } finally { for (const fn of cleanup.reverse()) await fn(); } });

for (const width of [1440, 390, 820, 821]) for (const view of ['assets', 'viewer', 'save', 'use'] as const) {
  if ((view === 'save' || view === 'use') && width !== 1440 && width !== 390) continue;
  test(`${view} material main reference at ${width}`, async ({ page, context }, info) => {
    await info.attach('prerequisite', { body: 'Labelled exact-version public projections in inert tracked surroundings. No seeded records, successful response fabrication or persistence. Action feedback is from the real built backend/Supabase admission.', contentType: 'text/plain' });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    let allowMutation = false; const mutations: string[] = [];
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (!['http://127.0.0.1:4179', origin].includes(url.origin)) throw new Error('Unauthorized material egress');
      if (route.request().method() === 'POST') { if (!allowMutation || url.origin !== origin) throw new Error('Inspection attempted mutation'); mutations.push(url.pathname); }
      await route.continue();
    });
    await context.route('**/references/app-r11.css', async (route) => { const response = await route.fetch(); await route.fulfill({ response, body: `${await response.text()}\n${referenceFonts}` }); });
    await page.goto('/references/flow2-step2-r74.html');
    await page.addStyleTag({ content: `${referenceFonts}.pv .approved-feedback{font-size:13px;color:var(--fg-subtle);margin:10px 0 0}` });
    const asset = view === 'assets' || view === 'viewer';
    if (asset) await page.evaluate(assetPrerequisite, { view, source: await readFile('docs/design/flow2-step10-r82.html', 'utf8') });
    else await page.evaluate(scriptPrerequisite, view);
    const selectors = ['.panel', '.ptabs,.wp-tabs', ...(asset ? ['.need.asset,.wp-asset-row', '.need.asset img,.wp-asset-row img', '.need.asset .status,.wp-asset-row .wp-status'] : ['#p-script > section:first-child,.wp-script > section:first-child']), ...(view === 'viewer' ? ['.lightbox,.wp-modal-overlay', '.lb-panel,.wp-modal', '.lb-head,.wp-dialog-head', '.lb-scroll,.wp-sheet-scroll', '.livesheet header,.wp-reference-sheet header', '.sgrid,.wp-sheet-grid', '.ssec.hero img,.wp-sheet-hero img', '.ssec.hero figcaption,.wp-sheet-hero figcaption', '.lightbox .take-hist summary,.wp-modal .wp-version-history summary'] : []), ...(view === 'save' ? ['textarea', '.approved-edit-actions,.wp-version-edit-actions', '.approved-edit-actions button:first-child,.wp-version-edit-actions button:first-child', '.approved-edit-actions button:last-child,.wp-version-edit-actions button:last-child'] : []), ...(view === 'use' ? ['.take-hist,.wp-version-history', '.th-row,.wp-version-history-row', '.use,.wp-version-use .wp-button-secondary'] : []), ...(asset ? [] : ['.approved-feedback,[role="status"]'])];
    const settle = () => page.evaluate(async () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode())); scrollTo(0, 0); });
    const measure = () => page.evaluate((selectors) => selectors.map((selector) => { const node = document.querySelector(selector); if (!node) throw new Error(`Missing expected ${selector}`); const style = getComputedStyle(node); return { selector, box: node.getBoundingClientRect().toJSON(), styles: Object.fromEntries(['font','color','background-color','border','padding','margin','opacity'].map((key) => [key, style.getPropertyValue(key)])) }; }), selectors);
    await settle(); const reference = await measure();
    const expected = await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
    await page.goto('/material.html?reference=material');
    await page.waitForFunction(() => !!(window as unknown as { materialTest?: unknown }).materialTest);
    await page.evaluate((input) => (window as unknown as { materialTest: { configure(value: unknown): void } }).materialTest.configure(input), { prerequisites: true, tab: asset ? 'assets' : 'script', apiOrigin: origin, token });
    if (view === 'viewer') { await page.locator('.wp-asset-row').click(); await expect(page.getByRole('dialog')).toBeVisible(); }
    if (view === 'save' || view === 'use') {
      if (view === 'save') { await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await page.getByRole('textbox').fill('Mercer stays still, then gives a small nod.'); }
      else await page.locator('.wp-version-history summary').click();
      allowMutation = true;
      const response = page.waitForResponse((value) => value.request().method() === 'POST');
      await page.getByRole('button', { name: view === 'save' ? 'Save' : 'Use this version', exact: true }).click();
      expect((await response).status()).toBe(501);
      await expect(page.getByRole('status')).toHaveText(view === 'save' ? 'Saving is not available yet. Your unsaved text is retained.' : 'Using this version is not available yet. The current selection is unchanged.');
      expect(mutations).toEqual([`/v1/conversations/read-only-conversation/${view === 'save' ? 'versions' : 'uses'}`]);
    } else expect(mutations).toEqual([]);
    await page.mouse.move(1, 1); await settle(); const actual = await measure();
    await writeFile(info.outputPath('geometry.json'), JSON.stringify({ reference, actual }, null, 2));
    const screenshot = await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    const changedPixels = await compare(expected, screenshot, info.outputPath('comparison'));
    const hashes = Object.fromEntries(await Promise.all(['flow2-step2-r74.html','flow2-step10-r82.html','app-r11.css'].map(async (name) => [name, createHash('sha256').update(await readFile(`docs/design/${name}`)).digest('hex')])));
    await writeFile(info.outputPath('result.json'), JSON.stringify({ view, width, changedPixels, tolerance: 0, revision: info.config.metadata, browser: context.browser()?.version(), sources: hashes, approval: 'docs/design/design.md#shell-and-remaining-phase-2-feedback', substitutions: 'Read-only exact-version field/image prerequisites; tracked r82 Assets/live sheet in inert r74 frame; no invented attach/export/library metadata; shared version history and approved inline edit/501 feedback; real backend responses only.' }, null, 2));
    expect(actual.map((item) => item.box)).toEqual(reference.map((item) => item.box)); expect(changedPixels).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
