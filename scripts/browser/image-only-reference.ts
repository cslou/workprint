import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Page } from '@playwright/test';

/** Approved59478dc substitution into inert references only, never runtime markup/styles. */
export async function imageOnlyReference(page: Page, selector: '.composer' | '.dock-input' = '.composer') {
  const root = await realpath(process.cwd()), sourceHashes: Record<string, string> = {};
  const load = async (relative: string) => {
    const path = await realpath(resolve(root, relative));
    if (!path.startsWith(root + sep)) throw new Error('Reference escaped its repository');
    const source = await readFile(path, 'utf8');
    sourceHashes[relative] = createHash('sha256').update(source).digest('hex');
    return source;
  };
  const guidance = await load('docs/design/verified-uploads-r1/image-only-guidance.html');
  const styles = await Promise.all(['assets/tokens.css', 'frame.css'].map(path => load(`docs/design/verified-uploads-r1/${path}`)));
  if (!new URL(page.url()).pathname.startsWith('/references/')) throw new Error('Image-only substitution requires an inert reference');
  for (const content of styles) await page.addStyleTag({ content });
  await page.evaluate(({ guidance, selector }) => {
    const targets = document.querySelectorAll(selector);
    if (targets.length !== 1 || document.querySelector('.preview-guidance')) throw new Error('Ambiguous reference composer');
    const note = new DOMParser().parseFromString(guidance, 'text/html').querySelector('.preview-guidance');
    if (!note) throw new Error('Missing tracked image-only guidance');
    targets[0]!.after(note);
  }, { guidance, selector });
  return sourceHashes;
}
