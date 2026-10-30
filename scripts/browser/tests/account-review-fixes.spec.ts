import { test, expect } from '../material-network.js';
import { privateContinue, privateForward, privateFulfill, fixture, account, signIn, origin } from '../account-fixture.js';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test('a credential-free logout retry cannot confirm an earlier uncertain revocation', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount(); await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden();
    await account(page, user.email);
    await page.route(f.auth.url + '/auth/v1/logout*', route => route.fulfill({ status: 503, json: { message: 'Controlled Auth outage' } }));
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('We couldn’t confirm sign-out.');
    await page.getByRole('button', { name: 'Try sign-out again', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Try sign-out again', exact: true })).toBeEnabled();
    await expect(page.getByRole('dialog')).toContainText('We couldn’t confirm sign-out.');
    await expect(page.getByRole('dialog')).not.toContainText('Signed out.');
  } finally { await f.close(); }
});

test('same-account recovery in another tab preserves valid scope and drafts during a transient user-check outage', async ({ page, context, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount(); await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep this valid-account draft');
    await page.route(f.auth.url + '/auth/v1/user', route => route.fulfill({ status: 503, json: { message: 'Controlled revalidation outage' } }));
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    const other = await context.newPage(); await other.goto(origin);
    await expect(other.getByRole('button', { name: user.email, exact: true })).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole('button', { name: user.email, exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep this valid-account draft');
  } finally { await f.close(); }
});

test('terminal real refresh rejection fences a still-unexpired account immediately', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, true, { jwtExpirySeconds: 180 });
  try {
    const user = await f.auth.createAccount(); await f.application!.saveNative(user.id); const saved = await f.application!.snapshot();
    await page.clock.install({ time: Date.now() }); await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Clear on terminal rejection');
    expect((await f.auth.request('admin/users/' + user.id, undefined, f.auth.serviceKey, 'DELETE')).status).toBe(200);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    const rejected = page.waitForResponse(response => new URL(response.url()).searchParams.get('grant_type') === 'refresh_token');
    await page.clock.fastForward(60000);
    const response = await rejected; expect(response.status()).toBeGreaterThanOrEqual(400);
    const value: unknown = await response.json();
    const codes = ['invalid_grant', 'refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'user_not_found', 'user_banned'];
    expect(!!value && typeof value === 'object' && (('code' in value && codes.includes(String(value.code))) || ('error_code' in value && codes.includes(String(value.error_code))) || ('error' in value && value.error === 'invalid_grant')), 'Expected a real terminal Auth error code').toBe(true);
    await expect(page.getByRole('dialog')).toContainText('Your session couldn’t be refreshed.');
    await expect(page.getByRole('button', { name: user.email, exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.locator('.wp-main textarea')).toHaveValue('');
    expect(await f.application!.snapshot() === saved).toBe(true);
  } finally { await f.close(); }
});

test('retryable refresh outage preserves valid scope and drafts through supported SDK retry', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, false, { jwtExpirySeconds: 180 });
  let release: (() => void) | undefined;
  try {
    const user = await f.auth.createAccount(); await page.clock.install({ time: Date.now() }); await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Preserve across transient refresh outage');
    let calls = 0; const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(f.auth.url + '/auth/v1/token?grant_type=refresh_token', async route => {
      if (++calls === 1) await route.fulfill({ status: 503, json: { message: 'Controlled retryable Auth outage' } });
      else { await gate; if (!route.request().failure()) await privateContinue(route); }
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 2 });
    await page.clock.fastForward(60000);
    await expect.poll(() => calls).toBe(2);
    await expect(page.getByRole('button', { name: user.email, exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Preserve across transient refresh outage');
    const renewed = page.waitForResponse(response => new URL(response.url()).searchParams.get('grant_type') === 'refresh_token' && response.status() === 200);
    release!(); await renewed;
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Preserve across transient refresh outage');
  } finally { release?.(); await f.close(); }
});

test('actual presentation expiry clears scope and ignores a held late refresh result', async ({ page, materialNetwork }) => {
  test.setTimeout(30000); const f = await fixture(page, false, { jwtExpirySeconds: 180 });
  let release: (() => void) | undefined;
  try {
    const user = await f.auth.createAccount(); await page.clock.install({ time: Date.now() }); await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Clear at expiry');
    let held = false; const gate = new Promise<void>(resolve => { release = resolve; });
    let finished!: () => void; const settled = new Promise<void>(resolve => { finished = resolve; });
    await page.route(f.auth.url + '/auth/v1/token?grant_type=refresh_token', async route => {
      try {
        const response = await privateForward(route); held = true; await gate;
        if (!route.request().failure()) await privateFulfill(route, { response });
      } finally { finished(); }
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    await page.clock.fastForward(60000); await expect.poll(() => held).toBe(true);
    await page.clock.fastForward(130000);
    await expect(page.getByRole('dialog')).toContainText('Your session has ended.');
    await expect(page.locator('.wp-main textarea')).toHaveValue('');
    release!(); await settled;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole('button', { name: user.email, exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.locator('.wp-main textarea')).toHaveValue('');
  } finally { release?.(); await f.close(); }
});

test('access-fence quota failure still clears account/drafts and performs SDK sign-out', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page);
  try {
    const user = await f.auth.createAccount(); await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await signIn(page, user.email, user.password); await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Clear despite quota'); await account(page, user.email);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as unknown as { restoreFenceStorage: () => void }).restoreFenceStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function(key, value) { if (key === 'workprint.auth-access-fenced') throw new DOMException('Controlled access-fence quota', 'QuotaExceededError'); return original.call(this, key, value); };
    });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: user.email, exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.locator('.wp-main textarea')).toHaveValue('');
    await expect(page.getByRole('dialog')).toContainText('Signed out, but the browser lock couldn’t be saved.');
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
    await page.evaluate(() => (window as unknown as { restoreFenceStorage: () => void }).restoreFenceStorage());
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Signed out.');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    // The exact one-logout allowance proves local fence retry did not replay revocation.
  } finally { await f.close(); }
});
