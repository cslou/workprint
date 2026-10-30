import { test, expect } from '../material-network.js';
import { parsePublicAuthConfig } from '../../../apps/web/src/auth/public-config.js';
import { fixture, account, signIn, privateFill, privateNavigate, origin } from '../account-fixture.js';
import { settleCapture } from '../capture.js';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });

// No traces/HAR/storageState or credential-bearing navigation/error attachments.

test('real delivered email completes PKCE recovery, quarantines access and requires fresh sign-in', async ({ page, materialNetwork }) => {
  test.setTimeout(90000);
  const f = await fixture(page);
  try {
    const user = await f.auth.createAccount();
    await page.goto(origin); await account(page);
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await privateFill(page.getByLabel('Email', { exact: true }), user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/recover', query: { redirect_to: origin + '/auth/callback' }, count: 1 });
    await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('If an account exists');
    const link = await f.auth.recoveryLink(user.email);
    materialNetwork.expectOperations(
      { origin: f.auth.url, method: 'GET', path: '/auth/v1/verify', query: { token: '[private]', type: 'recovery', redirect_to: origin + '/auth/callback' }, count: 1 },
      { origin, method: 'GET', path: '/auth/callback', query: { code: '[private]' }, count: 1 },
      { origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'pkce' }, count: 1 },
    );
    await privateNavigate(page, link);
    await expect(page.getByRole('heading', { name: 'Set new password', exact: true })).toBeVisible();
    expect(new URL(page.url()).search.length + new URL(page.url()).hash.length).toBe(0);
    // Recovery never presents ordinary account identity or allows application work.
    await expect(page.locator('.wp-sidebar .wp-account')).toHaveText('Account');
    await privateFill(page.getByLabel('New password', { exact: true }), user.nextPassword);
    await privateFill(page.getByLabel('Confirm password', { exact: true }), user.nextPassword);
    materialNetwork.expectOperations(
      { origin: f.auth.url, method: 'PUT', path: '/auth/v1/user', query: {}, count: 1 },
      { origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 },
    );
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Password updated.');
    await expect(page.getByRole('button', { name: 'Back to sign in', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 2 });
    await signIn(page, user.email, user.password);
    await expect(page.getByRole('status')).toHaveText('Email or password is incorrect. Check both and try again.');
    await signIn(page, user.email, user.nextPassword);
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: user.email, exact: true })).toBeVisible();
    materialNetwork.expectOperations(
      { origin: f.auth.url, method: 'GET', path: '/auth/v1/verify', query: { token: '[private]', type: 'recovery', redirect_to: origin + '/auth/callback' }, count: 1 },
      { origin, method: 'GET', path: '/auth/callback', query: { error: '[private]', error_code: '[private]', error_description: '[private]' }, count: 1 },
    );
    await privateNavigate(page, link);
    await expect(page.getByRole('dialog')).toContainText('This reset link can’t be used.');
    expect(new URL(page.url()).search.length + new URL(page.url()).hash.length).toBe(0);
    const evidence = JSON.stringify(materialNetwork.entries.map(entry => ({ url: entry.url.toString(), body: entry.body })));
    expect([user.password, user.nextPassword, link].some(secret => evidence.includes(secret)), 'Auth secret escaped collection-time redaction').toBe(false);
  } finally { await f.close(); }
});

test('unconfirmed sign-out immediately fences presentation and drafts across reload without replay', async ({ page, materialNetwork }) => {
  test.setTimeout(90000);
  const f = await fixture(page);
  try {
    const user = await f.auth.createAccount();
    await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 });
    await signIn(page, user.email, user.password);
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Must not return');
    await account(page, user.email);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(f.auth.url + '/auth/v1/logout*', async route => { await gate; await route.fulfill({ status: 503, json: { message: 'Controlled Auth outage' } }); });
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('.wp-sidebar .wp-account')).toHaveText('Account');
    release();
    await expect(page.getByRole('dialog')).toContainText('We couldn’t confirm sign-out.');
    await expect(page.getByRole('button', { name: 'Try sign-out again', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    await page.reload();
    await account(page);
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
  } finally { await f.close(); }
});


test('real refresh preserves the same-account draft; revoked refresh fences it without changing saved native work', async ({ page, materialNetwork }) => {
  test.setTimeout(90000);
  const f = await fixture(page, true, { jwtExpirySeconds: 180 });
  try {
    const user = await f.auth.createAccount();
    await f.application!.saveNative(user.id);
    const saved = await f.application!.snapshot();
    await page.clock.install({ time: Date.now() });
    await page.goto(origin); await account(page);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 });
    await signIn(page, user.email, user.password);
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep on successful refresh');
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/token' && new URL(response.url()).searchParams.get('grant_type') === 'refresh_token');
    await page.clock.fastForward(60000);
    expect((await refreshed).status()).toBe(200);
    await expect(page.getByRole('button', { name: user.email, exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep on successful refresh');
    await expect(page.getByRole('dialog')).toBeHidden();
    // Delete this exact disposable account through the real local admin API: next refresh is genuinely rejected.
    expect((await f.auth.request('admin/users/' + user.id, undefined, f.auth.serviceKey, 'DELETE')).status).toBe(200);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    const proactive = page.waitForResponse(response => new URL(response.url()).pathname === '/auth/v1/token' && new URL(response.url()).searchParams.get('grant_type') === 'refresh_token');
    await page.clock.fastForward(30000);
    expect((await proactive).status()).toBeGreaterThanOrEqual(400);
    // The application fences confirmed terminal rejection immediately, even while the SDK preserves its JWT.
    await expect(page.getByRole('dialog')).toContainText('Your session couldn’t be refreshed.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    expect(await f.application!.snapshot() === saved, 'Refresh/expiry changed saved native records').toBe(true);
  } finally { await f.close(); }
});

test('account form geometry, keyboard focus, local validation and reflow at approved main widths', async ({ page }, info) => {
  test.setTimeout(90000);
  const f = await fixture(page);
  try {
    for (const width of [1440, 390, 820, 821]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(origin);
      if (width <= 820) { await page.getByRole('button', { name: 'Menu', exact: true }).focus(); await page.keyboard.press('Enter'); }
      await page.getByRole('button', { name: 'Account', exact: true }).focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
      const modal = await page.locator('.wp-auth-modal').boundingBox();
      expect(modal?.width).toBe(Math.min(560, width - 48));
      expect(modal?.x).toBe((width - Math.min(560, width - 48)) / 2);
      await expect(page.getByLabel('Email', { exact: true })).toHaveCSS('height', '44px');
      await expect(page.getByLabel('Email', { exact: true })).toHaveCSS('border-radius', '8px');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await settleCapture(page);
      await page.screenshot({ path: info.outputPath('sign-in-' + width + '.png'), fullPage: true });
      await page.getByLabel('Email', { exact: true }).fill('alex');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText('Enter a valid email address.');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin); await account(page);
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].map(element => ({ className: element.className.toString(), right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })).filter(rect => rect.right > innerWidth + 1 && rect.width > 0));
    expect(overflow, '200% reflow exposes horizontally overflowing elements').toEqual([]);
  } finally { await f.close(); }
});

test('an invalid recovery callback in another tab stays actionable without storage-event feedback', async ({ page, context, materialNetwork }) => {
  test.setTimeout(90000);
  const f = await fixture(page);
  try {
    await page.goto(origin); await account(page);
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    const recovery = await context.newPage();
    materialNetwork.expectOperations({ origin, method: 'GET', path: '/auth/callback', query: {}, count: 1 });
    await recovery.goto(origin + '/auth/callback');
    await recovery.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(recovery.getByRole('dialog')).toContainText('This reset link can’t be used.');
    await expect(page.locator('.wp-sidebar .wp-account')).toHaveText('Account');
  } finally { await f.close(); }
});

test('public Auth configuration admits only complete public key/origin pairs', () => {
  expect(parsePublicAuthConfig(undefined, undefined)).toEqual({ kind: 'missing' });
  const key = 'sb_publishable_' + 'a'.repeat(24);
  for (const url of ['http://example.com', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com?secret=private', ' https://example.com']) expect(parsePublicAuthConfig(url, key).kind).toBe('invalid');
  for (const value of ['', 'sb_secret_' + 'a'.repeat(24), 'service_role', ' ' + key]) expect(parsePublicAuthConfig('https://example.com', value).kind).toBe('invalid');
  const jwt = (role: string) => [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ role })).toString('base64url'), 'synthetic-signature'].join('.');
  expect(parsePublicAuthConfig('http://127.0.0.1:55431', jwt('anon')).kind).toBe('configured');
  for (const role of ['service_role', 'authenticated', 'supabase_admin']) expect(parsePublicAuthConfig('https://example.com', jwt(role)).kind).toBe('invalid');
  expect(parsePublicAuthConfig('https://example.com', key)).toEqual({ kind: 'configured', url: 'https://example.com', publishableKey: key });
});

test('real standard account sign-in, persistence and local sign-out fence drafts', async ({ page, materialNetwork }) => {
  test.setTimeout(90000);
  const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount();
    await f.application!.saveNative(user.id);
    const saved = await f.application!.snapshot();
    await page.goto(origin);
    await account(page);
    // First red is a real old UI failure here, before entering any private data.
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 });
    await signIn(page, user.email, user.password);
    await expect(page.getByRole('dialog')).toBeHidden();
    await account(page, user.email);
    await expect(page.getByRole('dialog')).toContainText(user.email);
    await page.keyboard.press('Escape');
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Account-owned unsent draft');
    materialNetwork.expectOperations({ origin: f.application!.apiOrigin, method: 'GET', path: '/v1/library', query: {}, count: 1 });
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Library not available yet');
    await page.keyboard.press('Escape');
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    await page.reload();
    await expect(page.getByRole('button', { name: user.email, exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Draft fenced on sign-out');
    await account(page, user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
    expect(await f.application!.snapshot() === saved, 'Standard Auth/session actions changed saved native data').toBe(true);
  } finally { await f.close(); }
});
