import { expect, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compare } from './compare.js';
import { settleCapture } from './capture.js';
import { referenceFonts } from './material-reference.js';
import { exportEntryMarkup } from './export-reference.js';
import { requestReference, storyboardReference } from './storyboard-reference.js';

/** Shared paired capture contract; expected markup remains independent tracked-reference substitutions. */
export async function captureStoryboardPair(page: Page, context: BrowserContext, info: TestInfo, width: number, view: 'storyboard' | 'board' | 'panel' | 'videos', edit?: 'shot' | 'panel') {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await context.route('**/*', async route => { if (new URL(route.request().url()).origin !== 'http://127.0.0.1:4179' || route.request().method() !== 'GET') throw new Error('Unauthorized visual request'); await route.continue(); });
  await context.route('**/references/app-r11.css', async route => { const response = await route.fetch(); await route.fulfill({ response, body: `${await response.text()}\n${referenceFonts}` }); });
  const source = await readFile('docs/design/flow2-step7-r79.html', 'utf8');
  await page.goto('/references/flow2-step1-r73.html'); await page.addStyleTag({ content: referenceFonts });
  if (view === 'videos') await page.evaluate(requestReference, {});
  await page.evaluate(storyboardReference, { source, view, exportEntry: exportEntryMarkup(true), ...(edit ? { edit } : {}) });
  const selectors = ['.panel', '.ptabs,.wp-tabs', ...(view === 'videos' ? ['.take-item,.wp-video-row', '.take-hist,.wp-version-history,.wp-request-details', '.need,.wp-request-card'] : ['.sb-shot,.wp-storyboard-shot', '.sb-panel,.wp-storyboard-panel']), ...(view === 'panel' ? ['.lb-panel.wide,.wp-modal', '.notes,.wp-panel-version p', '.choose,.wp-version-use-viewer .wp-button-primary'] : view === 'board' ? ['.lb-panel.board,.wp-modal-board', '.lb-scroll,.wp-storyboard-board', '.bshot,.wp-board-shot', '.bgrid,.wp-board-grid', '.plabel .edit,.wp-version-pencil .wp-button-icon', '.viewboard,.wp-storyboard > .wp-button-secondary', 'html,body'] : []), ...(edit ? ['textarea', '.approved-edit-actions,.wp-version-edit-actions', '.approved-edit-actions button,.wp-version-edit-actions button'] : [])];
  const measure = () => page.evaluate(selectors => selectors.map(selector => { const nodes = [...document.querySelectorAll(selector)]; if (!nodes.length) throw new Error(`Missing paired geometry ${selector}`); return { selector, boxes: nodes.map(node => node.getBoundingClientRect().toJSON()), styles: nodes.map(node => { const style = getComputedStyle(node); return Object.fromEntries(['font', 'line-height', 'color', 'background', 'border', 'border-radius', 'appearance', 'position', 'z-index', 'padding', 'margin', 'transform', 'opacity', 'box-shadow', 'overflow', 'height'].map(key => [key, style.getPropertyValue(key)])); }) }; }), selectors);
  await settleCapture(page);
  const reference = await measure(); const expected = await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
  await page.goto('/storyboard-visual.html'); await page.waitForFunction(() => !!(window as unknown as { storyboardVisual?: unknown }).storyboardVisual);
  await page.evaluate(view => (window as unknown as { storyboardVisual: { configure(input: unknown): void } }).storyboardVisual.configure({ view }), view);
  if (view === 'panel') await page.getByRole('button', { name: 'View Panel 1.1 version 2', exact: true }).click();
  else if (view === 'board') await page.getByRole('button', { name: 'View storyboard', exact: true }).click();
  else await expect(page.locator(view === 'videos' ? '.wp-video-row' : '.wp-storyboard-shot')).toBeVisible();
  if (edit) await page.getByRole('button', { name: edit === 'shot' ? 'Edit Shot intent' : 'Edit Panel description', exact: true }).click();
  await settleCapture(page);
  const actual = await measure(); await writeFile(info.outputPath('geometry.json'), JSON.stringify({ reference, actual }, null, 2));
  const image = await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
  const changedPixels = await compare(expected, image, info.outputPath('comparison'));
  await writeFile(info.outputPath('result.json'), JSON.stringify({ view, edit: edit ?? null, width, changedPixels, tolerance: 0, revision: info.config.metadata, browser: context.browser()?.version(), source: 'docs/design/flow2-step7-r79.html + flow2-step10-r82.html individual history/control treatments', sourceSha256: createHash('sha256').update(source).digest('hex'), approval: 'docs/design/design.md#shell-and-remaining-phase-2-feedback', substitutions: 'One labelled read-only typed Shot/Panel/version example. Unsupported camera/duration/images omitted, not guessed. Shared Script text sections, approved six-row editor with Cancel then Save, and exact-version Use controls; no opaque schema or successful backend fixture. Inert tracked shell surrounds are not new product capability.' }, null, 2));
  expect(actual.map(row => row.boxes)).toEqual(reference.map(row => row.boxes)); expect(changedPixels).toBe(0);
}
