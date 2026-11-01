import { test, expect, signIn } from './fixtures.js';

test('Recents pages through saved conversations, opens one and restores it after reload', async ({ page, backend }) => {
  const [account, other] = await backend.accounts(2);
  const saved: { id: string }[] = [];
  for (let i = 0; i < 8; i++) saved.push(await backend.app.saveNative(account!.id, [{ role: 'user', text: `Saved text ${i}` }], `Saved scene ${i}`));
  await backend.app.saveNative(other!.id, [{ role: 'user', text: 'Another account' }], 'Another account title');
  await signIn(page, account!);

  await page.getByRole('button', { name: 'Recents', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Videos 1–6', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByText('Videos 7–8', { exact: true })).toBeVisible();
  await expect(page.getByText('Another account title', { exact: true })).toHaveCount(0);

  // Recents lists newest first, so the second page holds the two oldest conversations.
  await dialog.getByRole('button', { name: 'Saved scene 1', exact: true }).click();
  await expect(page).toHaveURL(`/app?conversation=${saved[1]!.id}`);
  await expect(page.getByRole('heading', { name: 'Saved scene 1', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Saved text 1');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved scene 1', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Saved text 1');
});
