import { test, expect, loadSupport, signIn } from './fixtures.js';
import type * as ManualWork from '../../apps/api/test/support/manual-saved-work.js';

test('a Script edit saves, survives reload and appears in history; a lost save response retries into one version', async ({ page, backend }) => {
  const { prepareManualSavedWork } = await loadSupport<typeof ManualWork>('manual-saved-work');
  const accounts = await backend.accounts(2);
  const saved = await prepareManualSavedWork(backend.setup(accounts));
  await signIn(page, accounts[0]!, `/app?conversation=${saved.conversationId}`);
  const panel = page.getByRole('tabpanel');
  const editor = page.getByRole('textbox', { name: 'What happens' });
  const savePath = `/v1/conversations/${saved.conversationId}/versions`;
  const history = async () => (await backend.read<{ items: { revision: number }[] }>(accounts[0]!, `/v1/artifacts/${saved.script.artifactId}/versions`)).items.map(version => version.revision);

  await expect(panel).toContainText('Ada waits beside the station clock.');
  const edited = 'Ada pauses beneath the station clock, then turns toward the platform.';
  await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
  await editor.fill(edited);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(panel).toContainText(edited);

  await page.reload();
  await expect(panel).toContainText(edited);
  await page.locator('.wp-version-history summary').click();
  await expect(page.getByRole('button', { name: 'View version 1', exact: true })).toBeVisible();
  expect(await history()).toEqual([2, 1]);

  // The backend commits; only the response is lost on the way back to the browser.
  const lost = 'A save whose response is lost after commit.';
  await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
  await editor.fill(lost);
  let lostBody: unknown;
  await page.route(url => url.pathname === savePath, async route => {
    lostBody = route.request().postDataJSON();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  }, { times: 1 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Save could not be confirmed.');
  await expect(editor).toHaveValue(lost);

  const retry = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === savePath);
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  expect((await retry).postDataJSON()).toEqual(lostBody);
  await expect(editor).toHaveCount(0);
  await expect(panel).toContainText(lost);
  expect(await history()).toEqual([3, 2, 1]);
});
