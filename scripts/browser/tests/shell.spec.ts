import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function configure(page: Page, value: unknown) {
  await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
  await page.evaluate((input) => (window as unknown as { shellTest: { configure(input: unknown): void } }).shellTest.configure(input), value);
}
for (const width of [1440, 390]) test(`keyboard account actions and navigation at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto('/shell.html');
  await configure(page, { session: { accountId: 'keyboard-account', name: 'Creator A' } });
  if (width === 390) { await page.getByRole('button', { name: 'Menu', exact: true }).focus(); await page.keyboard.press('Enter'); }
  await page.getByRole('button', { name: 'Creator A', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Switch account', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog')).toContainText('Account actions are not available yet. Nothing about your session has changed.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  if (width === 390) { await page.getByRole('button', { name: 'Menu', exact: true }).focus(); await page.keyboard.press('Enter'); }
  await page.getByRole('button', { name: 'Library', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Library connection not configured');
});

for (const width of [1440, 390, 820, 821]) test(`shell navigation, session and native boundaries at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto('/shell.html');
  await configure(page, { session: null });
  const openMenu = async () => { if (width <= 820) await page.getByRole('button', { name: 'Menu', exact: true }).click(); };
  await openMenu();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Not signed inSign-in is not available yet.');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await configure(page, { session: { accountId: 'account-a', name: 'Creator A' } });
  await openMenu();
  await page.getByRole('button', { name: 'Creator A', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Account actions are not available yet. Nothing about your session has changed.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'New video', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('No conversation was created.');
  await page.keyboard.press('Escape');
  await openMenu();
  await page.getByRole('button', { name: 'Recents', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('No conversation list was loaded.');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Script', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Assets', exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const tab of ['Storyboard', 'Videos', 'Script']) await page.getByRole('tab', { name: tab, exact: true }).click();
  await openMenu();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Library connection not configured');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as { shellTest: { tokenCalls(): number } }).shellTest.tokenCalls())).toBe(0);
  await expect(page.locator('body')).not.toContainText('Proposal only');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('scope changes synchronously clear tabs, dialogs and late workspace data', async ({ page }) => {
  await page.goto('/shell.html');
  let release: (() => void) | undefined;
  await page.route('**/v1/conversations/*/workspace', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[3];
    if (id === 'slow') await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: { script: null, assets: [], storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: id === 'slow' ? 1 : 2 } });
  });
  const session = { accountId: 'account-a', name: 'Creator A' };
  await configure(page, { session, conversationId: 'slow', apiOrigin: 'http://127.0.0.1:4179' });
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await page.getByRole('button', { name: 'Creator A', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await configure(page, { session: { accountId: 'account-b', name: 'Creator B' }, conversationId: 'fast' });
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('tabpanel')).toContainText('Workspace revision 2');
  await expect(page.getByRole('tab', { name: 'Script', exact: true })).toHaveAttribute('aria-selected', 'true');
  release?.();
  await expect(page.getByRole('tabpanel')).not.toContainText('Workspace revision 1');
  await configure(page, { session: null });
  await expect(page.getByRole('tabpanel')).not.toContainText('Workspace revision');
  await configure(page, { session, conversationId: 'fast' });
  await expect(page.getByRole('tabpanel')).toContainText('Workspace revision 2');
  await configure(page, { session, conversationId: 'another' });
  await expect(page.getByRole('tabpanel')).not.toContainText('Workspace revision 1');
});
