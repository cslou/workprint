import { test, expect } from '../material-network.js';
import { fixture, origin, account, signIn, privateFulfill, privateForward } from '../account-fixture.js';
import { allowHistory } from '../navigation-fixture.js';
import type { Page } from '@playwright/test';

// Instrument the one production-composed owner, never create a second SDK/session authority.
async function observeOwner(page: Page) {
  await page.route('**/src/auth/owner.ts', route => privateFulfill(route, {
    contentType: 'text/javascript',
    body: `import { AccountOwner as Original } from '/src/auth/owner.ts?foundation-original';
export class AccountOwner extends Original {
  constructor(...args) {
    super(...args);
    window.accountFoundation = {
      snapshot: () => { const s = this.getSnapshot(); return { screen: s.screen, confirmed: s.account !== null, busy: s.busy }; },
      retry: () => this.retryRestore(),
      tokenAvailable: async () => (await this.getAccessToken()) !== null,
    };
  }
}`,
  }));
}
type Probe = { snapshot(): { screen: string; confirmed: boolean; busy: boolean }; retry(): Promise<void>; tokenAvailable(): Promise<boolean> };
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as { accountFoundation: Probe }).accountFoundation.snapshot());
const retry = (page: Page) => page.evaluate(() => (window as unknown as { accountFoundation: Probe }).accountFoundation.retry());
const beginRetry = (page: Page) => page.evaluate(() => { void (window as unknown as { accountFoundation: Probe }).accountFoundation.retry(); });
const tokenAvailable = (page: Page) => page.evaluate(() => (window as unknown as { accountFoundation: Probe }).accountFoundation.tokenAvailable());

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('cold validation retry coalesces, restores exact native history and leaves confirmed drafts alone', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true); let release: (() => void) | undefined;
  try {
    await observeOwner(page);
    const user = await f.auth.createAccount();
    const saved = await f.application!.saveNative(user.id, [{ role: 'user', text: 'Exact restoration proof — synthetic, not AI' }], 'Retry owned history');
    const before = await f.application!.snapshot();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await page.goto(origin); await account(page); await signIn(page, user.email, user.password);
    await expect(page.getByRole('dialog')).toBeHidden();
    await f.auth.pauseAuthUpstream();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await page.goto(origin + '/?conversation=' + saved.id);
    await expect.poll(() => snapshot(page)).toEqual({ screen: 'startup-failed', confirmed: false, busy: false });
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/'))).toHaveLength(0);
    await f.auth.resumeAuthUpstream();
    let held = false; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(f.auth.url + '/auth/v1/user', async route => {
      const response = await privateForward(route); expect(response.status()).toBe(200);
      held = true; await gate; await privateFulfill(route, { response });
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await beginRetry(page); await expect.poll(() => held).toBe(true);
    await expect.poll(() => snapshot(page)).toEqual({ screen: 'checking', confirmed: false, busy: true });
    expect(await tokenAvailable(page)).toBe(false);
    await retry(page); // Duplicate must settle without another network request or owner.
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/'))).toHaveLength(0);
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id);
    release!();
    await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Exact restoration proof — synthetic, not AI');
    expect(new URL(page.url()).searchParams.get('conversation')).toBe(saved.id);
    await expect.poll(() => snapshot(page)).toEqual({ screen: 'account', confirmed: true, busy: false });
    const draft = page.getByRole('textbox', { name: 'Message', exact: true }); await draft.fill('Preserved confirmed draft');
    await retry(page); await expect(draft).toHaveValue('Preserved confirmed draft');
    await account(page, user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect.poll(() => snapshot(page)).toEqual({ screen: 'signed-out', confirmed: false, busy: false });
    await retry(page); expect((await snapshot(page)).confirmed).toBe(false); expect(await tokenAvailable(page)).toBe(false);
    expect(await f.application!.snapshot()).toBe(before);
  } finally { release?.(); await f.close(); }
});

test('failed cold retry settles and may be explicitly retried without password exchange', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    await observeOwner(page); const user = await f.auth.createAccount();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await page.goto(origin); await account(page); await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden();
    await f.auth.pauseAuthUpstream();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 2 });
    await page.reload(); await expect.poll(() => snapshot(page)).toEqual({ screen: 'startup-failed', confirmed: false, busy: false });
    await retry(page); await expect.poll(() => snapshot(page)).toEqual({ screen: 'startup-failed', confirmed: false, busy: false });
    await f.auth.resumeAuthUpstream();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await retry(page); await expect.poll(() => snapshot(page)).toEqual({ screen: 'account', confirmed: true, busy: false });
  } finally { await f.close(); }
});

test('cold retry cannot elevate callback recovery or replay a recovery exchange', async ({ page, materialNetwork }) => {
  test.setTimeout(60000); const f = await fixture(page);
  try {
    await observeOwner(page);
    materialNetwork.expectOperations({ origin, method: 'GET', path: '/auth/callback', query: { error: '[private]' }, count: 1 });
    await page.goto(origin + '/auth/callback?error=synthetic-error#synthetic-secret');
    await expect.poll(() => snapshot(page)).toEqual({ screen: 'invalid-link', confirmed: false, busy: false });
    expect(new URL(page.url()).search).toBe(''); expect(new URL(page.url()).hash).toBe('');
    await retry(page); await expect.poll(() => snapshot(page)).toEqual({ screen: 'invalid-link', confirmed: false, busy: false });
    expect(await tokenAvailable(page)).toBe(false);
  } finally { await f.close(); }
});
