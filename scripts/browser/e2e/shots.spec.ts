import { test, expect, loadSupport, signIn } from './fixtures.js';
import type * as ShotWork from '../../../apps/api/test/support/shot-choice-work.js';

test('a Shot video choice survives reload and can be changed to another exact version', async ({ page, backend }) => {
  const { prepareShotChoiceWork } = await loadSupport<typeof ShotWork>('shot-choice-work');
  const accounts = await backend.accounts(2);
  const saved = await prepareShotChoiceWork(backend.setup(accounts));
  const [first, second] = saved.candidates;
  const rows = page.locator('.wp-video-row[data-shot-id="platform-shot"]');
  const row = (version: { revision: number }) => rows.filter({ hasText: `Version ${version.revision}` });
  const chosen = page.locator('.wp-video-row').filter({ has: page.getByText('Chosen', { exact: true }) });
  const openVideos = async () => {
    await page.getByRole('tab', { name: 'Videos', exact: true }).click();
    await expect(rows).toHaveCount(2);
  };
  const choose = async (version: { revision: number }) => {
    await row(version).getByRole('button', { name: 'Use this version', exact: true }).click();
    await expect(row(version).getByRole('status')).toHaveText('This exact version is now used in this conversation.');
  };
  const persisted = async () => (await backend.read<{ storyboard: { shots: { shotId: string; chosenVideoVersionId: string | null }[] } }>(accounts[0]!, `/v1/conversations/${saved.conversationId}/workspace`)).storyboard.shots.map(shot => [shot.shotId, shot.chosenVideoVersionId]);

  await signIn(page, accounts[0]!, `/app?conversation=${saved.conversationId}`);
  await openVideos();
  // Candidates are shown, but nothing is chosen until the person picks one.
  await expect(chosen).toHaveCount(0);
  await choose(second);

  await page.reload();
  await openVideos();
  await expect(chosen).toHaveCount(1);
  await expect(chosen).toContainText('Version 2');
  expect(await persisted()).toEqual([['platform-shot', second.id], ['arrival-shot', null]]);

  await choose(first);
  await page.reload();
  await openVideos();
  await expect(chosen).toHaveCount(1);
  await expect(chosen).toContainText('Version 1');
  expect(await persisted()).toEqual([['platform-shot', first.id], ['arrival-shot', null]]);
});
