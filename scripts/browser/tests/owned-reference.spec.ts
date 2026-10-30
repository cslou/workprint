import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test, expect } from '../material-network.js';
import { ownedReadReference } from '../owned-read-reference.js';
import { mountOwnedReadReference } from '../owned-read-mount.js';

const files = ['docs/design/design.md', 'docs/design/flow2-step2-r74.html', 'docs/design/flow2-step10-r82.html', 'docs/design/library-picker-r92.html', 'docs/design/app-r11.css', 'docs/design/brand-book/book.css', 'scripts/browser/owned-read-substitutions.css'];
test('saved-read comparisons render from tracked-only inputs without an inspection-output directory', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'owned-tracked-reference-'));
  try {
    for (const file of files) { const target = join(root, file); await mkdir(dirname(target), { recursive: true }); await cp(resolve(file), target); }
    for (const state of ['script-history', 'text-reference-row', 'text-reference-sheet', 'library-page', 'library-empty'] as const) {
      const reference = await ownedReadReference(state, root);
      assert.deepEqual(Object.keys(reference.hashes).sort(), [...files].sort());
      await mountOwnedReadReference(page, reference);
      await expect(page.locator('.preview-panel,.preview-modal-stage').first()).toBeVisible();
      expect(await page.locator('script,img[src]').count()).toBe(0);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('missing tracked inputs and symlink escapes fail before unrelated local files can become references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'owned-reference-containment-'));
  const outside = await mkdtemp(join(tmpdir(), 'owned-reference-outside-'));
  try {
    await assert.rejects(ownedReadReference('script-history', root));
    await mkdir(join(root, 'docs'), { recursive: true });
    await symlink(resolve('docs/design'), join(root, 'docs/design'), 'dir');
    await assert.rejects(ownedReadReference('script-history', root), /escaped its repository/);
    await assert.rejects(ownedReadReference('../outside' as 'script-history', outside), /Unsupported saved-read reference/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
