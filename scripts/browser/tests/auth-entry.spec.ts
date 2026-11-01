import { test, expect } from '../material-network.js';
import { fixture, origin, signIn, account, privateFill, privateForward, privateFulfill, privateAbort, privateNavigate } from '../account-fixture.js';
import { allowHistory, allowList } from '../navigation-fixture.js';
import { watchWorkspace, noWorkspace } from '../entry-observer.js';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test('public entry and protected deep links never mount workspace before confirmed sign-in', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, true, {}, 'built');
  try {
    const user = await f.auth.createAccount(); await watchWorkspace(page);
    await page.goto(origin);
    await expect(page.getByRole('heading', { name: 'Make room for your next idea.' })).toBeVisible();
    await noWorkspace(page);
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/'))).toHaveLength(0);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await signIn(page, user.email, user.password);
    await expect(page).toHaveURL(origin + '/app');
    await expect(page.getByRole('button', { name: 'New video', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  } finally { await f.close(); }
});

test('cold failure and held retry keep workspace unmounted, then restore the exact owned conversation', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, true); let release: (() => void) | undefined;
  try {
    await watchWorkspace(page); const user = await f.auth.createAccount();
    const saved = await f.application!.saveNative(user.id, [{ role: 'user', text: 'Synthetic exact routing history — NOT AI' }], 'Owned return');
    const before = await f.application!.snapshot(), target = '/app?conversation=' + saved.id;
    await page.goto(origin + target); await expect(page).toHaveURL(origin + '/sign-in?returnTo=' + encodeURIComponent(target)); await noWorkspace(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id); allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await signIn(page, user.email, user.password); await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Synthetic exact routing history — NOT AI');
    await f.auth.pauseAuthUpstream();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    const reads = materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/')).length;
    await page.reload(); await expect(page.getByRole('heading', { name: 'Couldn’t check your session' })).toBeVisible(); await noWorkspace(page);
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/'))).toHaveLength(reads);
    await f.auth.resumeAuthUpstream();
    let held = false; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(f.auth.url + '/auth/v1/user', async route => { const response = await privateForward(route); expect(response.status()).toBe(200); held = true; await gate; await privateFulfill(route, { response }); });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await page.getByRole('button', { name: 'Try again', exact: true }).click(); await expect.poll(() => held).toBe(true);
    await expect(page.getByRole('heading', { name: 'Checking your session' })).toBeVisible(); await noWorkspace(page);
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/'))).toHaveLength(reads);
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id); allowList(materialNetwork, f.application!.apiOrigin, user.id); release!();
    await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Synthetic exact routing history — NOT AI');
    await expect(page).toHaveURL(origin + target); expect(await f.application!.snapshot()).toBe(before);
  } finally { release?.(); await f.close(); }
});

test('failed credentials retain email and unsafe returns cannot escape the workspace allowlist', async ({ page, materialNetwork }) => {
  test.setTimeout(60000); const f = await fixture(page);
  try {
    await watchWorkspace(page); const user = await f.auth.createAccount();
    await page.goto(origin + '/sign-in?returnTo=%2F%2Fexample.com%2Fapp');
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 });
    await signIn(page, user.email, 'Not-the-account-password');
    await expect(page.getByRole('status')).toHaveText('Email or password is incorrect. Check both and try again.');
    expect(await page.getByLabel('Email', { exact: true }).inputValue() === user.email).toBe(true);
    expect(await page.getByLabel('Password', { exact: true }).inputValue()).toBe(''); await noWorkspace(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.password); await expect(page).toHaveURL(origin + '/app');
  } finally { await f.close(); }
});

test('uncertain revocation locks immediately and its truthful feedback survives reload, protected entry and Back', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, true); let release: (() => void) | undefined;
  try {
    await watchWorkspace(page); const user = await f.auth.createAccount(); await f.application!.saveNative(user.id);
    const before = await f.application!.snapshot();
    await page.goto(origin + '/sign-in');
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await signIn(page, user.email, user.password); await expect(page).toHaveURL(origin + '/app');
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Private draft must disappear'); await account(page, user.email);
    const gate = new Promise<void>(resolve => { release = resolve; }); let held = false;
    await page.route(f.auth.url + '/auth/v1/logout*', async route => { const response = await privateForward(route); expect(response.status()).toBe(204); held = true; await gate; await privateAbort(route); });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('.wp-shell')).toHaveCount(0); await expect(page).toHaveURL(origin + '/'); await expect.poll(() => held).toBe(true);
    release!(); await expect(page.getByText('We couldn’t confirm sign-out.', { exact: true })).toBeVisible();
    await page.reload(); await noWorkspace(page); await expect(page.getByText('We couldn’t confirm sign-out.', { exact: true })).toBeVisible();
    await page.goto(origin + '/app'); await noWorkspace(page); await expect(page).toHaveURL(origin + '/');
    await expect(page.getByText('We couldn’t confirm sign-out.', { exact: true })).toBeVisible();
    await page.goBack(); await noWorkspace(page); await expect(page.getByText('We couldn’t confirm sign-out.', { exact: true })).toBeVisible();
    expect(await f.application!.snapshot()).toBe(before);
  } finally { release?.(); await f.close(); }
});

test('recovery callback strips secrets and password update requires a fresh sign-in before workspace', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    await watchWorkspace(page); const user = await f.auth.createAccount(); await page.goto(origin + '/sign-in');
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click(); await privateFill(page.getByLabel('Email', { exact: true }), user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/recover', query: { redirect_to: origin + '/auth/callback' }, count: 1 });
    await page.getByRole('button', { name: 'Send reset link', exact: true }).click(); await expect(page.getByText('Check your email.', { exact: true })).toBeVisible();
    const link = await f.auth.recoveryLink(user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/verify', query: { token: '[private]', type: 'recovery', redirect_to: origin + '/auth/callback' }, count: 1 }, { origin, method: 'GET', path: '/auth/callback', query: { code: '[private]' }, count: 1 }, { origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'pkce' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await privateNavigate(page, link); await expect(page.getByLabel('New password', { exact: true })).toBeVisible(); await noWorkspace(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }, { origin: f.auth.url, method: 'PUT', path: '/auth/v1/user', query: {}, count: 1 }, { origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await privateFill(page.getByLabel('New password', { exact: true }), user.nextPassword); await privateFill(page.getByLabel('Confirm password', { exact: true }), user.nextPassword);
    await page.getByRole('button', { name: 'Update password', exact: true }).click(); await expect(page.getByText('Password updated.', { exact: true })).toBeVisible(); await noWorkspace(page);
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.nextPassword); await expect(page).toHaveURL(origin + '/app');
  } finally { await f.close(); }
});

test('a locked tab with an expired stored session reaches sign-in promptly instead of waiting on refresh backoff', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, true);
  try {
    await watchWorkspace(page); const user = await f.auth.createAccount();
    await page.goto(origin + '/sign-in');
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await signIn(page, user.email, user.password);
    await expect(page.getByRole('button', { name: 'New video', exact: true })).toBeVisible();
    // Another tab's sign-out or failed refresh leaves this browser locked while the stored session expires.
    await page.evaluate(() => {
      const nonce = crypto.randomUUID(); localStorage.setItem('workprint.auth-access-fenced', nonce); localStorage.setItem('workprint.auth-intent', nonce);
      const session = JSON.parse(localStorage.getItem('workprint.auth')!) as { expires_at: number }; session.expires_at = Math.floor(Date.now() / 1000) - 60;
      localStorage.setItem('workprint.auth', JSON.stringify(session));
    });
    // The strict ledger also proves the locked tab sends no refresh or user read to Auth.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible({ timeout: 5000 });
    await noWorkspace(page);
  } finally { await f.close(); }
});
