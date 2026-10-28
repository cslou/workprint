import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('buttons activate from keyboard; disabled actions stay inert and skipped', async ({ page }) => {
  const action = page.getByRole('button', { name: 'Activate' });
  await action.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(page.getByRole('status')).toHaveText('Activations: 2');
  const disabled = page.getByRole('button', { name: 'Disabled action' });
  await expect(disabled).toBeDisabled();
  await disabled.click({ force: true });
  await expect(page.getByRole('status')).toHaveText('Activations: 2');
  await action.focus();
  await page.keyboard.press('Tab');
  await expect(disabled).not.toBeFocused();
  await expect(action).toHaveCSS('outline-style', 'none');
  const quiet = page.getByRole('button', { name: 'Quiet action' });
  await quiet.focus();
  await expect(quiet).toHaveCSS('outline-style', 'none');
  await expect(quiet).toHaveCSS('text-decoration-line', 'underline');
  await page.keyboard.press('Shift+Tab');
  await expect(action).toBeFocused();
  await expect(action).toHaveCSS('outline-width', '2px');
});

test('labelled input retains edits; tabs use arrows without moving other scope', async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Search library' });
  await input.fill('Gallery');
  await page.getByRole('tab', { name: 'Script' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Assets' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Characters, places and props will appear here.');
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Videos' })).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveValue('Gallery');
});

test('dialog traps focus, dismisses with Escape and close, and returns to opener', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'View look A' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Vale · look A' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Next look' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(opener).toBeFocused();
});

test('popover dismisses outside and on Escape without a mutation', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Open details' });
  await opener.click();
  await expect(page.getByRole('dialog', { name: 'Details' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('button', { name: 'Activate', exact: true }).click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Details' })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Activations: 0');
});

test('viewer backdrop dismisses; a short viewport keeps every control reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 });
  const opener = page.getByRole('button', { name: 'View look A' });
  await opener.click();
  const next = page.getByRole('button', { name: 'Next look' });
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeInViewport();
  await page.mouse.click(5, 5);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});
