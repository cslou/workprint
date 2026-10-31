import { test, expect } from '../material-network.js';
import { fixture, origin, account, signIn } from '../account-fixture.js';
import { watchWorkspace as observeMounts, workspaceMounts as mounts } from '../entry-observer.js';

test.use({ screenshot: 'off', trace: 'off', video: 'off' });
test('confirmed cross-tab exit and Back/Forward never remount private presentation or read native state', async ({ page, materialNetwork }) => {
  test.setTimeout(90000); const f = await fixture(page, true, {}, 'built'); const other = await page.context().newPage();
  try {
    const user = await f.auth.createAccount(); await f.application!.saveNative(user.id);
    const before = await f.application!.snapshot(); await observeMounts(page); await observeMounts(other);
    await page.goto(origin + '/sign-in');
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 3 });
    await signIn(page, user.email, user.password); await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await other.goto(origin + '/'); await expect(other.getByRole('link', { name: 'Open workspace', exact: true })).toBeVisible();
    await other.getByRole('link', { name: 'Open workspace', exact: true }).click(); await expect(other.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    const mounted = await mounts(other); expect(mounted).toBe(1);
    await account(page, user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('.wp-shell')).toHaveCount(0); await expect(page.getByText('Signed out.', { exact: true })).toBeVisible();
    await expect(other.locator('.wp-shell')).toHaveCount(0); await expect(other).toHaveURL(origin + '/sign-in?returnTo=%2Fapp');
    await expect(other.getByText('Your session has ended.', { exact: true })).toBeVisible(); expect(await mounts(other)).toBe(mounted);
    await other.goBack(); await expect(other).toHaveURL(origin + '/');
    await expect(other.locator('.wp-shell')).toHaveCount(0); expect(await mounts(other)).toBe(0);
    await expect(other.getByText('Signed out.', { exact: true })).toBeVisible();
    // Forward revisits the replaced sign-in entry, not the initiating tab’s public route.
    await other.goForward(); await expect(other).toHaveURL(origin + '/sign-in?returnTo=%2Fapp');
    await expect(other.getByText('Signed out.', { exact: true })).toBeVisible();
    await expect(other.locator('.wp-shell')).toHaveCount(0); expect(await mounts(other)).toBe(0);
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/'))).toHaveLength(0);
    expect(await f.application!.snapshot()).toBe(before);
  } finally { await f.close(); }
});

for (const width of [390, 820, 821]) test(`short-height card keyboard, labels, error recovery and public Back at ${width}`, async ({ page, materialNetwork }) => {
  test.setTimeout(60000); const f = await fixture(page, false, {}, 'built');
  try {
    await observeMounts(page); await page.setViewportSize({ width, height: 320 }); await page.goto(origin + '/sign-in');
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeFocused();
    const email = page.getByLabel('Email', { exact: true }), password = page.getByLabel('Password', { exact: true });
    await expect(email).toHaveAttribute('autocomplete', 'username'); await expect(password).toHaveAttribute('autocomplete', 'current-password');
    const controls = [email, password, page.getByRole('button', { name: 'Sign in', exact: true }), page.getByRole('button', { name: 'Forgot password?', exact: true }), page.getByRole('link', { name: 'Back to Workprint', exact: true })];
    for (const control of controls) {
      await page.keyboard.press('Tab'); await expect(control).toBeFocused();
      const box = await control.boundingBox(); expect(box).not.toBeNull(); expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(320);
    }
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Enter a valid email address.'); await expect(email).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password', exact: true })).toBeFocused();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Back to Workprint', exact: true }).click(); await expect(page).toHaveURL(origin + '/');
    await page.goBack(); await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    await expect(page.locator('.wp-shell')).toHaveCount(0); expect(await mounts(page)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/') || entry.url.pathname.startsWith('/auth/v1/'))).toHaveLength(0);
  } finally { await f.close(); }
});
