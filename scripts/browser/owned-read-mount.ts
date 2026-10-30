import type { Page } from '@playwright/test';
import type { ownedReadReference } from './owned-read-reference.js';

/** Clone tracked approved primitives; apply only the saved-read record's substitutions. */
export async function mountOwnedReadReference(page: Page, reference: Awaited<ReturnType<typeof ownedReadReference>>) {
  await page.setContent(reference.html);
  await page.evaluate(({ sources, state }) => {
    const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
    const required = (root: ParentNode, selector: string): HTMLElement => { const node = root.querySelector<HTMLElement>(selector); if (!node) throw new Error(`Tracked reference node missing: ${selector}`); return node; };
    const script = parse(sources.script), assets = parse(sources.assets), history = parse(sources.history), library = parse(sources.library);
    const clone = (root: ParentNode, selector: string) => required(root, selector).cloneNode(true) as HTMLElement;
    const button = (label: string, className = 'ref-secondary') => { const node = document.createElement('button'); node.type = 'button'; node.className = className; node.textContent = label; return node; };
    const stage = required(document, '.preview-stage');
    const makeHistory = () => {
      const details = clone(history, '.take-hist'); details.classList.add('wp-version-history'); details.setAttribute('open', '');
      const row = required(details, '.th-row'); row.classList.add('wp-version-history-row');
      row.querySelector('.fthumb')?.remove(); const title = required(row, '.ftitle');
      const view = button('Version 6', 'ref-version wp-button-quiet'); view.setAttribute('aria-label', 'View version 6'); title.replaceWith(view);
      const use = required(row, '.use'); use.removeAttribute('disabled'); use.setAttribute('type', 'button');
      const wrapper = document.createElement('div'); wrapper.className = 'wp-version-use'; use.replaceWith(wrapper); wrapper.append(use);
      details.replaceChildren(required(details, 'summary'), row);
      return details;
    };
    if (state.startsWith('library-')) {
      stage.className = 'preview-modal-stage'; document.querySelector('.preview-note')?.remove();
      const empty = state === 'library-empty';
      if (empty) {
        const panel = document.createElement('section'); panel.className = 'lb-panel wp-modal';
        const header = document.createElement('div'); header.className = 'lb-head'; header.innerHTML = '<h2>Library</h2>'; header.append(button('×', 'qclose'));
        const body = document.createElement('div'); body.className = 'wp-library-feedback ref-empty'; body.setAttribute('role', 'status'); body.innerHTML = '<b>Nothing saved yet</b><span>Your saved work will appear here.</span>';
        panel.append(header, body); stage.replaceChildren(panel); return;
      }
      const panel = clone(library, '.lp-panel'); panel.classList.add('preview-library', 'wp-modal');
      const header = clone(panel, '.lp-head'); required(header, 'h2').textContent = 'Library';
      const search = clone(header, '.lp-search'); search.innerHTML = '<input placeholder="Search" aria-label="Search Library">';
      header.replaceChildren(required(header, 'h2'), button('×', 'qclose'));
      const bar = document.createElement('div'); bar.className = 'wp-picker-bar'; bar.append(search);
      const body = document.createElement('div'); body.className = 'lp-body wp-picker-body';
      const grid = clone(panel, '.lp-grid'); grid.classList.add('wp-picker-grid');
      const tileSource = clone(grid, '.lp-tile');
      const tile = document.createElement('button'); tile.type = 'button'; tile.className = tileSource.className; tile.innerHTML = tileSource.innerHTML; tile.classList.remove('on'); tile.classList.add('wp-picker-tile');
      const media = required(tile, '.lp-media'); media.classList.add('wp-picker-media', 'empty');
      media.querySelectorAll('img,.lp-play,.lp-dur').forEach(node => node.remove()); required(tile, '.lp-label').classList.add('wp-picker-label'); required(tile, '.lp-sub').classList.add('wp-picker-sub');
      grid.replaceChildren(tile); body.append(grid);
      if (state !== 'library-complete') {
        const control = document.createElement('div'); control.className = 'preview-library-controls';
        const group = document.createElement('div'); group.className = 'preview-page-controls'; const load = button('Load more'); load.disabled = state === 'library-loading'; group.append(load);
        if (state !== 'library-page') { const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = state === 'library-loading' ? 'Loading more Library items…' : 'More Library items could not be loaded. The items already shown are unchanged.'; group.append(status); }
        control.append(group); body.append(control);
      }
      const tray = clone(panel, '.lp-tray'); tray.classList.add('wp-picker-tray'); tray.innerHTML = '<span class="lp-tray-l">Nothing selected yet</span>'; const attach = button('Attach', 'send'); attach.disabled = true; attach.style.marginLeft = 'auto'; tray.append(attach);
      const picker = document.createElement('div'); picker.className = 'wp-picker'; picker.append(bar, body, tray); const dialog = document.createElement('div'); dialog.className = 'wp-dialog'; dialog.append(header, picker); panel.replaceChildren(dialog); stage.replaceChildren(panel); return;
    }
    if (state === 'text-reference-sheet') {
      stage.className = 'preview-modal-stage'; document.querySelector('.preview-note')?.remove();
      const panel = clone(assets, '#sheet-vale .lb-panel'); panel.classList.add('preview-reference', 'wp-modal'); panel.removeAttribute('style');
      const header = required(panel, '.lb-head'); header.classList.add('wp-dialog-head'); required(header, 'h2').textContent = 'Vale reference'; header.replaceChildren(required(header, 'h2'), button('×', 'qclose'));
      panel.querySelector('.lb-foot')?.remove(); const scroll = required(panel, '.lb-scroll'); scroll.classList.add('wp-sheet-scroll');
      const sheet = required(panel, '.livesheet'); sheet.classList.add('wp-reference-sheet'); required(sheet, '.kicker').classList.add('wp-sheet-kicker'); required(sheet, '.kicker').textContent = 'Character reference';
      const grid = required(sheet, '.sgrid'); grid.classList.add('wp-sheet-grid'); grid.replaceChildren();
      for (const [title, text] of [['Identity', 'Late forties, light stubble.'], ['Wardrobe', 'Navy overcoat over a charcoal suit.'], ['Missing views', 'No images are supplied.']]) { const section = document.createElement('section'); section.className = 'ssec wp-sheet-section'; const heading = document.createElement('h3'); heading.textContent = title!; const paragraph = document.createElement('p'); paragraph.className = 'snotes'; paragraph.textContent = text!; section.append(heading, paragraph); grid.append(section); }
      required(sheet, '.status').classList.add('wp-status');
      const details = makeHistory(); details.removeAttribute('open'); details.replaceChildren(required(details, 'summary')); panel.replaceChildren(header, scroll, details); stage.replaceChildren(panel); return;
    }
    const panel = required(document, '.preview-panel');
    const tabs = clone(script, '.ptabs'); tabs.classList.add('wp-tabs');
    tabs.querySelectorAll('a').forEach((tab, index) => { tab.className = 'wp-tab'; tab.removeAttribute('href'); tab.setAttribute('role', 'tab'); if (index === (state === 'text-reference-row' ? 1 : 0)) { tab.setAttribute('data-selected', ''); tab.setAttribute('aria-selected', 'true'); } });
    const body = document.createElement('div'); body.className = 'pbody wp-panel-body'; body.setAttribute('role', 'tabpanel');
    if (state === 'text-reference-row') {
      const row = clone(assets, '#p-assets .need.asset'); row.removeAttribute('href'); row.classList.add('wp-asset-row');
      const empty = document.createElement('span'); empty.className = 'preview-empty-thumb'; empty.textContent = 'No image'; required(row, 'img').replaceWith(empty); required(row, '.status').classList.add('wp-status'); body.append(row);
    } else {
      const text = clone(script, '#p-script'); text.removeAttribute('id'); text.className = 'pv default wp-script';
      text.querySelectorAll('section').forEach(section => section.classList.add('wp-panel-section')); text.querySelectorAll('.plabel').forEach(label => label.classList.add('wp-panel-label'));
      if (state === 'historical-version') { const reading = document.createElement('div'); reading.className = 'preview-reading'; reading.innerHTML = '<span>Viewing version 5</span>'; reading.append(button('Back to current version', 'ref-quiet')); body.append(reading); }
      body.append(text); const details = makeHistory();
      if (state.startsWith('history-initial')) details.querySelector('.th-row')?.remove();
      if (state !== 'history-complete') {
        if (state === 'history-initial-loading') { const status = document.createElement('p'); status.className = 'preview-history-feedback'; status.textContent = 'Loading version history…'; details.append(status); }
        else { const group = document.createElement('div'); group.className = 'preview-page-controls'; const load = button(state === 'history-initial-error' ? 'Load version history' : 'Load earlier versions'); load.disabled = state === 'history-loading'; group.append(load); const message = state === 'history-error' ? 'Earlier versions could not be loaded. The versions already shown are unchanged.' : state === 'history-loading' ? 'Loading earlier versions…' : state === 'history-initial-error' ? 'Version history could not be loaded.' : null; if (message) { const status = document.createElement('p'); status.textContent = message; group.append(status); } details.append(group); }
      }
      body.append(details);
    }
    panel.replaceChildren(tabs, body);
  }, { sources: reference.sources, state: reference.state });
}

/** Independent adaptation of the recorded Option B controls, never application rendering. */
export async function mountOwnedWindowReference(page: Page, reference: Awaited<ReturnType<typeof ownedReadReference>>, start: number, end: number, total: number) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total) || start < 2 || end < start || total < end) throw new Error('Invalid loaded reference range');
  await mountOwnedReadReference(page, reference);
  await page.evaluate(({ start, end, total }) => {
    const grid = document.querySelector('.wp-picker-grid');
    if (grid) {
      const template = grid.firstElementChild; if (!template) throw new Error('Tracked Library row missing');
      grid.replaceChildren(...Array.from({ length: end - start + 1 }, (_, index) => {
        const row = template.cloneNode(true) as Element;
        row.querySelector('.wp-picker-label')!.textContent = 'Script'; row.querySelector('.wp-picker-sub')!.textContent = `Version ${start + index === total ? total : 1}`;
        return row;
      }));
    } else {
      document.querySelector('.wp-script p')!.textContent = 'Ada waits beside the station clock.';
      document.querySelector('.wp-panel-label button')?.remove(); document.querySelectorAll('.wp-script .wp-panel-section:not(:first-child)').forEach(node => node.remove());
      const history = document.querySelector('.wp-version-history')!; const template = history.querySelector('.wp-version-history-row');
      if (!template) throw new Error('Tracked history row missing'); template.remove();
      const before = history.querySelector('.preview-page-controls');
      for (let index = start; index <= end; index++) {
        const row = template.cloneNode(true) as Element; row.querySelector('.ref-version')!.textContent = `Version ${total + 1 - index}`; history.insertBefore(row, before);
      }
      history.querySelector('summary')!.textContent = end === total ? `Version history · ${total - 1} earlier` : 'Version history';
    }
    const controls = document.querySelector('.preview-page-controls'); const next = controls?.querySelector('button');
    if (!controls || !next) throw new Error('Tracked pagination primitive missing');
    const range = document.createElement('p'); range.setAttribute('role', 'status'); range.textContent = `Showing loaded items ${start}–${end}`;
    const actions = document.createElement('div'); actions.className = 'preview-page-actions';
    const back = document.createElement('button'); back.type = 'button'; back.className = 'ref-quiet'; back.textContent = 'Back to first page';
    actions.append(back, next); controls.replaceChildren(range, actions);
  }, { start, end, total });
}
