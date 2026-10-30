import { test, expect, type MaterialNetwork } from '../material-network.js';
import { fixture, account, signIn, privateFill, privateNavigate, privateForward, privateFulfill, privateAbort, origin } from '../account-fixture.js';
import type { Page } from '@playwright/test';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });
const login = (network: MaterialNetwork, url: string) => network.expectOperations({ origin: url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
type Jobs = { expiryJobs: { deadline: number; run: () => unknown }[] };
async function captureExpiry(page: Page, dropNotifications: boolean) {
  await page.addInitScript(drop => {
    const jobs: Jobs['expiryJobs'] = []; (window as unknown as Jobs).expiryJobs = jobs;
    const schedule = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof handler === 'function' && delay && delay >= 1000 && delay <= 360000 && new Error().stack?.includes('/src/auth/owner.ts')) {
        jobs.push({ deadline: Date.now() + delay, run: () => (handler as (...values: unknown[]) => unknown)(...args) });
        return schedule(() => {}, 3600000);
      }
      return schedule(handler, delay, ...args);
    }) as typeof window.setTimeout;
    if (drop) {
      window.addEventListener('storage', event => event.stopImmediatePropagation(), true);
      window.addEventListener('visibilitychange', event => event.stopImmediatePropagation(), true);
      const add = BroadcastChannel.prototype.addEventListener;
      BroadcastChannel.prototype.addEventListener = function(this: BroadcastChannel, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) { if (type !== 'message') return add.call(this, type, listener, options); };
    }
  }, dropNotifications);
}
async function removalFailure(page: Page) {
  await page.evaluate(() => {
    const remove = Storage.prototype.removeItem;
    (window as unknown as { repairRemoval: () => void }).repairRemoval = () => { Storage.prototype.removeItem = remove; };
    Storage.prototype.removeItem = function(key) { if (key === 'workprint.auth') throw new DOMException('Controlled SDK cleanup failure', 'QuotaExceededError'); return remove.call(this, key); };
  });
}
async function readFailure(page: Page) {
  await page.evaluate(() => {
    const get = Storage.prototype.getItem;
    (window as unknown as { repairRead: () => void }).repairRead = () => { Storage.prototype.getItem = get; };
    Storage.prototype.getItem = function(key) { if (key === 'workprint.auth-intent') throw new DOMException('Controlled unreadable intent', 'SecurityError'); return get.call(this, key); };
  });
}
async function recovery(page: Page, network: MaterialNetwork, f: Awaited<ReturnType<typeof fixture>>, email: string) {
  await page.goto(origin); await account(page); await page.getByRole('button', { name: 'Forgot password?', exact: true }).click(); await privateFill(page.getByLabel('Email', { exact: true }), email);
  network.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/recover', query: { redirect_to: origin + '/auth/callback' }, count: 1 });
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Check your email.');
  const link = await f.auth.recoveryLink(email);
  network.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/verify', query: { token: '[private]', type: 'recovery', redirect_to: origin + '/auth/callback' }, count: 1 }, { origin, method: 'GET', path: '/auth/callback', query: { code: '[private]' }, count: 1 }, { origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'pkce' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
  await privateNavigate(page, link); await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
}

test('queued old expiry cannot fence a newer account after suspension', async ({ page, context, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page); const cdp = await context.newCDPSession(page); let frozen = false;
  try {
    const old = await f.auth.createAccount(), newer = await f.auth.createAccount(); await captureExpiry(page, true);
    await page.goto(origin); await account(page); login(materialNetwork, f.auth.url); await signIn(page, old.email, old.password); await expect(page.getByRole('dialog')).toBeHidden();
    await expect.poll(() => page.evaluate(() => (window as unknown as Jobs).expiryJobs.length)).toBe(1);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); frozen = true;
    const other = await context.newPage(); materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }); await other.goto(origin); await account(other, old.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 }); await other.getByRole('button', { name: 'Switch account', exact: true }).click(); await expect(other.getByLabel('Email', { exact: true })).toBeVisible();
    login(materialNetwork, f.auth.url); await signIn(other, newer.email, newer.password); await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible(); await other.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep the newer draft');
    const revision = await other.evaluate(() => localStorage.getItem('workprint.auth-intent'));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' }); frozen = false;
    await page.evaluate(async () => { await (window as unknown as Jobs).expiryJobs[0]!.run(); });
    expect(await other.evaluate(() => localStorage.getItem('workprint.auth-intent')) === revision).toBe(true);
    await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible(); await expect(other.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep the newer draft');
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }); await other.reload(); await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
  } finally { if (frozen) await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await cdp.detach(); await f.close(); }
});

test('queued same-purpose expiry checks the SDK after native refresh advanced expiry', async ({ page, context, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page, true, { jwtExpirySeconds: 180 }); const cdp = await context.newCDPSession(page); let frozen = false;
  try {
    const user = await f.auth.createAccount(); await page.clock.install({ time: Date.now() }); await page.clock.pauseAt(Date.now()); await captureExpiry(page, true);
    await page.goto(origin); await account(page); login(materialNetwork, f.auth.url); await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden(); await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep the original draft');
    const deadline = await page.evaluate(() => (window as unknown as Jobs).expiryJobs[0]!.deadline);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); frozen = true;
    const other = await context.newPage(); await captureExpiry(other, false); materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }); await other.goto(origin); await expect(other.getByRole('button', { name: user.email, exact: true })).toBeVisible();
    // Establish an actual later server issuance second, not a sleep hoping that refresh advanced it.
    await expect.poll(() => Math.floor(Date.now() / 1000) > Math.floor(deadline / 1000) - 180).toBe(true);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 }, { origin: f.application!.apiOrigin, method: 'GET', path: '/v1/library', query: {}, count: 1 });
    await page.clock.setSystemTime(deadline - 20000); await other.getByRole('button', { name: 'Library', exact: true }).click();
    await expect.poll(() => other.evaluate(() => (window as unknown as Jobs).expiryJobs.some(job => job.deadline > (window as unknown as Jobs).expiryJobs[0]!.deadline))).toBe(true);
    const revision = await other.evaluate(() => localStorage.getItem('workprint.auth-intent'));
    // Public getSession can proactively refresh near expiry while checking the advanced SDK session.
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    await page.clock.setSystemTime(deadline + 1); await cdp.send('Page.setWebLifecycleState', { state: 'active' }); frozen = false;
    await page.evaluate(async () => { await (window as unknown as Jobs).expiryJobs[0]!.run(); });
    expect(await other.evaluate(() => localStorage.getItem('workprint.auth-intent')) === revision).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep the original draft'); await expect(page.getByRole('button', { name: user.email, exact: true })).toBeVisible();
  } finally { if (frozen) await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await cdp.detach(); await f.close(); }
});

test('authenticated logout acknowledgement survives SDK cleanup failure and local retry', async ({ page, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount(); await page.goto(origin); await account(page); login(materialNetwork, f.auth.url); await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden(); await account(page, user.email); await removalFailure(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 }); const ack = page.waitForResponse(r => new URL(r.url()).pathname === '/auth/v1/logout' && r.status() === 204);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await ack;
    await expect(page.getByRole('dialog')).toContainText('Signed out, but the browser lock couldn’t be saved.'); await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
    await page.evaluate(() => (window as unknown as { repairRemoval: () => void }).repairRemoval()); await page.getByRole('button', { name: 'Try again', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Signed out.');
    await page.reload(); await account(page); await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  } finally { await f.close(); }
});

for (const unknown of [false, true]) test(`recovery ${unknown ? 'unknown' : 'successful'} update settles when subsequent SDK cleanup throws`, async ({ page, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount(); await recovery(page, materialNetwork, f, user.email); await removalFailure(page);
    if (unknown) await page.route(f.auth.url + '/auth/v1/user', async route => { const response = await privateForward(route); if (route.request().method() === 'PUT') { expect(response.status()).toBe(200); await privateAbort(route); } else await privateFulfill(route, { response }); });
    await privateFill(page.getByLabel('New password', { exact: true }), user.nextPassword); await privateFill(page.getByLabel('Confirm password', { exact: true }), user.nextPassword);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }, { origin: f.auth.url, method: 'PUT', path: '/auth/v1/user', query: {}, count: 1 }, { origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Signed out, but the browser lock couldn’t be saved.'); await expect(page.locator('form.wp-auth-content')).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(() => (window as unknown as { repairRemoval: () => void }).repairRemoval()); await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(unknown ? 'We couldn’t confirm the password update.' : 'Password updated.');
    const verified = await f.auth.request('token?grant_type=password', { email: user.email, password: user.nextPassword }); expect(verified.status).toBe(200); await verified.body?.cancel();
  } finally { await f.close(); }
});

test('unreadable intent keeps sign-out fenced and unconfirmed until safe repair', async ({ page, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount(); await page.goto(origin); await account(page); login(materialNetwork, f.auth.url); await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden(); await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Clear on unreadable sign-out'); await account(page, user.email); await readFailure(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('We couldn’t confirm sign-out.'); await expect(page.getByRole('dialog')).toContainText('the lock couldn’t be saved.'); await expect(page.locator('.wp-main textarea')).toHaveValue('');
    await page.evaluate(() => (window as unknown as { repairRead: () => void }).repairRead());
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Try sign-out again', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Signed out.'); await page.reload(); await account(page); await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  } finally { await f.close(); }
});

test('repairing unreadable old intent never revokes a newer account', async ({ page, context, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page);
  try {
    const old = await f.auth.createAccount(), newer = await f.auth.createAccount();
    // Retain the pending attempt despite missed notifications; repair must recheck durable intent.
    await captureExpiry(page, true);
    await page.goto(origin); await account(page); login(materialNetwork, f.auth.url); await signIn(page, old.email, old.password); await expect(page.getByRole('dialog')).toBeHidden(); await account(page, old.email); await readFailure(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('We couldn’t confirm sign-out.');
    const other = await context.newPage(); materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }); await other.goto(origin); await account(other, old.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 }); await other.getByRole('button', { name: 'Switch account', exact: true }).click(); await expect(other.getByLabel('Email', { exact: true })).toBeVisible(); login(materialNetwork, f.auth.url); await signIn(other, newer.email, newer.password); await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    await other.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep newer work'); const revision = await other.evaluate(() => localStorage.getItem('workprint.auth-intent'));
    await page.evaluate(() => (window as unknown as { repairRead: () => void }).repairRead()); await page.getByRole('button', { name: 'Try sign-out again', exact: true }).click();
    expect(await other.evaluate(() => localStorage.getItem('workprint.auth-intent')) === revision).toBe(true); await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible(); await expect(other.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep newer work');
  } finally { await f.close(); }
});
