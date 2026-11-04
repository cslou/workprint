import { test, expect, signIn } from './fixtures.js';

test('sign in keeps the email after a wrong password, and sign-out closes the workspace', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make room for your next idea.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Workprint', exact: true })).toHaveCSS('font-family', /^"?Italiana"?,/);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await page.getByLabel('Email', { exact: true }).fill(account!.email);
  await page.getByLabel('Password', { exact: true }).fill('Not-the-account-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Email or password is incorrect. Check both and try again.');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(account!.email);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.locator('.wp-shell')).toHaveCount(0);

  await page.getByLabel('Password', { exact: true }).fill(account!.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/app');
  await expect(page.getByRole('button', { name: 'New video', exact: true })).toBeVisible();
  // The wordmark is the word alone, in Italiana served with the app, thickened by a thin outline (the face has one weight).
  const brand = page.locator('.wp-brand');
  await expect(brand).toHaveText('Workprint');
  await expect(brand).toHaveCSS('font-family', /^"?Italiana"?,/);
  await expect(brand).toHaveCSS('-webkit-text-stroke-width', '0.5px');
  await expect.poll(() => page.evaluate(() => [...document.fonts].some(face => face.family.replace(/"/g, '') === 'Italiana' && face.status === 'loaded'))).toBe(true);
  // The opening composer: a bare "+" to attach, and no upload limits line.
  await expect(page.getByRole('button', { name: 'Attach a file', exact: true })).toHaveText('+');
  await expect(page.getByText(/JPEG or PNG only/)).toHaveCount(0);

  await page.getByRole('button', { name: account!.email, exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.wp-shell')).toHaveCount(0);
  await page.goto('/app');
  await expect(page).toHaveURL('/');
  await expect(page.locator('.wp-shell')).toHaveCount(0);
});

test('password recovery sets a new password that signs in', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(account!.email);
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(page.getByText('Check your email.', { exact: true })).toBeVisible();

  const link = await backend.app.auth.recoveryLink(account!.email);
  // The callback strips the one-time code from the address before anything renders.
  await page.goto(link);
  await expect(page).toHaveURL('/auth/callback');
  await page.getByLabel('New password', { exact: true }).fill(account!.nextPassword);
  await page.getByLabel('Confirm password', { exact: true }).fill(account!.nextPassword);
  await page.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(page.getByText('Password updated.', { exact: true })).toBeVisible();
  await expect(page.locator('.wp-shell')).toHaveCount(0);

  await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
  await signIn(page, { ...account!, password: account!.nextPassword });
  await expect(page.getByRole('button', { name: 'New video', exact: true })).toBeVisible();
});
