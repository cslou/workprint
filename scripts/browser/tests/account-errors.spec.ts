import { test, expect } from '../material-network.js';
import { fixture, account, signIn, privateFill, privateNavigate, origin } from '../account-fixture.js';
import type { Page } from '@playwright/test';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
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
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
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
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
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
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, second.email, second.password);
    await expect(page.getByRole('button', { name: second.email, exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  } finally { await f.close(); }
});

test('occupied frontend port is refused before borrowing another listener', async ({ page }) => {
  test.setTimeout(90000);
  const occupied = createServer((_request, response) => response.end('Owned occupied-port control'));
  await new Promise<void>(resolve => occupied.listen(4180, '127.0.0.1', resolve));
  let acquired: Awaited<ReturnType<typeof fixture>> | undefined;
  let refused = false;
  try { acquired = await fixture(page); } catch (error) { refused = error instanceof Error && error.message.includes('4180'); }
  finally { try { await acquired?.close(); } finally { await new Promise<void>(resolve => occupied.close(() => resolve())); } }
  expect(refused, 'Frontend attached to a listener it did not start').toBe(true);
});

test('browser resource cleanup continues after a context-close error and reports it', async ({ page }) => {
  test.setTimeout(90000); const f = await fixture(page);
  const context = page.context(), original = context.close.bind(context);
  let failure: unknown;
  context.close = async () => { throw new Error('Controlled browser context close failure'); };
  try {
    try { await f.close(); } catch (error) { failure = error; }
    const port = createServer();
    let vacant = false;
    try { await new Promise<void>((resolve, reject) => { port.once('error', reject); port.listen(4180, '127.0.0.1', resolve); }); vacant = true; } catch { vacant = false; }
    finally { if (port.listening) await new Promise<void>(resolve => port.close(() => resolve())); }
    const containersRemoved = f.auth.containerIds.every(id => execFileSync('docker', ['ps', '--all', '--quiet', '--filter', 'id=' + id]).length === 0);
    expect(failure instanceof AggregateError && failure.errors.length === 1 && failure.errors[0] instanceof Error && failure.errors[0].message === 'Controlled browser context close failure', 'Context failure was not preserved with cleanup context').toBe(true);
    expect(vacant, 'Owned frontend remained after context-close failure').toBe(true);
    expect(containersRemoved, 'Owned Auth service remained after context-close failure').toBe(true);
  } finally {
    context.close = original; await original();
    await f.close().catch(error => { if (!(error instanceof AggregateError)) throw error; });
  }
});

test('built production account entry uses the qualified SDK and validated public configuration', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, false, {}, 'built');
  try {
    const user = await f.auth.createAccount();
    await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
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
