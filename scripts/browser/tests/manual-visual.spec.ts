import { writeFile } from 'node:fs/promises';
import { test, expect } from '../manual-backend.js';
import { manualReference, manualStates, mountManualReference } from '../manual-reference.js';
import { ownedPanelFrame } from '../owned-panel-frame.js';
import { settleCapture } from '../capture.js';
import { compare } from '../compare.js';

const main = ['script-read', 'reference-read', 'planning-read'];
for (const width of [1440, 390, 820, 821]) for (const state of manualStates.filter(state => main.includes(state) || width === 1440 || width === 390)) test(`manual ${state} tracked editor at ${width}`, async ({ page, context, materialNetwork, manualSavedWork }, info) => {
  const { target, saved } = manualSavedWork;
  const work = state === 'script-blocked' ? saved.changed : saved.ordinary;
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const source = await manualReference(state);
  const allow = (method: string, path: string, query: Record<string, string> = {}) => materialNetwork.expectOperations({ origin: target.origin, method, path, query, count: 1 });
  allow('GET', `/v1/conversations/${work.conversationId}/workspace`); allow('GET', `/v1/versions/${work.script.id}`);
  await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
  await ownedPanelFrame(page, source.base.html);
  await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: work.accountId, conversationId: work.conversationId, panelOnly: true });
  await expect(page.getByRole('tabpanel')).toContainText('Ada waits beside the station clock.');
  let label = 'What happens', artifact = work.script.artifactId;
  if (state.startsWith('reference')) {
    await page.getByRole('tab', { name: 'Assets', exact: true }).click(); allow('GET', `/v1/versions/${work.reference.id}`);
    await page.getByRole('button', { name: /Ada reference/ }).click(); label = 'Description'; artifact = work.reference.artifactId;
  } else if (state.startsWith('planning')) {
    await page.getByRole('tab', { name: 'Storyboard', exact: true }).click(); await page.getByRole('button', { name: 'View storyboard', exact: true }).click(); label = 'Panel description'; artifact = work.planning.artifactId;
  }
  let release = () => {}; let held: Promise<void> | undefined; let completed: Promise<void> | undefined;
  try {
    if (!state.endsWith('-read')) {
      await page.getByRole('button', { name: `Edit ${label}`, exact: true }).click();
      const typed = state === 'script-rejected' ? '   ' : state.startsWith('reference') ? 'Ada wears a green wool coat with a repaired cuff. Keep the brass buttons and the small travel case.' : state.startsWith('planning') ? 'Ada looks toward the arriving train. Keep the station clock visible above her shoulder.' : 'Ada pauses beneath the station clock, then turns toward the platform.';
      await page.getByRole('textbox', { name: label, exact: true }).fill(typed);
      if (state !== 'script-edit') {
        const path = `/v1/conversations/${work.conversationId}/versions`;
        if (state !== 'script-rejected') allow('POST', path);
        if (state === 'script-saving') {
          let ready!: () => void, settled!: () => void; held = new Promise<void>(done => { ready = done; }); completed = new Promise<void>(done => { settled = done; }); const gate = new Promise<void>(done => { release = done; });
          await page.route(url => url.pathname === path, async route => { ready(); await gate; await route.abort('failed'); settled(); }, { times: 1 });
        } else if (state === 'script-unknown') await page.route(url => url.pathname === path, route => route.abort('failed'), { times: 1 });
        else if (state === 'script-signin') await page.route(url => url.pathname === path, route => { const headers = route.request().headers(); delete headers.authorization; return route.continue({ headers }); }, { times: 1 });
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        if (held) await held;
        await expect(page.getByRole('status')).toContainText(state === 'script-saving' ? 'Saving changes…' : state === 'script-signin' ? 'Sign-in required' : state === 'script-rejected' ? 'Changes were not saved' : state === 'script-unknown' ? 'Save could not be confirmed' : 'A newer version was saved');
        if (['script-review', 'script-ready', 'script-read-error', 'script-blocked'].includes(state)) {
          const path = `/v1/artifacts/${artifact}/versions`; allow('GET', path, { limit: '1' });
          if (state === 'script-read-error') await page.route(url => url.pathname === path, async route => { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }, { times: 1 });
          await page.getByRole('button', { name: 'Review latest version', exact: true }).click();
          if (state === 'script-ready') { await expect(page.getByRole('button', { name: 'Continue with my text', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Continue with my text', exact: true }).click(); }
          else if (state === 'script-review') await expect(page.locator('.wp-manual-latest')).toBeVisible();
          else await expect(page.getByRole('status')).toContainText(state === 'script-read-error' ? 'could not be loaded' : 'saved structure changed');
        }
      }
    }
    const reference = await context.newPage(); await reference.setViewportSize({ width, height: width === 390 ? 844 : 900 }); await mountManualReference(reference, source);
    const actualSelector = state.startsWith('planning') ? '.wp-board-panel .wp-manual-editor' : state.startsWith('reference') ? '.wp-reference-sheet .wp-manual-editor' : '.wp-script .wp-manual-editor';
    const measure = async (side: typeof page, selector: string) => { await side.bringToFront(); await settleCapture(side); return side.locator(selector).evaluate(node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, overflow: document.documentElement.scrollWidth > innerWidth, controls: [...node.querySelectorAll('button')].map(button => { const rect = button.getBoundingClientRect(), css = getComputedStyle(button); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: css.font, padding: css.padding, border: css.border, radius: css.borderRadius, background: css.backgroundColor, opacity: css.opacity }; }), field: [...node.querySelectorAll('textarea')].map(field => ({ rows: field.rows, readonly: field.readOnly, width: field.getBoundingClientRect().width, height: field.getBoundingClientRect().height })) }; }); };
    const expectedGeometry = await measure(reference, '.ref-manual'); const referenceDiagnostics = await reference.locator('.ref-manual').evaluate(node => ({ html: node.outerHTML, buttons: [...node.querySelectorAll('button')].map(button => { const css = getComputedStyle(button); return Object.fromEntries([...css].filter(key => !key.startsWith('--')).map(key => [key, css.getPropertyValue(key)])); }) })); await writeFile(info.outputPath('reference-styles.json'), JSON.stringify(referenceDiagnostics, null, 2)); const expected = await reference.locator('.ref-manual').screenshot({ path: info.outputPath('reference-region.png'), animations: 'disabled' }); await reference.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' }); await reference.close();
    const actualGeometry = await measure(page, actualSelector); const diagnostics = await page.locator(actualSelector).evaluate(node => ({ html: node.outerHTML, buttons: [...node.querySelectorAll('button')].map(button => { const css = getComputedStyle(button); return Object.fromEntries([...css].filter(key => !key.startsWith('--')).map(key => [key, css.getPropertyValue(key)])); }) })); await writeFile(info.outputPath('actual-styles.json'), JSON.stringify(diagnostics, null, 2)); const actual = await page.locator(actualSelector).screenshot({ path: info.outputPath('actual-region.png'), animations: 'disabled' }); await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    await writeFile(info.outputPath('geometry.json'), JSON.stringify({ expectedGeometry, actualGeometry }, null, 2));
    const changedPixels = await compare(expected, actual, info.outputPath('comparison'));
    await writeFile(info.outputPath('result.json'), JSON.stringify({ state, width, expectedGeometry, actualGeometry, changedPixels, tolerance: 0, referenceHashes: source.base.hashes, revision: info.config.metadata, approval: 'docs/design/design.md#manual-save-recovery', scope: 'Real existing-record consumers and built API/Postgres stale/admission outcomes; local editing and explicit reads; no runtime state overrides. Tracked r74/r79/r82 primitives with recorded recovery controls, matched synthetic text and version 1/2 counters. Region pixel comparison plus full context captures and two-sided geometry/overflow. No ignored inspection input or application CSS normalization.' }, null, 2));
    const boxes = (value: typeof actualGeometry) => ({ ...value, controls: value.controls.map(({ x, y, width, height }) => ({ x, y, width, height })) });
    expect(boxes(actualGeometry)).toEqual(boxes(expectedGeometry)); expect(changedPixels).toBe(0);
  } finally { release(); if (completed) await completed; }
});
