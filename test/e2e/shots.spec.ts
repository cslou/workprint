import { test, expect, loadSupport, makeVideo, signIn } from './fixtures.js';
import type * as ShotWork from '../../apps/api/test/support/shot-choice-work.js';

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
  // The viewer opened from a Shot's row still offers the use, unlike one opened from the chat.
  await row(second).getByRole('button', { name: 'View Shot 1 version 2', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Use this version', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
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

  // A clip the agent makes is listed above the Shot rows, which still show.
  backend.provider.reset();
  await makeVideo(page, backend, { showInChat: false });
  await openVideos();
  const generated = page.locator('.wp-video-row[data-version-id]');
  await expect(generated).toHaveCount(1);
  expect(await generated.evaluate((clip, shot) => !!(clip.compareDocumentPosition(shot!) & Node.DOCUMENT_POSITION_FOLLOWING), await rows.first().elementHandle())).toBe(true);
});

test('saved video jobs show their status and failure after a reload, one unreadable card alone, and no Cancel', async ({ page, backend }) => {
  const { prepareShotChoiceWork, saveVideoJobs } = await loadSupport<typeof ShotWork>('shot-choice-work');
  const accounts = await backend.accounts(2);
  const saved = await prepareShotChoiceWork(backend.setup(accounts));
  const { interrupted: job, failed } = await saveVideoJobs(backend.setup(accounts), saved.accountId, saved.conversationId);
  // Nothing saves Shot jobs yet (no batches or proposals in the MVP), so two join the real list here:
  // one for a Shot in the storyboard and one for a Shot that isn't.
  const listPath = `/v1/conversations/${saved.conversationId}/generation-requests`;
  const shotJob = (id: string, shotId: string, status = 'running') => ({ id, batchId: 'batch-1', proposalId: 'proposal-1', purpose: 'shot_video', target: { shotId }, status, ...(status === 'failed' ? { failureReason: 'provider_error' } : {}), remote: {} });
  await page.route(url => url.pathname === listPath, async route => {
    const response = await route.fetch();
    const body = await response.json() as { items: unknown[]; nextCursor: string | null };
    await route.fulfill({ response, json: { ...body, items: [...body.items, shotJob('shot-job', 'platform-shot'), shotJob('failed-shot-job', 'platform-shot', 'failed'), shotJob('lost-job', 'missing-shot')] } });
  });
  const cards = page.locator('.wp-request-card');
  const check = async () => {
    await page.getByRole('tab', { name: 'Videos', exact: true }).click();
    await expect(cards).toHaveCount(7);
    const video = page.locator(`.wp-request-card[data-request-id="${job.id}"]`);
    await expect(video.locator('b')).toHaveText('Video request');
    await expect(video.locator('.wp-status')).toHaveText('Interrupted');
    await expect(video).toContainText('Stopped waiting. Ask the agent to resume it.');
    const shot = page.locator('.wp-request-card[data-request-id="shot-job"]');
    await expect(shot.locator('b')).toHaveText('Shot 1 · Video request');
    await expect(shot.locator('.wp-status')).toHaveText('Running');
    const copy = { outcome_unknown: 'MiniMax may have started this video, but its result is unknown.', check_refused: 'The video didn’t pass checks.', provider_error: 'MiniMax couldn’t make this video.' } as const;
    for (const [reason, line] of Object.entries(copy) as [keyof typeof copy, string][]) {
      const card = page.locator(`.wp-request-card[data-request-id="${failed[reason].id}"]`);
      await expect(card.locator('.wp-status')).toHaveText('Failed');
      await expect(card.locator('.wp-request-state')).toHaveText(line);
    }
    // MiniMax wording belongs to video jobs only.
    await expect(page.locator('.wp-request-card[data-request-id="failed-shot-job"] .wp-request-state')).toHaveCount(0);
    await expect(page.locator('.wp-request-card[data-request-id="lost-job"]')).toHaveText('This request can’t be shown');
    await expect(page.getByText('This request can’t be shown')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Cancel request' })).toHaveCount(0);
  };
  await signIn(page, accounts[0]!, `/app?conversation=${saved.conversationId}`);
  await check();
  await page.reload();
  await check();
});

test('a video the agent makes is listed in Generated videos without a reload, plays there, and stays above the job cards', async ({ page, backend }) => {
  test.slow();
  backend.provider.reset();
  const [account] = await backend.accounts(1);
  const reads: string[] = [];
  page.on('request', request => { if (/\/v1\/versions\/[^/]+\/media$/.test(new URL(request.url()).pathname)) reads.push(request.url()); });
  await signIn(page, account!);
  const videosTab = page.getByRole('tab', { name: 'Videos', exact: true });
  const panel = page.getByRole('tabpanel');
  // Generated rows carry their version; Shot rows carry their Shot.
  const clip = page.locator('.wp-video-row[data-version-id]');

  // A video with no clips and no Shots keeps the tab's own empty state.
  backend.provider.script({ text: ['Hello.'] });
  await page.getByRole('textbox', { name: 'Message' }).fill('Hi');
  await page.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect(page.getByRole('list', { name: 'New messages' }).getByText('Hello.', { exact: true })).toBeVisible({ timeout: 45_000 });
  await videosTab.click();
  await expect(panel.getByText('No videos yet.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Script', exact: true }).click();

  // Not shown in the chat, so no poster is read until the Videos tab shows it.
  await makeVideo(page, backend, { showInChat: false });
  await page.waitForTimeout(500);
  expect(reads).toHaveLength(0);
  // A refused poster read leaves the clip playable and says so.
  await page.route('**/v1/versions/*/media', route => route.fulfill({ status: 503, body: '' }), { times: 1 });
  await videosTab.click();
  await expect(clip.locator('.wp-video-title')).toHaveText('Video 1 · Version 1');
  // The fixture clip is 4.04 s long.
  await expect(clip.locator('.wp-video-metadata')).toHaveText('0:04 · The poster couldn’t be shown');
  await expect(panel.getByText('No videos yet.', { exact: true })).toHaveCount(0);
  // Seen, not chosen: the row has no status.
  await expect(clip.locator('.wp-status')).toHaveCount(0);
  expect(reads).toHaveLength(1);

  await clip.getByRole('button', { name: 'Play Video 1 · Version 1', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => ['playing', 'ended'].includes(await dialog.locator('.wp-clip-surface').getAttribute('data-player-status') ?? '')
    || await dialog.locator('.wp-clip-media').evaluate(node => (node as HTMLVideoElement).currentTime > 0), { timeout: 10_000 }).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Use this version', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await videosTab.click();
  await expect(clip).toHaveCount(1);
  await expect(clip.locator('.wp-video-title')).toHaveText('Video 1 · Version 1');
  await expect(clip.locator('.wp-video-metadata')).toHaveText('0:04');
  await expect.poll(() => clip.locator('img').evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // The list sits above the job cards, and the job that made the clip is one of them.
  const card = page.locator('.wp-request-card').filter({ hasText: 'Video request' });
  await expect(card).toHaveCount(1);
  expect(await clip.evaluate((row, other) => !!(row.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING), await card.elementHandle())).toBe(true);
});
