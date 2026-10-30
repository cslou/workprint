import { writeFile } from 'node:fs/promises';
import { test, expect } from '../owned-backend.js';
import { settleCapture } from '../capture.js';
import { mountOwnedReadReference } from '../owned-read-mount.js';
import { ownedPanelFrame } from '../owned-panel-frame.js';
import { compare } from '../compare.js';
import { ownedReadReference, type OwnedReadState } from '../owned-read-reference.js';
import type { BuiltAdmissionTarget } from '../../../apps/api/test/auth-built-fixture.js';
import type { PagedSavedWork } from '../../../apps/api/test/paged-saved-work.js';

let target: BuiltAdmissionTarget; let saved: PagedSavedWork;
test.beforeEach(async ({ ownedSavedWork }) => { target = ownedSavedWork.target; saved = ownedSavedWork.saved; });

const main: OwnedReadState[] = ['script-history', 'text-reference-row', 'text-reference-sheet'];
const feedback: OwnedReadState[] = ['history-loading', 'history-error', 'history-initial-loading', 'history-initial-error', 'history-complete', 'historical-version'];
for (const width of [1440, 390, 820, 821]) for (const state of [...main, ...(width === 1440 || width === 390 ? feedback : [])]) test(`owned ${state} approved material at ${width}`, async ({ page, context, materialNetwork }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const source = await ownedReadReference(state);
  const frame = state === 'text-reference-sheet' ? await ownedReadReference('text-reference-row') : source;
  const allow = (path: string, query: Record<string, string> = {}) => materialNetwork.expectOperations({ origin: target.origin, method: 'GET', path, query, count: 1 });
  allow(`/v1/conversations/${saved.conversationA}/workspace`); allow(`/v1/versions/${saved.current.id}`);
  await page.goto('/saved-work.html');
  await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
  await ownedPanelFrame(page, frame.html);
  await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountA, conversationId: saved.conversationA, panelOnly: true });
  await expect(page.getByRole('tabpanel')).toContainText('Ada waits beside the station clock.');
  const historyPath = `/v1/artifacts/${saved.current.artifactId}/versions`;
  let resume = () => {}; let completion: Promise<unknown> | undefined;
  try {
    if (state.startsWith('text-reference')) {
      await page.getByRole('tab', { name: 'Assets', exact: true }).click();
      await expect(page.getByRole('button', { name: /Ada reference/ })).toBeVisible();
      if (state === 'text-reference-sheet') { allow(`/v1/versions/${saved.reference.id}`); await page.getByRole('button', { name: /Ada reference/ }).click(); await expect(page.getByRole('dialog')).toContainText('Keep the green coat.'); }
    } else {
      const initial = state.startsWith('history-initial');
      const delayed = state.includes('loading') || state.includes('error');
      let held!: () => void;
      const available = new Promise<void>(resolve => { held = resolve; });
      if (delayed) {
        const gate = new Promise<void>(resolve => { resume = resolve; });
        await page.route(url => url.pathname === historyPath && url.searchParams.has('cursor') !== initial, async route => {
          const response = await route.fetch(); if (response.status() !== 200) throw new Error('Real owned history prerequisite failed'); held();
          if (state.includes('error')) await route.abort('failed'); else { await gate; await route.fulfill({ response }); }
        });
      }
      allow(historyPath);
      const firstResponse = !initial ? page.waitForResponse(response => new URL(response.url()).pathname === historyPath && !new URL(response.url()).searchParams.has('cursor')) : undefined;
      if (initial && state.includes('loading')) completion = page.waitForResponse(response => new URL(response.url()).pathname === historyPath);
      await page.locator('.wp-version-history summary').click();
      if (initial) { await available; await expect(page.getByRole('status')).toHaveText(state.includes('loading') ? 'Loading version history…' : 'Version history could not be loaded.'); }
      else {
        const first = await (await firstResponse!).json() as { nextCursor: string | null }; if (!first.nextCursor) throw new Error('Real stored history next page missing');
        await expect(page.locator('.wp-version-history-row')).toHaveCount(19);
        if (state !== 'script-history' && state !== 'historical-version') {
          allow(historyPath, { cursor: first.nextCursor });
          if (state.includes('loading')) completion = page.waitForResponse(response => new URL(response.url()).pathname === historyPath && new URL(response.url()).searchParams.has('cursor'));
          await page.getByRole('button', { name: 'Load earlier versions', exact: true }).press('Enter');
          if (delayed) { await available; await expect(page.getByRole('status')).toHaveText(state.includes('loading') ? 'Loading earlier versions…' : 'Earlier versions could not be loaded. The versions already shown are unchanged.'); }
          else await expect(page.locator('.wp-version-history-row')).toHaveCount(22);
        }
        if (state === 'historical-version') { allow(`/v1/versions/${saved.versions[21]!.id}`); await page.getByRole('button', { name: 'View version 22', exact: true }).click(); await expect(page.getByText('Viewing version 22', { exact: true })).toBeVisible(); }
      }
    }
    const reference = await context.newPage(); await reference.setViewportSize({ width, height: width === 390 ? 844 : 900 }); await mountOwnedReadReference(reference, source);
    await reference.evaluate(state => {
      if (state.startsWith('text-reference')) {
        const status = document.querySelector('.wp-status'); if (status) { status.className = 'status draft wp-status wp-status-draft'; status.textContent = 'Draft'; }
        if (state === 'text-reference-row') { document.querySelector('.wp-asset-row b')!.textContent = 'Ada reference'; document.querySelector('.wp-asset-row small')!.textContent = 'Character reference'; }
        else { document.querySelector('.wp-dialog-head h2')!.textContent = 'Ada reference'; document.querySelector('.wp-reference-sheet header h2')!.textContent = 'Ada reference'; document.querySelector('.wp-reference-sheet .ref-description-text')!.textContent = 'A traveller in a green coat.'; const sections = [...document.querySelectorAll('.wp-sheet-section')]; sections[0]!.querySelector('p')!.textContent = 'Keep the green coat.'; sections.find(section => section.querySelector('h3')?.textContent === 'Wardrobe')?.remove(); }
        return;
      }
      document.querySelector('.wp-script p')!.textContent = state === 'historical-version' ? 'Earlier Script revision 22.' : 'Ada waits beside the station clock.';
      const pencil = document.querySelector<HTMLButtonElement>('.wp-panel-label button'); if (state === 'historical-version') pencil?.remove(); else pencil?.removeAttribute('disabled'); document.querySelectorAll('.wp-script .wp-panel-section:not(:first-child)').forEach(node => node.remove());
      const details = document.querySelector('.wp-version-history')!; const template = details.querySelector('.wp-version-history-row');
      const count = state.startsWith('history-initial') ? 0 : state === 'history-complete' ? 22 : 19;
      details.querySelectorAll('.wp-version-history-row').forEach(node => node.remove());
      if (count && !template) throw new Error('Independent approved history row missing');
      const control = details.querySelector('.preview-page-controls');
      for (let index = 0; index < count; index++) { const row = template!.cloneNode(true) as Element; const button = row.querySelector('.wp-button-quiet')!; button.textContent = `Version ${22 - index}`; button.setAttribute('aria-label', `View version ${22 - index}`); details.insertBefore(row, control); }
      details.querySelector('summary')!.textContent = count === 22 ? 'Version history · 22 earlier' : 'Version history';
      const viewing = document.querySelector('.preview-reading span'); if (viewing) viewing.textContent = 'Viewing version 22';
    }, state);
    const selector = state === 'text-reference-row' ? '.wp-asset-row' : state === 'text-reference-sheet' ? '.wp-reference-sheet' : '.wp-panel-body:visible';
    const measure = async (side: typeof page) => { await side.bringToFront(); await settleCapture(side); return await side.locator(selector).evaluate(node => { const box = node.getBoundingClientRect(); const summary = node.closest('.wp-version-review')?.querySelector('summary') ?? document.querySelector('.wp-version-history summary'); const sheet = node.closest('.wp-sheet-scroll'); return { width: box.width, height: box.height, overflow: document.documentElement.scrollWidth > innerWidth, ...(sheet && summary ? { historyHeight: summary.getBoundingClientRect().height, historyGap: summary.getBoundingClientRect().top - sheet.getBoundingClientRect().bottom } : {}) }; }); };
    const expectedGeometry = await measure(reference); const expected = await reference.locator(selector).screenshot({ path: info.outputPath('reference-region.png'), animations: 'disabled' }); await reference.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' }); await reference.close();
    const actualGeometry = await measure(page); const actual = await page.locator(selector).screenshot({ path: info.outputPath('actual-region.png'), animations: 'disabled' }); await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    await writeFile(info.outputPath('geometry.json'), JSON.stringify({ expectedGeometry, actualGeometry }, null, 2));
    const changedPixels = await compare(expected, actual, info.outputPath('comparison'));
    await writeFile(info.outputPath('result.json'), JSON.stringify({ state, width, expectedGeometry, actualGeometry, changedPixels, tolerance: 0, referenceHashes: source.hashes, revision: info.config.metadata, approval: 'docs/design/design.md#phase-3-saved-work-reads', scope: 'Actual MaterialPanel, real owned workspace/version/history reads, inert approved framing. Matched persisted Script text with no unsupported Look; the inspected single-action target restores its approved pencil under docs/design/design.md#manual-save-recovery, complete known revision list, independently specified reference text; no producer overrides or application CSS normalization.' }, null, 2));
    expect(actualGeometry).toEqual(expectedGeometry); expect(changedPixels).toBe(0);
  } finally { resume(); if (completion) await completion; }
});
