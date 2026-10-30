import { test, expect } from '../material-network.js';
import { fixture, account, signIn, privateFill, privateNavigate, privateForward, privateFulfill, origin } from '../account-fixture.js';
import type { MaterialNetwork } from '../material-network.js';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });
const login = (network: MaterialNetwork, url: string) => network.expectOperations({ origin: url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });

test('genuine authenticated revocation after failure clears uncertainty', async ({ page, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount(); await page.goto(origin); await account(page); login(materialNetwork, f.auth.url); await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden(); await account(page, user.email);
    await page.evaluate(() => {
      const original = Storage.prototype.removeItem;
      (window as unknown as { restoreRemoval: () => void }).restoreRemoval = () => { Storage.prototype.removeItem = original; };
      Storage.prototype.removeItem = function(key) { if (key === 'workprint.auth') throw new Error('Controlled local removal failure'); return original.call(this, key); };
    });
    await f.auth.pauseAuthUpstream();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('We couldn’t confirm sign-out.');
    await page.evaluate(() => (window as unknown as { restoreRemoval: () => void }).restoreRemoval()); await f.auth.resumeAuthUpstream();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    const confirmed = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/logout' && response.status() === 204);
    await page.getByRole('button', { name: 'Try sign-out again', exact: true }).click(); await confirmed;
    await expect(page.getByRole('dialog')).toContainText('Signed out.'); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  } finally { await f.close(); }
});

test('failed browser storage can be repaired locally before fresh SDK sign-in', async ({ page, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount();
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function(key, value) { if (key === 'workprint.auth-storage-check') throw new DOMException('Controlled unavailable storage', 'QuotaExceededError'); return original.call(this, key, value); };
    });
    await page.goto(origin); await expect(page.getByRole('dialog')).toContainText('Account access is locked in this tab.');
    await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    login(materialNetwork, f.auth.url); await signIn(page, user.email, user.password);
    await expect(page.getByRole('button', { name: user.email, exact: true })).toBeVisible();
  } finally { await f.close(); }
});

test('pending and unconfirmed sign-out report unsaved lock without false retry success', async ({ page, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page); let release: (() => void) | undefined;
  try {
    const user = await f.auth.createAccount(); await page.goto(origin); await account(page); login(materialNetwork, f.auth.url); await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden(); await account(page, user.email);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function(key, value) { if (key === 'workprint.auth-access-fenced') throw new DOMException('Controlled unsaved lock', 'QuotaExceededError'); return original.call(this, key, value); };
    });
    await f.auth.pauseAuthUpstream(); let held = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(f.auth.url + '/auth/v1/logout*', async route => {
      const response = await privateForward(route); expect(response.status()).toBeGreaterThanOrEqual(500);
      held = true; await gate; if (!route.request().failure()) await privateFulfill(route, { response });
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Signing out…');
    await expect(page.getByRole('dialog')).toContainText('Your browser couldn’t save the account lock. Access is locked in this tab.');
    await expect(page.getByRole('button', { name: 'Try sign-out again', exact: true })).toHaveCount(0);
    await expect.poll(() => held).toBe(true); release!();
    await expect(page.getByRole('dialog')).toContainText('We couldn’t confirm sign-out.');
    await expect(page.getByRole('dialog')).toContainText('the lock couldn’t be saved.');
    await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
    await page.getByRole('button', { name: 'Try sign-out again', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Account access is locked here. Try signing out again.');
    await expect(page.getByRole('dialog')).not.toContainText('Signed out.');
    // The one-logout allowance proves the credential-free retry did not authenticate revocation.
  } finally { release?.(); await f.close(); }
});

test('late real terminal body cannot fence a newly authenticated account', async ({ page, context, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page, true, { jwtExpirySeconds: 180 });
  try {
    await page.addInitScript(() => {
      const original = window.fetch.bind(window); let release: (() => void) | undefined;
      const held = { waiting: false, consumed: false, release: () => release?.() };
      (window as unknown as { heldTerminal: typeof held }).heldTerminal = held;
      window.fetch = async (input, init) => {
        const response = await original(input, init);
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        if (url.searchParams.get('grant_type') !== 'refresh_token' || response.ok || held.waiting || !response.body) return response;
        const reader = response.body.getReader(), gate = new Promise<void>(resolve => { release = resolve; });
        const body = new ReadableStream<Uint8Array>({ async start(controller) {
          held.waiting = true; await gate;
          try { for (;;) { const part = await reader.read(); if (part.done) { controller.close(); break; } controller.enqueue(part.value); } }
          catch { controller.error(new Error('Controlled terminal stream closed')); }
        } });
        const delayed = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
        const json = delayed.json.bind(delayed);
        delayed.json = async () => { try { return await json(); } finally { held.consumed = true; } };
        return delayed;
      };
    });
    const old = await f.auth.createAccount(), newer = await f.auth.createAccount();
    await f.application!.saveNative(old.id); const saved = await f.application!.snapshot();
    await page.clock.install({ time: Date.now() }); await page.clock.pauseAt(Date.now());
    await page.goto(origin); await account(page); login(materialNetwork, f.auth.url); await signIn(page, old.email, old.password); await expect(page.getByRole('dialog')).toBeHidden();
    const other = await context.newPage(); materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }); await other.goto(origin); await expect(other.getByRole('button', { name: old.email, exact: true })).toBeVisible();
    expect((await f.auth.request('admin/users/' + old.id, undefined, f.auth.serviceKey, 'DELETE')).status).toBe(200);
    // Drive the owning read explicitly; do not run both tabs' automatic-refresh timers.
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    const rejection = page.waitForResponse(response => new URL(response.url()).searchParams.get('grant_type') === 'refresh_token');
    await page.clock.setSystemTime(Date.now() + 140000); await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { heldTerminal: { waiting: boolean } }).heldTerminal.waiting)).toBe(true);
    const rejected = await rejection; expect(rejected.status()).toBeGreaterThanOrEqual(400);
    const error: unknown = await rejected.json(); expect(!!error && typeof error === 'object' && 'code' in error && ['user_not_found', 'refresh_token_not_found', 'session_not_found'].includes(String(error.code))).toBe(true);
    // The old read is now in classification. Restore wall time without firing either tab's timers;
    // peer logout/new login must not start unrelated near-expiry refreshes.
    await page.clock.setSystemTime(Date.now());
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await account(other, old.email); await other.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Try sign-out again', exact: true })).toBeEnabled();
    await other.reload(); await account(other); login(materialNetwork, f.auth.url); await signIn(other, newer.email, newer.password); await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    await other.getByRole('textbox', { name: 'Message', exact: true }).fill('New account draft');
    await page.evaluate(() => (window as unknown as { heldTerminal: { release: () => void } }).heldTerminal.release());
    // Flush the already-released stream without advancing SDK scheduling in either tab.
    await expect.poll(() => page.evaluate(() => (window as unknown as { heldTerminal: { consumed: boolean } }).heldTerminal.consumed)).toBe(true);
    await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible(); await expect(other.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('New account draft');
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }); await other.reload(); await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    expect(await f.application!.snapshot() === saved).toBe(true);
  } finally {
    try { if (!page.isClosed()) await page.evaluate(() => (window as unknown as { heldTerminal?: { release: () => void } }).heldTerminal?.release()); }
    finally { await f.close(); }
  }
});

async function enterRecovery(page: import('@playwright/test').Page, materialNetwork: MaterialNetwork, f: Awaited<ReturnType<typeof fixture>>, email: string) {
    await page.goto(origin); await account(page); await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await privateFill(page.getByLabel('Email', { exact: true }), email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/recover', query: { redirect_to: origin + '/auth/callback' }, count: 1 });
    await page.getByRole('button', { name: 'Send reset link', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('Check your email.');
    const link = await f.auth.recoveryLink(email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/verify', query: { token: '[private]', type: 'recovery', redirect_to: origin + '/auth/callback' }, count: 1 }, { origin, method: 'GET', path: '/auth/callback', query: { code: '[private]' }, count: 1 }, { origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'pkce' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await privateNavigate(page, link); await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
}

test('late failed recovery navigation cannot replace a newer sign-in intent', async ({ page, context, materialNetwork }) => {
  test.setTimeout(45000); const f = await fixture(page); let releaseOld: (() => void) | undefined, releaseNew: (() => void) | undefined;
  try {
    const first = await f.auth.createAccount(), newer = await f.auth.createAccount();
    await page.clock.install({ time: Date.now() }); await page.clock.pauseAt(Date.now());
    await enterRecovery(page, materialNetwork, f, first.email);
    const other = await context.newPage(); await other.goto(origin); await account(other); await expect(other.getByLabel('Email', { exact: true })).toBeVisible();
    const removed = await f.auth.request('admin/users/' + first.id, undefined, f.auth.serviceKey, 'DELETE'); expect(removed.status).toBe(200); await removed.body?.cancel();
    let oldHeld = false, newHeld = false;
    const oldGate = new Promise<void>(resolve => { releaseOld = resolve; }), newGate = new Promise<void>(resolve => { releaseNew = resolve; });
    await page.route(f.auth.url + '/auth/v1/token?grant_type=refresh_token', async route => {
      const response = await privateForward(route), value: unknown = await response.json();
      expect(response.status()).toBeGreaterThanOrEqual(400);
      expect(!!value && typeof value === 'object' && 'code' in value && ['user_not_found', 'refresh_token_not_found', 'session_not_found'].includes(String(value.code))).toBe(true);
      oldHeld = true; await oldGate; if (!route.request().failure()) await privateFulfill(route, { response });
    });
    await other.route(f.auth.url + '/auth/v1/token?grant_type=password', async route => {
      const response = await privateForward(route); expect(response.status()).toBe(200);
      newHeld = true; await newGate; if (!route.request().failure()) await privateFulfill(route, { response });
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    await page.clock.setSystemTime(Date.now() + 400000); await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    await expect.poll(() => oldHeld).toBe(true);
    login(materialNetwork, f.auth.url); await signIn(other, newer.email, newer.password); await expect.poll(() => newHeld).toBe(true);
    releaseOld!();
    // Observe the complete SDK failure boundary before restoring time and allowing new publication.
    await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).held?.some(lock => lock.name === 'workprint.auth-change') ?? false)).toBe(false);
    await page.clock.setSystemTime(Date.now()); releaseNew!();
    await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }); await other.reload(); await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
  } finally { releaseOld?.(); releaseNew?.(); await f.close(); }
});

for (const same of [false, true]) test(`suspended recovery cannot update a newer ${same ? 'same-account sign-in purpose' : 'different account'}`, async ({ page, context, materialNetwork }) => {
  test.setTimeout(60000); const f = await fixture(page); let frozen = false;
  const cdp = await context.newCDPSession(page);
  try {
    const first = await f.auth.createAccount(), newer = same ? first : await f.auth.createAccount();
    // Model a suspended/BFCache page that loses notifications: real SDK storage and Auth
    // remain intact, but neither a transient storage event nor a queued channel can rescue it.
    await page.addInitScript(() => {
      window.addEventListener('storage', event => event.stopImmediatePropagation(), true);
      window.addEventListener('visibilitychange', event => event.stopImmediatePropagation(), true);
      const original = BroadcastChannel.prototype.addEventListener;
      BroadcastChannel.prototype.addEventListener = function(this: BroadcastChannel, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
        if (type !== 'message') return original.call(this, type, listener, options);
      };
    });
    await enterRecovery(page, materialNetwork, f, first.email);
    await privateFill(page.getByLabel('New password', { exact: true }), first.nextPassword); await privateFill(page.getByLabel('Confirm password', { exact: true }), first.nextPassword);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); frozen = true;
    const other = await context.newPage(); await other.goto(origin); await account(other); login(materialNetwork, f.auth.url); await signIn(other, newer.email, newer.password); await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    await cdp.send('Page.setWebLifecycleState', { state: 'active' }); frozen = false;
    if (await page.getByRole('button', { name: 'Update password', exact: true }).count()) await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(/This reset link can’t be used\.|Password updated\.|Your session has ended\./);
    // Verify the actual new account's original credential before asserting the safe presentation.
    // No PUT/logout allowance: the old recovery must not mutate/revoke the newly published session.
    const check = await f.auth.request('token?grant_type=password', { email: newer.email, password: newer.password }); expect(check.status).toBe(200); await check.body?.cancel();
    await expect(page.getByRole('dialog')).toContainText('This reset link can’t be used.');
  } finally { if (frozen) await cdp.send('Page.setWebLifecycleState', { state: 'active' }); await cdp.detach(); await f.close(); }
});

test('actual session_not_found restoration cannot remove a newer SDK session', async ({ page, context, materialNetwork }) => {
  test.setTimeout(60000); const f = await fixture(page, true); let release: (() => void) | undefined;
  try {
    const old = await f.auth.createAccount(), newer = await f.auth.createAccount(); await f.application!.saveNative(old.id); const saved = await f.application!.snapshot();
    await page.goto(origin); await account(page); login(materialNetwork, f.auth.url); await signIn(page, old.email, old.password); await expect(page.getByRole('dialog')).toBeHidden();
    // A failed startup check exposes the approved fresh-sign-in action without a cleanup logout.
    await page.route(f.auth.url + '/auth/v1/user', route => route.fulfill({ status: 503, json: { message: 'Controlled initial validation outage' } }));
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await page.reload(); await account(page); await expect(page.getByRole('dialog')).toContainText('Your session couldn’t be checked.');
    await page.unroute(f.auth.url + '/auth/v1/user');
    const waiting = await context.newPage(); let held = false; let finished!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), settled = new Promise<void>(resolve => { finished = resolve; });
    await waiting.route(f.auth.url + '/auth/v1/user', async route => {
      try {
        // Revoke exactly the real session used by the held request. Never retain/log its header.
        const revoke = await fetch(f.auth.url + '/auth/v1/logout?scope=local', { method: 'POST', headers: await route.request().allHeaders(), signal: AbortSignal.timeout(5000) });
        expect(revoke.status).toBe(204); await revoke.body?.cancel();
        const response = await privateForward(route); const value: unknown = await response.json();
        expect(response.status()).toBeGreaterThanOrEqual(400); expect(response.status()).toBeLessThan(500);
        expect(!!value && typeof value === 'object' && 'code' in value && value.code === 'session_not_found').toBe(true);
        held = true; await gate; await privateFulfill(route, { response });
      } finally { finished(); }
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }); await waiting.goto(origin); await expect.poll(() => held).toBe(true);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    login(materialNetwork, f.auth.url); await signIn(page, newer.email, newer.password); await expect(page.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    release!(); await settled; await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 }); await page.reload(); await expect(page.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    expect(await f.application!.snapshot() === saved).toBe(true);
  } finally { release?.(); await f.close(); }
});
