import { test, expect, loadSupport, makeVideo, signIn } from './fixtures.js';
import type { Locator } from '@playwright/test';
import type * as ShotWork from '../../apps/api/test/support/shot-choice-work.js';
import type * as MetaImages from '../../apps/api/test/support/meta-image-fake.js';

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
  // A storyboard saved before Shots had a length shows none in its summary, and says so on its board.
  await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  await expect(page.locator('.wp-storyboard-shot[data-shot-id="platform-shot"] summary small')).toHaveText(/^\d+ panels?$/);
  await page.getByRole('tabpanel').getByRole('button', { name: 'View storyboard', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.wp-shot-length-text').first()).toHaveText('Length · not set');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

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
  // Export doesn't exist yet (B-009), so the tab offers none.
  await expect(panel.getByRole('button', { name: /^Export/ })).toHaveCount(0);
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

test('the agent\'s storyboard shows each Shot\'s panel images as they are made, its board shows the Shot\'s text, a panel opens its image, and its Shot video plays from its poster', async ({ page, backend }) => {
  test.slow();
  const { provider, meta, minimax } = backend;
  provider.reset(); meta.reset(); minimax.reset();
  const [account] = await backend.accounts(1);
  const box = page.getByRole('textbox', { name: 'Message' });
  const turn = async (call: { name: string; args: Record<string, unknown> }, ask: string, done: string) => {
    provider.script({ toolCalls: [call] }, { text: [`${ask} done.`] });
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    await box.fill(ask);
    await box.press('Enter');
    const reply = page.getByRole('list', { name: 'New messages' }).getByRole('listitem', { name: 'Assistant message' }).last();
    await expect(reply.getByText(done, { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(reply.getByText(`${ask} done.`, { exact: true })).toBeVisible();
  };
  await signIn(page, account!);
  const script = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: ['Mara'], script: [{ action: 'Mara finds the key.' }] }] };
  await turn({ name: 'update-script', args: { baseVersionId: null, script, subjects: [{ id: '', kind: 'character', name: 'Mara' }, { id: '', kind: 'place', name: 'The Gallery' }] } }, 'Write the script', 'Saved version 1');
  const views = ['Full-body front', 'Three-quarter', 'Face close-up'];
  // MiniMax takes images of 256 pixels or more on their short side, so the sheet views and panels are video-sized.
  const { testPng } = await loadSupport<typeof MetaImages>('meta-image-fake');
  meta.script(...views.map((_, index) => ({ images: [testPng({ width: 512, height: 288, seed: 20 + index })] })));
  await turn({ name: 'generate-sheet', args: { subject: 'mara', description: 'A courier in a long grey coat.', continuityNotes: ['Keep the grey coat.'], views: views.map(view => ({ view, prompt: `${view}, standing still` })) } }, 'Make Mara\'s sheet', 'Saved Mara · Version 1');
  const storyboard = { base: '', shots: [{ intent: 'Mara finds the key.', durationS: 6, framing: 'medium', action: 'Mara lifts the key from the bench.',
    dialogue: [{ character: 'Mara', text: 'There you are.' }, { character: 'Narrator', text: 'She had looked for years.', delivery: 'voice_over' }],
    cameraNote: 'A slow push-in.', references: [{ subjectId: 'mara', role: 'identity', purpose: 'Her face.' }, { subjectId: 'the-gallery', role: 'environment', purpose: 'The room.' }],
    panels: [{ description: 'Mara reaches for the key.' }, { description: 'Mara holds the key up.' }] }] };
  await turn({ name: 'save-storyboard', args: storyboard }, 'Plan the storyboard', 'Saved Storyboard · Version 1');
  const videoId = new URL(page.url()).searchParams.get('conversation')!;
  const { storyboard: { shots: [shot] } } = await backend.read<{ storyboard: { shots: { shotId: string; panels: { panelId: string; order: number }[] }[] } }>(account!, `/v1/conversations/${videoId}/workspace`);
  const [first, second] = [...shot!.panels].sort((a, b) => a.order - b.order);
  meta.script({ images: [testPng({ width: 512, height: 288, seed: 11 })] }, { images: [testPng({ width: 512, height: 288, seed: 12 })] });

  const panel = page.getByRole('tabpanel');
  const row = panel.locator(`.wp-storyboard-shot[data-shot-id="${shot!.shotId}"]`);
  const image = (n: number) => row.getByRole('img', { name: `Shot 1 · Panel 1.${n}`, exact: true });
  await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  // Before any panel is made, both are planned.
  await expect(row.getByText('Planned panel', { exact: true })).toHaveCount(2);
  // Each panel's image appears after its tool line, without a reload.
  await turn({ name: 'generate-panel', args: { shot: shot!.shotId, panel: first!.panelId, prompt: 'Preserve her coat.', images: [] } }, 'Make panel 1', 'Saved Shot 1 · Panel 1.1 · Version 1');
  await expect(row.getByText('Planned panel', { exact: true })).toHaveCount(1);
  await expect.poll(() => image(1).evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await turn({ name: 'generate-panel', args: { shot: shot!.shotId, panel: second!.panelId, prompt: 'Change only her hands.', images: [] } }, 'Make panel 2', 'Saved Shot 1 · Panel 1.2 · Version 1');
  await turn({ name: 'generate-shot', args: { shot: shot!.shotId, prompt: 'She lifts the key into the light.' } }, 'Make the Shot', 'Saved Shot 1 · Video · Version 1');
  // The clip is made from Mara's first sheet view, both panels, then her next view (the Gallery has no sheet), at
  // 16:9 for the Shot's 6 s.
  const sent = () => minimax.requests.find(request => request.method === 'POST')!.body as { ratio: string; duration: number; content: { type: string; role?: string; text?: string }[] };
  expect([sent().ratio, sent().duration, sent().content.map(item => item.role ?? item.type)]).toEqual(['16:9', 6, ['text', ...Array(4).fill('reference_image')]]);
  expect(sent().content[0]!.text).toMatch(/^Image 1: Mara, A courier in a long grey coat\. Keep Mara's face, hair, build and clothing as shown\.\nImage 2: the storyboard panel for this Shot\./);

  const shown = (locator: Locator) => expect.poll(() => locator.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // Selecting a panel's image opens the viewer on its current version, with that image shown, and closes back to `inside`.
  const opens = async (inside: Locator, expected: string) => {
    await inside.getByRole('button', { name: 'Open Shot 1 · Panel 1.1', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: /^Panel 1\.1 · Version / });
    await expect(viewer.locator('.wp-panel-version')).toHaveAttribute('data-displayed-version-id', expected);
    await shown(viewer.locator('.wp-panel-version img'));
    await viewer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(viewer).toHaveCount(0);
  };
  // The board is the detailed view: each Shot's text and its panel images; a board panel opens the same viewer.
  const boardHolds = async (intent: string, seconds: number) => {
    await panel.getByRole('button', { name: 'View storyboard', exact: true }).click();
    const board = page.getByRole('dialog');
    const section = board.locator(`.wp-board-shot[data-shot-id="${shot!.shotId}"]`);
    await expect(section.locator('header b')).toHaveText(intent);
    await expect(section.locator('.wp-shot-length-text')).toHaveText(`Length · ${seconds} s`);
    await expect(section.locator('.wp-storyboard-action')).toHaveText('Mara lifts the key from the bench.');
    await expect(section.locator('.wp-storyboard-dialogue li b')).toHaveText(['Mara', 'Narration']);
    await expect(section.locator('.wp-storyboard-dialogue li q')).toHaveText(['There you are.', 'She had looked for years.']);
    await expect(section.locator('.wp-storyboard-camera')).toHaveText('A slow push-in.');
    await expect(section.locator('.wp-storyboard-subjects')).toHaveText('Mara · The Gallery');
    for (const n of [1, 2]) await shown(section.getByRole('img', { name: `Shot 1 · Panel 1.${n}`, exact: true }));
    await opens(section, (await image(1).getAttribute('data-displayed-version-id'))!);
    await expect(board).toBeVisible();
    await board.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(board).toHaveCount(0);
  };

  const holds = async () => {
    await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
    // The tab is the summary: the intent, framing, length, panel count and panel images, without the Shot's text.
    await expect(row.locator('summary')).toContainText('Mara finds the key.');
    await expect(row.locator('summary small')).toHaveText('medium · 6 s · 2 panels');
    await expect(row.locator('.wp-storyboard-action, .wp-storyboard-dialogue, .wp-storyboard-camera')).toHaveCount(0);
    for (const n of [1, 2]) await shown(image(n));
    await expect(row.getByText('Planned panel', { exact: true })).toHaveCount(0);
    await expect(panel.locator('.wp-status')).toHaveCount(0);
    await opens(row, (await image(1).getAttribute('data-displayed-version-id'))!);
    await boardHolds('Mara finds the key.', 6);

    // The Shot row has the assistant's draft, with no status, and it plays; it isn't a Generated video.
    await page.getByRole('tab', { name: 'Videos', exact: true }).click();
    const video = panel.locator(`.wp-video-row[data-shot-id="${shot!.shotId}"]`);
    await expect(video).toHaveCount(1);
    await expect(panel.locator('.wp-video-row[data-version-id]')).toHaveCount(0);
    await expect(video.locator('.wp-status')).toHaveCount(0);
    // Its poster is the play button, and the row says which version it is.
    await shown(video.locator('.wp-video-poster img'));
    await expect(video.locator('.wp-video-metadata')).toHaveText(/^Version 1 · \d+:\d{2}$/);
    await video.getByRole('button', { name: 'View Shot 1 version 1', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(async () => ['playing', 'ended'].includes(await dialog.locator('.wp-clip-surface').getAttribute('data-player-status') ?? '')
      || await dialog.locator('.wp-clip-media').evaluate(node => (node as HTMLVideoElement).currentTime > 0), { timeout: 10_000 }).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Assets names each subject's Shots and has no row for a panel image.
    await page.getByRole('tab', { name: 'Assets', exact: true }).click();
    await expect(panel.locator('.wp-subject-entry')).toHaveText([/^Mara\s*Character · Shot 1$/, /^The Gallery\s*Place · Shot 1\s*Empty$/]);
    await expect(panel.getByRole('region', { name: 'Mara', exact: true }).locator('.wp-asset-row')).toHaveCount(1);
    await expect(panel.getByRole('region', { name: 'Other', exact: true })).toHaveCount(0);
  };
  await holds();
  await page.reload();
  await holds();

  // The panel's image is its current version: the agent's latest, until a person chooses one, which then stays.
  type Read = { storyboard: { shots: { panels: { panelId: string; candidateImageVersions: { id: string; revision: number }[] }[] }[] } };
  const version = async (revision: number) => (await backend.read<Read>(account!, `/v1/conversations/${videoId}/workspace`)).storyboard.shots[0]!.panels
    .find(item => item.panelId === first!.panelId)!.candidateImageVersions.find(candidate => candidate.revision === revision)!.id;
  const remake = async (revision: number, seed: number) => {
    meta.script({ images: [testPng({ width: 512, height: 288, seed })] });
    await turn({ name: 'generate-panel', args: { shot: shot!.shotId, panel: first!.panelId, prompt: 'Preserve her coat; warmer light.', images: [] } }, `Remake panel 1 (${revision})`, `Saved Shot 1 · Panel 1.1 · Version ${revision}`);
  };
  await remake(2, 13);
  const v2 = await version(2);
  await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  await expect(image(1)).toHaveAttribute('data-displayed-version-id', v2);
  await row.getByRole('button', { name: 'View Panel 1.1 version 2', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.wp-panel-version')).toHaveAttribute('data-displayed-version-id', v2);
  await shown(page.getByRole('dialog').locator('.wp-panel-version img'));
  await page.getByRole('dialog').getByRole('button', { name: 'Use this version', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('This exact version is now used in this conversation.');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await remake(3, 14);
  const v3 = await version(3);
  expect(v3).not.toBe(v2);
  // The agent's version 3 is listed, but the person's version 2 is still the one shown, before and after a reload.
  await expect(row.getByRole('button', { name: 'View Panel 1.1 version 3', exact: true })).toBeVisible();
  await expect(image(1)).toHaveAttribute('data-displayed-version-id', v2);
  await expect.poll(() => image(1).evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // The panel's image opens the person's version 2, not the agent's newer version 3.
  await opens(row, v2);
  // After a reload (the chat already read version 3 once), a version whose image can't be read says so in the viewer,
  // and can still be chosen.
  await page.route(`**/v1/versions/${v3}/media`, route => route.fulfill({ status: 503, body: '' }));
  await page.reload();
  await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  await expect(image(1)).toHaveAttribute('data-displayed-version-id', v2);
  await opens(row, v2);
  await row.getByRole('button', { name: 'View Panel 1.1 version 3', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.wp-panel-version')).toContainText('This image couldn’t be shown');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Use this version', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.unroute(`**/v1/versions/${v3}/media`);

  // A person's planning edit still saves from the board, and the Shot keeps the agent's text.
  await panel.getByRole('button', { name: 'View storyboard', exact: true }).click();
  const board = page.getByRole('dialog');
  await board.getByRole('button', { name: 'Edit Shot intent', exact: true }).click();
  await board.getByRole('textbox', { name: 'Shot intent' }).fill('Mara finds the key at last.');
  await board.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(board.getByRole('textbox', { name: 'Shot intent' })).toHaveCount(0);
  // A person changes the Shot's length there too: a length out of range saves nothing, and a whole number from 4 to
  // 15 saves.
  await board.getByRole('button', { name: 'Edit Shot length', exact: true }).click();
  const seconds = board.getByRole('spinbutton', { name: 'Length in seconds' });
  await expect(seconds).toHaveValue('6');
  for (const typed of ['16', '6.5']) {
    await seconds.fill(typed);
    await board.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(board.locator('.wp-shot-length').getByRole('status')).toHaveText('Enter a whole number of seconds from 4 to 15.');
  }
  await seconds.fill('8');
  await board.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(seconds).toHaveCount(0);
  await expect(board.locator('.wp-shot-length-text')).toHaveText('Length · 8 s');
  await page.keyboard.press('Escape');
  await expect(board).toHaveCount(0);
  await expect(row.locator('summary b')).toHaveText('Mara finds the key at last.');
  await expect(row.locator('summary small')).toHaveText('medium · 8 s · 2 panels');
  await page.reload();
  await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  await expect(row.locator('summary b')).toHaveText('Mara finds the key at last.');
  await expect(row.locator('summary small')).toHaveText('medium · 8 s · 2 panels');
  await expect(image(1)).toHaveAttribute('data-displayed-version-id', v2);
  await boardHolds('Mara finds the key at last.', 8);
  // The next Shot video runs for the length the person set.
  minimax.reset();
  await turn({ name: 'generate-shot', args: { shot: shot!.shotId, prompt: 'She lifts the key into the light.' } }, 'Make the Shot again', 'Saved Shot 1 · Video · Version 2');
  expect(sent().duration).toBe(8);

  // Joining is free: Shot 1's video and a generated clip join into one draft video, shown in the chat and listed in
  // Generated videos. Version 1 of the Shot's video is no longer used once Version 2 took its draft use.
  await turn({ name: 'generate-video', args: { prompt: 'The gallery at dawn.' } }, 'Make a gallery clip', 'Saved Video 1 · Version 1');
  const { storyboard: { shots: [made] }, generatedVideos } = await backend.read<{ storyboard: { shots: { candidateVideoVersions?: { id: string }[] }[] }; generatedVideos: { version: { id: string } }[] }>(account!, `/v1/conversations/${videoId}/workspace`);
  const clips = [...made!.candidateVideoVersions!.map(version => version.id), ...generatedVideos.map(item => item.version.id)];
  expect(clips).toHaveLength(2);
  const shotVideos = async () => (await backend.read<{ storyboard: { shots: { chosenVideoVersionId: string | null; candidateVideoVersions?: { id: string }[] }[] } }>(account!, `/v1/conversations/${videoId}/workspace`)).storyboard.shots.map(item => [item.chosenVideoVersionId, item.candidateVideoVersions?.map(version => version.id)]);
  const before = await shotVideos();
  await turn({ name: 'join-videos', args: { clips, showInChat: true } }, 'Join the Shot videos', 'Joined 2 clips');
  // The Shot's own video, its use and its choice are unchanged.
  expect(await shotVideos()).toEqual(before);
  const reply = page.getByRole('list', { name: 'New messages' }).getByRole('listitem', { name: 'Assistant message' }).last();
  await shown(reply.locator('img[alt="Video 2 · Version 1"]'));
  await page.getByRole('tab', { name: 'Videos', exact: true }).click();
  const joined = panel.locator('.wp-video-row[data-version-id]').filter({ hasText: 'Video 2 · Version 1' });
  await expect(joined).toHaveCount(1);
  // The fake MiniMax's clip is 4.04 s, so the two join to 8.08 s.
  await expect(joined.locator('.wp-video-metadata')).toHaveText('0:08');
  await joined.getByRole('button', { name: 'Play Video 2 · Version 1', exact: true }).click();
  const viewer = page.getByRole('dialog');
  await expect(viewer.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
  await viewer.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => ['playing', 'ended'].includes(await viewer.locator('.wp-clip-surface').getAttribute('data-player-status') ?? '')
    || await viewer.locator('.wp-clip-media').evaluate(node => (node as HTMLVideoElement).currentTime > 0), { timeout: 10_000 }).toBe(true);
  await page.keyboard.press('Escape');
});
