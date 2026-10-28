import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { classifyWorkspaceFailure } from '../../../apps/web/src/shell/workspace.js';

test('workspace failures retain authentication, availability and error classifications', () => {
  expect(classifyWorkspaceFailure('unauthenticated')).toBe('unauthenticated');
  expect(classifyWorkspaceFailure('not_implemented')).toBe('unavailable');
  for (const code of ['timed_out', 'transport_failure', 'cancelled', 'invalid_response', 'forbidden', 'not_found', 'invalid_input', 'stale_revision', 'superseded', 'unsupported', 'integration_failure'] as const) expect(classifyWorkspaceFailure(code)).toBe('error');
});

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

const emptyWorkspace = (revision: number) => ({ script: null, assets: [], storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: revision });
const reads = (page: Page) => page.evaluate(() => (window as unknown as { shellTest: { reads(): { call: number; conversationId: string; settled: boolean; code: string | null }[] } }).shellTest.reads());

for (const axis of ['account-only', 'conversation-only'] as const) test(`${axis} switch resets presentation after the old read has settled or cancelled`, async ({ page }) => {
  await page.goto('/shell.html');
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  let finishOldHandler!: () => void;
  const oldHandlerDone = new Promise<void>((resolve) => { finishOldHandler = resolve; });
  let requests = 0;
  await page.route('**/v1/conversations/*/workspace', async (route) => {
    const call = ++requests;
    if (call === 1) {
      await oldGate;
      try { if (!route.request().failure()) await route.fulfill({ json: emptyWorkspace(1) }); }
      finally { finishOldHandler(); }
    } else await route.fulfill({ json: emptyWorkspace(2) });
  });
  const session = { accountId: 'account-a', name: 'Creator A' };
  const next = { session: axis === 'account-only' ? { accountId: 'account-b', name: 'Creator B' } : session, conversationId: axis === 'conversation-only' ? 'conversation-b' : 'conversation-a' };
  await configure(page, { session, conversationId: 'conversation-a', apiOrigin: 'http://127.0.0.1:4179' });
  await expect.poll(() => requests).toBe(1);
  const oldRequest = page.waitForEvent('requestfailed', { predicate: (request) => request.url().includes('/workspace') });
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await page.getByRole('button', { name: 'Creator A', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await configure(page, next);
  await expect.poll(async () => (await reads(page)).filter((read) => read.settled).length).toBe(2);
  await oldRequest;
  releaseOld();
  await oldHandlerDone;
  // Drain the browser's promise handlers and React commits, not just the route gate.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect((await reads(page)).map((read) => read.code)).toEqual(['cancelled', 'ok']);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Script', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveText('Workspace revision 2');
  await expect(page.getByRole('tabpanel')).not.toContainText('Workspace revision 1');
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await page.getByRole('button', { name: next.session.name, exact: true }).click();
  await configure(page, { session: null });
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('tabpanel')).not.toContainText('Workspace revision');
  await configure(page, next);
  await expect.poll(async () => (await reads(page)).filter((read) => read.settled).length).toBe(3);
  await expect(page.getByRole('tabpanel')).toHaveText('Workspace revision 2');
});

for (const failure of ['unauthenticated', 'not_implemented', 'transport_failure', 'timed_out'] as const) test(`workspace ${failure} never reuses native-load presentation`, async ({ page }) => {
  await page.goto('/shell.html');
  await page.route('**/v1/conversations/*/workspace', async (route) => {
    if (failure === 'transport_failure') await route.abort();
    else if (failure !== 'timed_out') await route.fulfill({ status: failure === 'unauthenticated' ? 401 : 501, json: { error: { code: failure, message: 'Controlled workspace read failure' } } });
  });
  await configure(page, { apiOrigin: 'http://127.0.0.1:4179', timeoutMs: 100, session: { accountId: 'account-a', name: 'Creator A' }, conversationId: 'conversation-a' });
  await expect.poll(async () => (await reads(page))[0]?.settled).toBe(true);
  expect((await reads(page))[0]?.code).toBe(failure);
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('main')).not.toContainText('Conversation loading is not available yet.');
});
