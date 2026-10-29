import { browserOrigin } from './origin.js';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { compare } from './compare.js';
import { settleCapture } from './capture.js';
import { capturePairSide } from './capture-pair.js';

const fonts = ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}';
const image = '/fixtures/library-tile.png';
export type PickerState = 'populated' | 'filtered' | 'selected' | 'search' | 'no-match' | 'no-facts' | 'attach-unavailable';
const facts = [
  { name: 'Vale', sub: 'Character', category: 'Characters' },
  { name: 'Mercer', sub: 'Character', category: 'Characters' },
  { name: 'The gallery', sub: 'Place', category: 'Places' },
  { name: 'Bench', sub: 'Prop', category: 'Props' },
];
const kindFacts = [
  { name: 'Reference', sub: 'Version 1' },
  { name: 'Reference', sub: 'Version 1' },
  { name: 'Image', sub: 'Version 3' },
  { name: 'Reference', sub: 'Version 2' },
];
const stateData = (state: PickerState) => {
  if (state === 'no-facts') return { pills: [], tiles: kindFacts, empty: false, query: '', selected: [] as string[] };
  if (state === 'filtered') return { pills: ['All', 'Characters', 'Places', 'Props'], active: 'Characters', tiles: facts.slice(0, 2), empty: false, query: '', selected: [] as string[] };
  if (state === 'search') return { pills: ['All', 'Characters', 'Places', 'Props'], active: 'All', tiles: facts.slice(0, 1), empty: false, query: 'val', selected: [] as string[] };
  if (state === 'no-match') return { pills: ['All', 'Characters', 'Places', 'Props'], active: 'All', tiles: [], empty: true, query: 'zzz', selected: [] as string[] };
  if (state === 'selected') return { pills: ['All', 'Characters', 'Places', 'Props'], active: 'All', tiles: facts, empty: false, query: '', selected: ['Vale', 'Bench'] };
  if (state === 'attach-unavailable') return { pills: ['All', 'Characters', 'Places', 'Props'], active: 'All', tiles: facts, empty: false, query: '', selected: ['Vale'] };
  return { pills: ['All', 'Characters', 'Places', 'Props'], active: 'All', tiles: facts, empty: false, query: '', selected: [] as string[] };
};
const style = `<style>
.pk-overlay{position:fixed;inset:0;z-index:20;background:#1b1913b3;display:flex;align-items:center;justify-content:center;padding:24px}
.pk-panel{width:min(1040px,100%);height:min(760px,100%);background:var(--raised);border-radius:16px;box-shadow:0px 20px 60px 0px #0000004d;display:flex;flex-direction:column;overflow:hidden}
.pk-head{display:flex;justify-content:space-between;align-items:center;padding:16px 16px 10px;margin:0}
.pk-head h2{font:600 15px/1.5 var(--font-sans);margin:0}
.pk-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:12px 16px 4px}
.pk-pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pk-pill{padding:5px 12px;border-radius:9999px;border:1px solid var(--border);background:var(--bg);color:var(--fg-muted);font-size:13px;font-family:var(--font-sans)}
.pk-pill.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.pk-search{display:flex;align-items:center;gap:8px;width:260px;height:34px;padding:0 12px;border:1px solid var(--input-border);border-radius:9999px;background:var(--bg);color:var(--fg-subtle);font-size:13px;margin-left:auto;box-sizing:border-box}
.pk-search svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;flex:none}
.pk-search input{border:0;background:transparent;padding:0;font:13px/1.5 var(--font-sans);color:var(--fg);outline:none;width:100%}
.pk-search input::placeholder{color:var(--fg-subtle);opacity:1}
.pk-body{flex:1;overflow:auto;padding:10px 16px 16px;min-height:0}
.pk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;align-items:start}
.pk-tile{display:block;padding:0;border:0;background:none;text-align:left;color:var(--fg);font-family:var(--font-sans)}
.pk-media{position:relative;display:block;aspect-ratio:1;border-radius:12px;overflow:hidden;border:1px solid var(--border);background:var(--bg-dark)}
.pk-media img{display:block;width:100%;height:100%;object-fit:cover}
.pk-media.empty{border-style:dashed;border-color:var(--border-strong)}
.pk-tile.on .pk-media{outline:2px solid var(--primary);outline-offset:2px}
.pk-check{position:absolute;right:8px;top:8px;width:22px;height:22px;border-radius:50%;background:var(--raised);border:1px solid var(--border-strong);display:grid;place-items:center}
.pk-check svg{width:13px;height:13px;fill:none;stroke:transparent;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.pk-tile.on .pk-check{background:var(--primary);border-color:var(--primary)}
.pk-tile.on .pk-check svg{stroke:var(--primary-fg)}
.pk-label{display:block;margin-top:6px;font-size:13px;font-weight:600}
.pk-sub{display:block;font-size:12px;color:var(--fg-subtle)}
.pk-empty{display:grid;place-items:center;align-content:center;gap:4px;text-align:center;min-height:240px;color:var(--fg-subtle);font-size:13px}
.pk-empty b{color:var(--fg);font-size:15px;font-weight:600}
.pk-tray{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:12px 16px;border-top:1px solid var(--border);background:var(--raised)}
.pk-count{font-size:13px;color:var(--fg-muted);margin-right:4px}
.pk-chip{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border:1px solid var(--border);border-radius:9999px;font-size:12px}
.pk-chip button{border:0;background:transparent;color:var(--fg-subtle);font:inherit;padding:0}
.pk-send.on{background:var(--primary);color:var(--primary-fg)}
.pk-line{margin:0;padding:0 16px 12px;color:var(--fg-subtle);font-size:13px}
.pk-send{margin-left:auto;height:32px;padding:0 16px;border-radius:9999px;border:0;background:#94b4d1;color:#fefefe;font:600 13px/1.5 var(--font-sans);display:inline-grid;place-items:center}
@media(max-width:820px){.pk-overlay{padding:0}.pk-panel{width:100%;height:100%;border-radius:0}.pk-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pk-search{display:none}}
</style>`;
const tile = (item: { name: string; sub: string }, options: { selected: boolean; image: boolean }) => `<button class="pk-tile${options.selected ? ' on' : ''}" type="button" aria-pressed="${options.selected}"><span class="pk-media${options.image ? '' : ' empty'}">${options.image ? `<img src="${image}" alt="">` : ''}<span class="pk-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span></span><span class="pk-label">${item.name}</span><span class="pk-sub">${item.sub}</span></button>`;
const referenceMarkup = (state: PickerState) => {
  const data = stateData(state);
  const pills = data.pills.length === 0 ? '' : `<div class="pk-pills">${data.pills.map((label) => `<span class="pk-pill${label === (data as { active?: string }).active ? ' on' : ''}">${label}</span>`).join('')}</div>`;
  const body = data.empty ? '<div class="pk-empty"><b>No matching items</b><span>Search only looks at the names shown here.</span></div>' : `<div class="pk-grid">${data.tiles.map((item) => tile(item, { selected: data.selected.includes(item.name), image: state !== 'no-facts' })).join('')}</div>`;
  const chips = data.selected.map((name) => `<span class="pk-chip">${name}<button type="button" aria-label="Remove ${name}">×</button></span>`).join('');
  return `${style}<div class="pk-overlay" role="dialog" aria-label="Library"><div class="pk-panel"><div class="pk-head"><h2>Library</h2><span class="qclose">×</span></div><div class="pk-bar">${pills}<div class="pk-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>${data.query ? `<input value="${data.query}" aria-label="Search Library">` : '<input placeholder="Search" aria-label="Search Library">'}</div></div><div class="pk-body">${body}</div><div class="pk-tray"><span class="pk-count">${data.selected.length === 0 ? 'Nothing selected yet' : `${data.selected.length} selected`}</span>${chips}<button class="pk-send${state === 'attach-unavailable' ? ' on' : ''}" type="button" aria-disabled="${state === 'attach-unavailable' ? 'false' : 'true'}">${data.selected.length === 0 ? 'Attach' : `Attach (${data.selected.length})`}</button></div>${state === 'attach-unavailable' ? '<p class="pk-line" role="status">Attaching from your Library is not available yet. Nothing was attached.</p>' : ''}</div></div>`;
};
const libraryPage = () => {
  const version = (id: string, revision: number, kind: 'reference' | 'image') => kind === 'reference'
    ? { id, artifactId: `artifact-${id}`, revision, kind, content: {}, createdBy: 'human', createdAt: '2026-10-29T00:00:00Z', dependencies: [] }
    : { id, artifactId: `artifact-${id}`, revision, kind, media: { contentType: 'image/png', byteSize: 1024, width: 640, height: 640 }, createdBy: 'human', createdAt: '2026-10-29T00:00:00Z', dependencies: [] };
  return {
    items: [
      { id: 'vale', kind: 'reference', builtIn: true, latestVersion: version('vale-v1', 1, 'reference') },
      { id: 'mercer', kind: 'reference', builtIn: true, latestVersion: version('mercer-v1', 1, 'reference') },
      { id: 'gallery', kind: 'image', builtIn: true, latestVersion: version('gallery-v3', 3, 'image') },
      { id: 'bench', kind: 'reference', builtIn: false, latestVersion: version('bench-v2', 2, 'reference') },
    ],
    nextCursor: null,
  };
};
const display = {
  'vale-v1': { name: 'Vale', tileLabel: 'Character', category: 'Characters', image: { src: image, alt: '' } },
  'mercer-v1': { name: 'Mercer', tileLabel: 'Character', category: 'Characters', image: { src: image, alt: '' } },
  'gallery-v3': { name: 'The gallery', tileLabel: 'Place', category: 'Places', image: { src: image, alt: '' } },
  'bench-v2': { name: 'Bench', tileLabel: 'Prop', category: 'Props', image: { src: image, alt: '' } },
};
const measure = (page: Page, selectors: string[]) => page.evaluate((values) => values.map((selector) => { const nodes = [...document.querySelectorAll(selector)]; if (!nodes.length) throw new Error(`Missing paired geometry ${selector}`); return { selector, boxes: nodes.map((node) => node.getBoundingClientRect().toJSON()) }; }), selectors);
export async function capturePickerPair(page: Page, info: TestInfo, width: number, state: PickerState) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.route('**/*', async (route) => { if (new URL(route.request().url()).origin !== browserOrigin) throw new Error('Unauthorized visual egress'); await route.continue(); });
  await page.goto('/references/flow2-step1-r73.html');
  await page.addStyleTag({ content: fonts });
  await page.evaluate((markup) => { const account = document.querySelector('.account'); if (account) account.innerHTML = '<span class="avatar">C</span>Creator A'; document.querySelectorAll('.lightbox').forEach((node) => node.remove()); document.body.insertAdjacentHTML('beforeend', markup); }, referenceMarkup(state));
  await settleCapture(page);
  const referenceSelectors = ['.pk-panel', '.pk-head', '.pk-bar', '.pk-search', '.pk-body', '.pk-tray', '.pk-count', '.pk-send', ...(state === 'attach-unavailable' ? ['.pk-line'] : []), ...(state === 'no-facts' ? [] : ['.pk-pill', ...(state === 'no-match' ? [] : ['.pk-pill.on'])]), ...(state === 'no-match' ? ['.pk-empty'] : ['.pk-grid', '.pk-tile', '.pk-media']), ...(state === 'selected' || state === 'attach-unavailable' ? ['.pk-chip'] : [])];
  const referenceGeometry = await measure(page, referenceSelectors);
  const referencePair = state === 'attach-unavailable' ? await capturePairSide(page, info, [], 'reference', '.pk-panel', '.pk-panel') : null;
  const reference = referencePair?.image ?? await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
  await page.goto('/shell.html');
  await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
  await page.route('**/v1/library*', async (route) => { await route.fulfill({ status: 200, json: libraryPage() }); });
  if (state === 'attach-unavailable') await page.route('**/v1/conversations/visual-conversation/uses', async (route) => { await route.fulfill({ status: 501, json: { error: { code: 'not_implemented', message: 'Controlled visual prerequisite matched to the built backend 501' } } }); });
  await page.evaluate((input) => (window as unknown as { shellTest: { configure(value: unknown): void } }).shellTest.configure(input), { session: { accountId: 'visual-account', name: 'Creator A' }, ...(state === 'attach-unavailable' ? { conversationId: 'visual-conversation' } : {}), apiOrigin: browserOrigin, token: 'token', libraryPrerequisites: { display: state === 'no-facts' ? {} : display } });
  if (width <= 820) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await (width <= 820 ? page.getByRole('dialog') : page).getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator('.wp-picker').waitFor();
  if (state === 'filtered') await page.getByRole('button', { name: 'Characters', exact: true }).click();
  if (state === 'search') await page.getByRole('textbox', { name: 'Search Library', exact: true }).fill('val');
  if (state === 'no-match') await page.getByRole('textbox', { name: 'Search Library', exact: true }).fill('zzz');
  if (state === 'selected') {
    await page.locator('.wp-picker-tile').filter({ hasText: 'Vale' }).click();
    await page.locator('.wp-picker-tile').filter({ hasText: 'Bench' }).click();
  }
  if (state === 'attach-unavailable') {
    await page.locator('.wp-picker-tile').filter({ hasText: 'Vale' }).click();
    await page.getByRole('button', { name: 'Attach (1)', exact: true }).click();
    await page.locator('.wp-picker-feedback').waitFor();
  }
  await settleCapture(page);
  const actualSelectors = ['.wp-modal', '.wp-dialog-head', '.wp-picker-bar', '.wp-search-field', '.wp-picker-body', '.wp-picker-tray', '.wp-picker-count', '.wp-picker-tray .wp-button', ...(state === 'attach-unavailable' ? ['.wp-picker-feedback'] : []), ...(state === 'no-facts' ? [] : ['.wp-picker-pill', ...(state === 'no-match' ? [] : ['.wp-picker-pill.on'])]), ...(state === 'no-match' ? ['.wp-picker-empty'] : ['.wp-picker-grid', '.wp-picker-tile', '.wp-picker-media']), ...(state === 'selected' || state === 'attach-unavailable' ? ['.wp-picker-chip'] : [])];
  const actualGeometry = await measure(page, actualSelectors);
  expect(actualGeometry.map((row) => row.boxes)).toEqual(referenceGeometry.map((row) => row.boxes));
  const actualPair = state === 'attach-unavailable' ? await capturePairSide(page, info, [], 'actual', '.wp-modal', '.wp-modal') : null;
  const actual = actualPair?.image ?? await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
  const changed = await compare(reference, actual, info.outputPath('comparison'));
  await writeFile(info.outputPath('result.json'), JSON.stringify({ state, width, changedPixels: changed, tolerance: 0, reference: 'docs/design/flow2-step1-r73.html shell + library-picker-r92.html#lib-yours picker panel', substitutions: 'Library heading at 15px, Examples source removed, search at the pill row, wordless /fixtures/library-tile.png on both sides, no current conversation so Attach is disabled', revision: info.config.metadata, ...(referencePair && actualPair ? { context: { reference: referencePair.context, actual: actualPair.context } } : {}), geometry: { reference: referenceGeometry, actual: actualGeometry } }, null, 2));
  expect(changed).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
