import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export type OwnedLibraryState = 'page' | 'loading' | 'error' | 'complete' | 'empty';
export type OwnedReadState = 'script-history' | 'history-loading' | 'history-error' | 'history-initial-loading' | 'history-initial-error' | 'history-complete' | 'historical-version' | 'text-reference-row' | 'text-reference-sheet' | 'library-empty';
export const ownedLibraryReference = (state: OwnedLibraryState) => ownedReadReference(`library-${state}`);
/** Tracked brand-book inputs plus explicitly recorded substitutions; never ignored inspection previews. */
export async function ownedReadReference(state: OwnedReadState | `library-${OwnedLibraryState}`, repository = process.cwd()) {
  const states = ['script-history', 'history-loading', 'history-error', 'history-initial-loading', 'history-initial-error', 'history-complete', 'historical-version', 'text-reference-row', 'text-reference-sheet', 'library-page', 'library-loading', 'library-error', 'library-complete', 'library-empty'];
  if (!states.includes(state)) throw new Error('Unsupported saved-read reference');
  const root = await realpath(resolve(repository));
  const hashes: Record<string, string> = {};
  const load = async (relative: string) => {
    const path = await realpath(resolve(root, relative));
    if (!path.startsWith(root + sep)) throw new Error('Reference escaped its repository');
    const content = await readFile(path, 'utf8');
    hashes[relative] = createHash('sha256').update(content).digest('hex');
    return content;
  };
  await load('docs/design/design.md');
  const sources = {
    script: await load('docs/design/flow2-step2-r74.html'),
    assets: await load('docs/design/flow2-step10-r82.html'),
    history: await load('docs/design/flow2-step10-r82.html'),
    library: await load('docs/design/library-picker-r92.html'),
  };
  const css = await Promise.all(['docs/design/app-r11.css', 'docs/design/brand-book/book.css', 'scripts/browser/owned-read-substitutions.css'].map(load));
  for (const value of css) if (/@import|url\s*\(|expression\s*\(|behavior\s*:|<\//i.test(value)) throw new Error('Reference stylesheet must remain inert');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; script-src 'none'"><title>Inert saved-read comparison</title>${css.map(value => `<style>${value}</style>`).join('')}</head><body><aside class="preview-note"><strong>Saved-read comparison</strong><p>Inert approved reference framing; not product work.</p></aside><main class="preview-stage"><div class="preview-panel"></div></main></body></html>`;
  return { html, hashes, sources, state };
}
