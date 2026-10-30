import { test, expect } from '../material-network.js';
import { fixture, account, signIn, origin } from '../account-fixture.js';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('a superseded real sign-in cannot replace the newer account in persistent SDK state', async ({ page, context, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, true);
  let release: (() => void) | undefined;
  try {
    const first = await f.auth.createAccount(), newer = await f.auth.createAccount();
    await page.goto(origin); await account(page);
    const other = await context.newPage(); await other.goto(origin); await account(other);
    let held = false; let finished!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), settled = new Promise<void>(resolve => { finished = resolve; });
    await page.route(f.auth.url + '/auth/v1/token?grant_type=password', async route => {
      try {
        const response = await route.fetch(); held = true; await gate;
        if (!route.request().failure()) await route.fulfill({ response });
      } finally { finished(); }
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 2 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, first.email, first.password); await expect.poll(() => held).toBe(true);
    await expect(other.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    if (await other.getByLabel('Email', { exact: true }).count() === 0) await other.getByRole('button', { name: 'Sign in', exact: true }).click();
    await signIn(other, newer.email, newer.password);
    await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    release!(); await settled;
    await other.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await other.reload();
    await expect(other.getByRole('button', { name: newer.email, exact: true })).toBeVisible();
    materialNetwork.expectOperations({ origin: f.application!.apiOrigin, method: 'GET', path: '/v1/library', query: {}, count: 1 });
    await other.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(other.getByRole('status')).toContainText('Library not available yet');
  } finally { release?.(); await f.close(); }
});

test('late real SDK restoration after another-tab sign-out cannot restore identity or backend access', async ({ page, context, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, true);
  let release: (() => void) | undefined;
  try {
    const user = await f.auth.createAccount(); await f.application!.saveNative(user.id); const saved = await f.application!.snapshot();
    await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Old account draft');
    const waiting = await context.newPage(); let held = false; let finished!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), settled = new Promise<void>(resolve => { finished = resolve; });
    await waiting.route(f.auth.url + '/auth/v1/user', async route => {
      try { const response = await route.fetch(); held = true; await gate; if (!route.request().failure()) await route.fulfill({ response }); }
      finally { finished(); }
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await waiting.goto(origin); await expect.poll(() => held).toBe(true);
    await account(page, user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    release!(); await settled;
    await waiting.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(waiting.getByRole('button', { name: user.email, exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.locator('.wp-main textarea')).toHaveValue('');
    await expect(waiting.locator('.wp-main textarea')).toHaveValue('');
    if (await waiting.getByRole('dialog').count()) await waiting.keyboard.press('Escape');
    await waiting.getByRole('button', { name: 'Library', exact: true }).click();
    // No API operation allowance: an old token must not reach the real built backend.
    await expect(waiting.getByRole('dialog')).not.toContainText('Library not available yet');
    expect(await f.application!.snapshot() === saved, 'Restoration fencing changed saved native work').toBe(true);
  } finally { release?.(); await f.close(); }
});

test('late real SDK token refresh after another-tab sign-out cannot dispatch an old-scope read', async ({ page, context, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, true, { jwtExpirySeconds: 180 });
  let release: (() => void) | undefined;
  try {
    const user = await f.auth.createAccount(); await f.application!.saveNative(user.id); const saved = await f.application!.snapshot();
    await page.clock.install({ time: Date.now() }); await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden();
    const other = await context.newPage();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await other.goto(origin); await expect(other.getByRole('button', { name: user.email, exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Never restore this draft');
    let held = false; let finished!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), settled = new Promise<void>(resolve => { finished = resolve; });
    await page.route(f.auth.url + '/auth/v1/token?grant_type=refresh_token', async route => {
      try { const response = await route.fetch(); held = true; await gate; if (!route.request().failure()) await route.fulfill({ response }); }
      finally { finished(); }
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    // Both tabs share the browser clock; SDK logout may also refresh its near-expiry session.
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    await page.clock.setSystemTime(Date.now() + 140000);
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await account(other, user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await other.getByRole('button', { name: 'Sign out', exact: true }).click();
    // Sign-out is already fenced; the SDK may await the shared in-flight refresh before revocation.
    await expect(other.getByRole('dialog')).toContainText('Signing out');
    release!(); await settled;
    await expect(other.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole('button', { name: user.email, exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.locator('.wp-main textarea')).toHaveValue('');
    // The pending Library operation has no allowance and must never dispatch after fencing.
    expect(await f.application!.snapshot() === saved, 'Token fencing changed saved native work').toBe(true);
  } finally { release?.(); await f.close(); }
});
