import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Page } from '@playwright/test';
import { ownedReadReference } from './owned-read-reference.js';
import { mountOwnedReadReference, mountOwnedWindowReference } from './owned-read-mount.js';

export type ReuseReferenceState = 'library-ready' | 'reference-inspect' | 'script-inspect' | 'storyboard-inspect' | 'use-unknown' | 'attach-partial' | 'reference-associations-edit' | 'reference-conflict' | 'image-inspect' | 'video-inspect';
/** Independent approved source, cloned before runtime capture; never application output/styles. */
export async function libraryReuseReference(state: ReuseReferenceState, root = process.cwd()) {
  const allowed = ['library-ready', 'reference-inspect', 'script-inspect', 'storyboard-inspect', 'use-unknown', 'attach-partial', 'reference-associations-edit', 'reference-conflict', 'image-inspect', 'video-inspect'];
  if (!allowed.includes(state)) throw new Error('Unsupported Library reuse reference');
  const repository = await realpath(resolve(root));
  const hashes: Record<string, string> = {};
  const load = async (relative: string) => {
    const path = await realpath(resolve(repository, relative));
    if (!path.startsWith(repository + sep)) throw new Error('Library reference escaped its repository');
    const source = await readFile(path, 'utf8'); hashes[relative] = createHash('sha256').update(source).digest('hex'); return source;
  };
  const source = await load(`docs/design/library-reuse-r1/${state}.html`);
  await load('docs/design/library-reuse-r1/preview.css'); await load('docs/design/library-reuse-r1/assets/tokens.css');
  const substitutions = await load('scripts/browser/library-reuse-substitutions.css');
  if (/<script\b|\son\w+\s*=|<iframe\b/i.test(source) || /@import|url\s*\(|expression\s*\(|<\//i.test(substitutions)) throw new Error('Library reference is not inert');
  const base = await ownedReadReference('library-page', root);
  return { state, source, substitutions, base, hashes: { ...base.hashes, ...hashes } };
}
export type ReuseReference = Awaited<ReturnType<typeof libraryReuseReference>>;
export async function mountReuseLibrary(page: Page, reference: ReuseReference, items: readonly { name: string; sub: string }[], selected: readonly string[] = [], feedback?: string) {
  await mountOwnedReadReference(page, reference.base);
  await page.addStyleTag({ content: reference.substitutions });
  await page.evaluate(({ source, primitiveSource, items, selected, feedback }) => {
    const approved = new DOMParser().parseFromString(source, 'text/html');
    if (!approved.querySelector('.modal')) throw new Error('Approved Library state missing');
    const backdrop = document.createElement('div'); backdrop.className = 'reuse-backdrop';
    backdrop.innerHTML = '<div class="reuse-backdrop-sidebar"></div><div></div><div class="reuse-backdrop-workspace"></div>';
    document.body.prepend(backdrop);
    document.querySelector('.preview-modal-stage')!.classList.add('reuse-fixed-frame');
    const picker = document.querySelector('.wp-picker')!, bar = picker.querySelector('.wp-picker-bar')!, search = bar.lastElementChild!;
    const primitive = new DOMParser().parseFromString(primitiveSource, 'text/html');
    const icon = primitive.querySelector('.lp-search svg');
    if (!icon) throw new Error('Approved search primitive missing');
    search.prepend(icon.cloneNode(true));
    for (const [index, text] of ['All', 'Scripts', 'References', 'Storyboards', 'Images', 'Videos'].entries()) { const node = document.createElement('button'); node.type = 'button'; node.className = `reuse-kind${index === 0 ? ' on' : ''}`; node.textContent = text; bar.insertBefore(node, search); }
    const note = document.createElement('p'); note.className = 'reuse-search-note'; note.textContent = 'Search only looks at loaded names.'; bar.after(note);
    const grid = picker.querySelector('.wp-picker-grid')!, template = grid.firstElementChild!;
    grid.replaceChildren(...items.map(item => {
      const tile = template.cloneNode(true) as HTMLElement; tile.removeAttribute('disabled'); tile.querySelector('.lp-label')!.textContent = item.name; tile.querySelector('.lp-sub')!.textContent = item.sub;
      const select = document.createElement('span'); select.className = 'reuse-select'; select.textContent = 'Select'; tile.append(select);
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.className = 'reuse-inspect'; inspect.textContent = 'Inspect';
      const wrapper = document.createElement('div'); wrapper.className = 'reuse-item'; wrapper.append(tile, inspect); return wrapper;
    }));
    picker.querySelector('.preview-library-controls')?.remove();
    const tray = picker.querySelector('.lp-tray')!; tray.firstElementChild!.textContent = selected.length ? `${selected.length} selected` : 'Nothing selected yet';
    const attach = tray.lastElementChild!;
    for (const name of selected) { const chip = document.createElement('span'); chip.className = 'reuse-chip'; chip.textContent = name; const remove = document.createElement('button'); remove.textContent = '×'; chip.append(remove); tray.insertBefore(chip, attach); }
    if (selected.length) { attach.removeAttribute('disabled'); attach.textContent = feedback ? 'Retry attach' : `Attach (${selected.length})`; }
    if (feedback) { const message = document.createElement('p'); message.className = 'reuse-feedback'; message.textContent = feedback; picker.append(message); }
  }, { source: reference.source, primitiveSource: reference.base.sources.library, items, selected, feedback });
}
/** Typed controls from 02c0517; retain the independently authored bounded-navigation region. */
export async function mountReuseWindowReference(page: Page, reference: ReuseReference, start: number, end: number, total: number) {
  await mountOwnedWindowReference(page, reference.base, start, end, total);
  await page.addStyleTag({ content: reference.substitutions });
  await decorateReuseTiles(page);
}
async function decorateReuseTiles(page: Page) {
  await page.locator('.wp-picker-grid').evaluate(grid => {
    grid.replaceChildren(...[...grid.children].map(tile => {
      const select = document.createElement('span'); select.className = 'reuse-select'; select.textContent = 'Select'; tile.append(select);
      const inspect = document.createElement('button'); inspect.type = 'button'; inspect.className = 'reuse-inspect'; inspect.textContent = 'Inspect';
      const wrapper = document.createElement('div'); wrapper.className = 'reuse-item'; wrapper.append(tile, inspect); return wrapper;
    }));
  });
}
