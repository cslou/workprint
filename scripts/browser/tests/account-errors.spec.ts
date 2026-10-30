import { test, expect } from '../material-network.js';
import { fixture, account, signIn, privateFill, privateNavigate, origin } from '../account-fixture.js';
import type { Page } from '@playwright/test';
import type { MaterialNetwork } from '../material-network.js';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });
async function reset(page: Page, network: MaterialNetwork, f: Awaited<ReturnType<typeof fixture>>, email: string) {
  await page.goto(origin); await account(page);
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await privateFill(page.getByLabel('Email', { exact: true }), email);
  network.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/recover', query: { redirect_to: origin + '/auth/callback' }, count: 1 });
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
}
function consume(network: MaterialNetwork, authOrigin: string, valid: boolean, fragment = false) {
  network.expectOperations({ origin: authOrigin, method: 'GET', path: '/auth/v1/verify', query: { token: '[private]', type: 'recovery', redirect_to: origin + '/auth/callback' }, count: 1 },
    { origin, method: 'GET', path: '/auth/callback', query: valid ? { code: '[private]' } : fragment ? {} : { error: '[private]', error_code: '[private]', error_description: '[private]' }, count: 1 });
  if (valid) network.expectOperations({ origin: authOrigin, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'pkce' }, count: 1 });
}

test('reset delivery uncertainty remains non-enumerating even when real email was sent', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount();
    await page.route(f.auth.url + '/auth/v1/recover*', async route => {
      let response; try { response = await route.fetch(); } catch { throw new Error('Private reset forwarding failed'); }
      expect(response.status()).toBe(200); await route.abort('failed');
    });
    await reset(page, materialNetwork, f, user.email);
    await expect(page.getByRole('status')).toHaveText('We couldn’t confirm the reset email. Check your inbox, or try again.');
    expect(typeof await f.auth.recoveryLink(user.email)).toBe('string');
    await expect(page.getByRole('button', { name: 'Send reset link', exact: true })).toBeEnabled();
  } finally { await f.close(); }
});

test('real password policy rejection and uncertain successful mutation have distinct feedback without replay', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount(); await reset(page, materialNetwork, f, user.email);
    await expect(page.getByRole('dialog')).toContainText('Check your email.');
    const link = await f.auth.recoveryLink(user.email); consume(materialNetwork, f.auth.url, true); await privateNavigate(page, link);
    await privateFill(page.getByLabel('New password', { exact: true }), 'x'); await privateFill(page.getByLabel('Confirm password', { exact: true }), 'y');
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Passwords don’t match. Re-enter the new password.');
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'PUT', path: '/auth/v1/user', query: {}, count: 1 });
    await privateFill(page.getByLabel('New password', { exact: true }), 'x'); await privateFill(page.getByLabel('Confirm password', { exact: true }), 'x');
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('The password wasn’t accepted. Choose a different password and try again.');
    await page.route(f.auth.url + '/auth/v1/user', async route => {
      let response; try { response = await route.fetch(); } catch { throw new Error('Private password forwarding failed'); }
      expect(response.status()).toBe(200); await route.abort('failed');
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'PUT', path: '/auth/v1/user', query: {}, count: 1 }, { origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await privateFill(page.getByLabel('New password', { exact: true }), user.nextPassword); await privateFill(page.getByLabel('Confirm password', { exact: true }), user.nextPassword);
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('We couldn’t confirm the password update.');
    await expect(page.getByRole('button', { name: 'Back to sign in', exact: true })).toBeEnabled();
    await page.unroute(f.auth.url + '/auth/v1/user');
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 });
    await signIn(page, user.email, user.nextPassword); await expect(page.getByRole('dialog')).toBeHidden();
  } finally { await f.close(); }
});

test('closing pending sign-in dismisses rather than replays it; Switch account fences before fresh sign-in', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    const first = await f.auth.createAccount(), second = await f.auth.createAccount();
    await page.goto(origin); await account(page);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(f.auth.url + '/auth/v1/token?grant_type=password', async route => { await gate; await route.continue(); });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 });
    await signIn(page, first.email, first.password);
    await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toBeDisabled();
    expect(await page.getByLabel('Password', { exact: true }).inputValue() === '', 'Submitted password remained in pending DOM').toBe(true);
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden();
    release(); await expect(page.getByRole('button', { name: first.email, exact: true })).toBeVisible();
    await page.unroute(f.auth.url + '/auth/v1/token?grant_type=password');
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('First-account unsent draft');
    await account(page, first.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Switch account', exact: true }).focus(); await page.keyboard.press('Space');
    await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 });
    await signIn(page, second.email, second.password);
    await expect(page.getByRole('button', { name: second.email, exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  } finally { await f.close(); }
});

test('built production account entry uses the qualified SDK and validated public configuration', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, false, {}, 'built');
  try {
    const user = await f.auth.createAccount();
    await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 });
    await signIn(page, user.email, user.password);
    await expect(page.getByRole('button', { name: user.email, exact: true })).toBeVisible();
    await account(page, user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  } finally { await f.close(); }
});

for (const mode of ['invalid', 'expired'] as const) test(`real delivered ${mode} recovery link settles with safe actionable feedback`, async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, false, { otpExpirySeconds: mode === 'expired' ? 1 : 300 });
  try {
    const user = await f.auth.createAccount(); await reset(page, materialNetwork, f, user.email);
    await expect(page.getByRole('dialog')).toContainText('Check your email.');
    const link = new URL(await f.auth.recoveryLink(user.email));
    if (mode === 'invalid') link.searchParams.set('token', 'deliberately-invalid-owned-fixture-token');
    else await new Promise(resolve => setTimeout(resolve, 2100)); // Real configured one-second server OTP expiry.
    consume(materialNetwork, f.auth.url, false, mode === 'invalid'); await privateNavigate(page, link.href);
    await expect(page.getByRole('dialog')).toContainText('This reset link can’t be used.');
    await expect(page.getByRole('button', { name: 'Request a new link', exact: true })).toBeEnabled();
  } finally { await f.close(); }
});
