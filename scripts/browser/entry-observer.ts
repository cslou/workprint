import type { Page } from '@playwright/test';
import { expect } from './material-network.js';

/** Observe transient protected mounts, not just their visibility after a route settles. */
export async function watchWorkspace(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { workspaceMounts: number }).workspaceMounts = 0;
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element && (node.matches('.wp-shell') || node.querySelector('.wp-shell'))) (window as unknown as { workspaceMounts: number }).workspaceMounts++;
    }).observe(document, { childList: true, subtree: true });
  });
}
export const workspaceMounts = (page: Page) => page.evaluate(() => (window as unknown as { workspaceMounts: number }).workspaceMounts);
export async function noWorkspace(page: Page) {
  await expect(page.locator('.wp-shell')).toHaveCount(0);
  expect(await workspaceMounts(page)).toBe(0);
}
