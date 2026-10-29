import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export type OwnedLibraryState = 'page' | 'loading' | 'error' | 'complete' | 'empty';
export type OwnedReadState = 'script-history' | 'history-loading' | 'history-error' | 'history-initial-loading' | 'history-initial-error' | 'history-complete' | 'historical-version' | 'text-reference-row' | 'text-reference-sheet' | 'library-empty';
export const ownedLibraryReference = (state: OwnedLibraryState) => ownedReadReference(`library-${state}`);
/** Frozen approved inert references, not application render output. Missing local references fail. */
export async function ownedReadReference(state: OwnedReadState | `library-${OwnedLibraryState}`) {
  const root = await realpath(resolve('outputs/verification/sprint-005/design-proposals/owned-reads'));
  let html = await readFile(resolve(root, `${state}.html`), 'utf8');
  if (/<(?:script|iframe|object|embed|form)\b|\son[a-z]+\s*=|\s(?:src|href)\s*=\s*["'](?:https?:|\/)/i.test(html)) throw new Error('Reference must remain inert and local');
  const hashes: Record<string, string> = { html: createHash('sha256').update(html).digest('hex') };
  for (const match of [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]) {
    const path = await realpath(resolve(root, match[1]!));
    if (!path.startsWith(root + sep)) throw new Error('Reference stylesheet escaped its approved directory');
    const css = await readFile(path, 'utf8');
    if (/@import|url\s*\(|expression\s*\(|behavior\s*:|<\//i.test(css)) throw new Error('Reference stylesheet must not load or execute resources');
    hashes[match[1]!] = createHash('sha256').update(css).digest('hex');
    html = html.replace(match[0], `<style>${css}</style>`);
  }
  return { html, hashes };
}
