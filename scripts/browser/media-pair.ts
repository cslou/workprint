import { browserOrigin } from './origin.js';
import { expect, type Page, type BrowserContext, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { capturePairSide, verifyCapturePair } from './capture-pair.js';

const source = 'flow1-step9-r90.html';
const fonts = ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}';
export const mediaReference = () => {
  for (const node of document.querySelectorAll('.lightbox')) node.setAttribute('style', 'display:none');
  const dialog = document.querySelector('#take-1');
  if (!dialog) throw new Error('Missing tracked single-clip reference');
  dialog.setAttribute('style', 'display:flex');
  const panel = dialog.querySelector('.lb-panel.wide');
  if (!panel) throw new Error('Missing tracked player panel');
  const title = panel.querySelector('.lb-head h2'); if (title) title.textContent = 'Version 2';
  const player = panel.querySelector('.player'); if (!player) throw new Error('Missing tracked player');
  player.innerHTML = '<video poster="/fixtures/clip-poster.png" preload="none" muted style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px"></video><span class="play big" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7Z"/></svg></span><span class="bar"><i></i></span><span class="time">0:00 / 0:02</span>';
  const notes = panel.querySelector('.notes'); if (notes) notes.textContent = 'Shot 1 · Version 2';
  const foot = panel.querySelector('.lb-foot'); if (foot) foot.innerHTML = '<button class="choose" type="button">Use this version</button>';
};
export async function captureMediaPair(page: Page, context: BrowserContext, info: TestInfo, width: number, state: 'player' | 'loading' | 'unavailable' | 'unauthenticated' | 'error') {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await context.route('**/*', async (route) => { const url = new URL(route.request().url()); if (url.origin !== browserOrigin || route.request().method() !== 'GET') throw new Error('Unauthorized visual request'); await route.continue(); });
  await page.goto(`/references/${source}`);
  await page.addStyleTag({ content: fonts });
  await page.evaluate(mediaReference);
  await page.addStyleTag({ content: '.lightbox{background:#1b1913!important}' });
  if (state !== 'player') {
    const copy = state === 'loading' ? 'Loading this video…' : state === 'unavailable' ? 'Loading this video is not available yet.' : state === 'unauthenticated' ? 'Sign-in required to load this video.' : 'This video could not be loaded. Nothing was changed.';
    await page.evaluate((text) => {
      const player = document.querySelector('#take-1 .player');
      if (!player) throw new Error('Missing tracked player');
      player.outerHTML = `<div class="pempty" style="aspect-ratio:16/9;display:grid;place-items:center;padding:0">${text}</div>`;
    }, copy);
  }
  const referenceSelectors = ['#take-1 .lb-panel.wide', '#take-1 .lb-head', '#take-1 .player, #take-1 .pempty', '#take-1 .notes', '#take-1 .choose'];
  const reference = await capturePairSide(page, info, referenceSelectors, 'reference', '#take-1 .lb-panel', '#take-1 .lb-panel');
  await page.goto('/media.html');
  await page.addStyleTag({ content: '.wp-modal-overlay{background:#1b1913!important}' });
  await page.waitForFunction(() => !!(window as unknown as { mediaTest?: unknown }).mediaTest);
  await page.evaluate(() => {
    const harness = (window as unknown as { mediaTest: { configure(input: unknown): void; source(id: string, input?: Record<string, unknown>): unknown; release(index: number, result: unknown): void } }).mediaTest;
    harness.configure({ controlled: true });
  });
  await page.getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
  await page.evaluate((selected) => {
    const harness = (window as unknown as { mediaTest: { source(id: string): unknown; release(index: number, result: unknown): void } }).mediaTest;
    const value = harness.source('video-v2');
    if (selected === 'loading') return;
    if (selected === 'player') harness.release(0, { ok: true, value });
    else harness.release(0, { ok: false, error: { code: selected === 'unavailable' ? 'not_implemented' : selected === 'unauthenticated' ? 'unauthenticated' : 'transport_failure', message: 'Read unavailable' } });
  }, state);
  if (state === 'player') await expect(page.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
  else await expect(page.locator('.wp-clip-note')).toHaveText(state === 'loading' ? 'Loading this video…' : state === 'unavailable' ? 'Loading this video is not available yet.' : state === 'unauthenticated' ? 'Sign-in required to load this video.' : 'This video could not be loaded. Nothing was changed.');
  const actual = await capturePairSide(page, info, ['.wp-modal', '.wp-dialog-head', '.wp-clip-surface', '.wp-clip-version > p', '.wp-version-use-viewer .wp-button'], 'actual', '.wp-modal', '.wp-modal');
  const file = await readFile(`docs/design/${source}`, 'utf8');
  await verifyCapturePair(info, reference, actual, { state, width, browser: context.browser()?.version(), source, sourceSha256: createHash('sha256').update(file).digest('hex'), approval: 'docs/design/design.md#shell-and-remaining-phase-2-feedback', note: 'Paused supplied poster; decoded playback frames are not pixel-claimed. Full-context evidence accompanies the unchanged dialog-region comparison.' });
}
