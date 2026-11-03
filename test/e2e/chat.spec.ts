import type { Page } from '@playwright/test';
import { test, expect, makeVideo, signIn } from './fixtures.js';

const sendPath = '/api/agents/assistant/send-message';
const notSent = 'Your message wasn’t sent. It’s still here, so you can try again.';
const unconfirmed = 'We couldn’t confirm your message was sent.';

test.beforeEach(({ backend }) => backend.provider.reset());

/** Counts send requests the page makes, so a test can prove nothing was resent. */
function sends(page: Page) {
  let count = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === sendPath) count++; });
  return () => count;
}
const message = (page: Page) => page.getByRole('textbox', { name: 'Message' });
const live = (page: Page) => page.getByRole('list', { name: 'New messages' });
const saved = (page: Page) => page.getByRole('list', { name: 'Saved messages' });
const recents = (page: Page) => page.getByRole('list', { name: 'Recent videos' }).first();
const working = (page: Page) => page.getByText('Working…', { exact: true });
const videoId = (page: Page) => new URL(page.url()).searchParams.get('conversation');

test('a new video streams its first reply, then reload shows the saved conversation in Recents', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ text: ['Hello', ' there'], hold: 'mid' });
  await signIn(page, account!);
  await message(page).fill('Hi');
  await message(page).press('Enter');

  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Hello');
  await expect(working(page)).toBeVisible();
  // While the agent works, Stop takes Send's place (demo-02).
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);
  await expect(message(page)).toHaveValue('');
  await expect(message(page)).toBeFocused();
  expect(videoId(page)).toMatch(/^[0-9a-f-]{36}$/);
  provider.release();
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Hello there');
  await expect(working(page)).toHaveCount(0);
  await expect(recents(page).getByRole('button')).toHaveCount(1);
  expect(provider.requests).toHaveLength(1);
  // The conversation's composer has the same bare "+" as the opening one.
  await expect(page.getByRole('button', { name: 'Attach a file' })).toHaveText('+');

  const video = videoId(page);
  await page.reload();
  await expect(saved(page).getByRole('listitem')).toHaveText(['Hi', 'Hello there']);
  expect(videoId(page)).toBe(video);
  await expect(recents(page).getByRole('button')).toHaveCount(1);
});

test('a pending dot holds the reply\'s place, and the thread follows the newest text unless scrolled up', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  const thread = page.getByLabel('Conversation history');
  const long = (word: string) => ` ${word}`.repeat(1500);
  const position = () => thread.evaluate(element => ({ top: element.scrollTop, bottom: element.scrollHeight - element.scrollTop - element.clientHeight }));
  const atEnd = () => expect.poll(async () => (await position()).bottom).toBeLessThanOrEqual(2);
  /** Scrolls the hovered thread by mouse wheel and waits for the move to land. */
  const wheel = async (delta: number) => {
    const { top } = await position();
    await page.mouse.wheel(0, delta);
    await expect.poll(async () => (await position()).top).not.toBe(top);
  };
  provider.script({ text: ['Opening', long('lake')], hold: 'before' });
  await signIn(page, account!);
  await message(page).fill('Write a long answer');
  await message(page).press('Enter');
  await expect(live(page).locator('.wp-reply-pending')).toBeVisible();
  await expect(working(page)).toBeVisible();
  // The page shows the dot before the request reaches the model, so wait for the hold before releasing it.
  await provider.held();
  provider.release();
  await expect(working(page)).toHaveCount(0);
  await expect(live(page).locator('.wp-pending-dot')).toHaveCount(0);
  await atEnd();

  // Back at the end mid-reply, after a small scroll up, the thread follows again.
  provider.script({ text: ['Second', long('shore')], hold: 'mid' });
  await message(page).fill('And another');
  await message(page).press('Enter');
  let reply = live(page).getByRole('listitem', { name: 'Assistant message' }).last();
  await expect(reply).toHaveText('Second');
  await atEnd();
  await thread.hover();
  await wheel(-10);
  await wheel(1000);
  provider.release();
  await expect(reply).toContainText('shore');
  await expect(working(page)).toHaveCount(0);
  await atEnd();

  // A scroll up of less than a line mid-reply leaves the end, and the rest streams in below.
  provider.script({ text: ['Third', long('reed')], hold: 'mid' });
  await message(page).fill('Once more');
  await message(page).press('Enter');
  reply = live(page).getByRole('listitem', { name: 'Assistant message' }).last();
  await expect(reply).toHaveText('Third');
  await atEnd();
  const { top } = await position();
  await wheel(-10);
  provider.release();
  await expect(reply).toContainText('reed');
  await expect(working(page)).toHaveCount(0);
  expect((await position()).top).toBe(top - 10);

  // A new send returns to the newest text.
  provider.script({ text: ['Fourth'] });
  await message(page).fill('The last one');
  await message(page).press('Enter');
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' }).last()).toHaveText('Fourth');
  await atEnd();
});

test('the first reply names the video: Recents and the history heading show the title, and both keep it after reload', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.scriptTitle({ text: ['Night swim'] });
  provider.script({ text: ['A lovely idea'], hold: 'before' });
  await signIn(page, account!);
  await message(page).fill('A short film about a night swim');
  await message(page).press('Enter');
  await expect(working(page)).toBeVisible();
  const video = videoId(page)!;
  // The title is named from the accepted message while the reply runs; let it land before the reply ends.
  await expect.poll(async () => (await backend.read<{ title?: string }>(account!, `/memory/threads/${video}`)).title).toBe('Night swim');
  provider.release();
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('A lovely idea');
  await expect(recents(page).getByRole('button', { name: 'Night swim', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Night swim', exact: true })).toBeAttached();
  expect(provider.titleRequests).toHaveLength(1);
  expect(provider.requests).toHaveLength(1);

  await page.reload();
  await expect(saved(page).getByRole('listitem')).toHaveText(['A short film about a night swim', 'A lovely idea']);
  await expect(recents(page).getByRole('button', { name: 'Night swim', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Night swim', exact: true })).toBeAttached();
});

/** Lets any send a page might still make arrive before a test asserts there was none. */
const settle = (page: Page) => page.waitForTimeout(500);

test('Shift+Enter adds a line and whitespace-only input is never sent', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  await signIn(page, account!);
  const sent = sends(page);
  await message(page).fill('first');
  await message(page).press('Shift+Enter');
  await message(page).pressSequentially('second');
  await expect(message(page)).toHaveValue('first\nsecond');
  await message(page).fill('   \n  ');
  await message(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await expect(message(page)).toHaveValue('   \n  ');
  await settle(page);
  expect(sent()).toBe(0);
  expect(backend.provider.requests).toHaveLength(0);
});

test('Send waits while saved history is loading or unavailable', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const earlier = await backend.app.saveNative(account!.id, [{ role: 'user', text: 'Saved before' }], 'Saved video');
  await signIn(page, account!);
  const sent = sends(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/memory/threads/${earlier.id}/messages**`, async route => { await held; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'integration_failure', message: 'Native storage unavailable' } }) }); });
  await recents(page).getByRole('button', { name: 'Saved video', exact: true }).click();
  await message(page).fill('Not yet');
  await message(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  release();
  await expect(page.getByText('This conversation couldn’t be loaded. Check your connection and try again.', { exact: true })).toBeVisible();
  await message(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await settle(page);
  expect(sent()).toBe(0);
  await expect(message(page)).toHaveValue('Not yet');
});

test('a failed first send keeps the draft and adds nothing to Recents', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  await signIn(page, account!);
  await page.route(`**${sendPath}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'integration_failure', message: 'Native turns unavailable' } }) }), { times: 1 });
  await message(page).fill('Not this time');
  await message(page).press('Enter');
  await expect(page.getByText(notSent, { exact: true })).toBeVisible();
  await expect(message(page)).toHaveValue('Not this time');
  expect(videoId(page)).toBeNull();
  await page.reload();
  await expect(page.getByText('No videos yet.', { exact: true }).first()).toBeVisible();
  expect(backend.provider.requests).toHaveLength(0);
});

test('a lost acknowledgment is never resent; the re-read finds the message once', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  backend.provider.script({ text: ['Got it'] });
  await signIn(page, account!);
  const sent = sends(page);
  // The server accepts the send; the page never sees the answer.
  await page.route(`**${sendPath}`, async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await message(page).fill('Did this arrive?');
  await message(page).press('Enter');
  await expect(saved(page).getByText('Did this arrive?', { exact: true })).toHaveCount(1);
  await expect(page.getByText(unconfirmed, { exact: true })).toHaveCount(0);
  await expect(message(page)).toHaveValue('');
  await expect(recents(page).getByRole('button')).toHaveCount(1);
  expect(sent()).toBe(1);
});

test('an unconfirmed send waits: Check again only reads, and only Send anyway sends', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  backend.provider.script({ text: ['Arrived'] });
  await signIn(page, account!);
  const sent = sends(page);
  // The send never reaches the server, so the re-read finds nothing.
  await page.route(`**${sendPath}`, route => route.abort('failed'), { times: 1 });
  await message(page).fill('Lost on the way');
  await message(page).press('Enter');
  await expect(page.getByText(unconfirmed, { exact: true })).toBeVisible();
  await expect(message(page)).toHaveValue('Lost on the way');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(page.getByText(unconfirmed, { exact: true })).toBeVisible();
  await settle(page);
  expect(sent()).toBe(1);
  expect(backend.provider.requests).toHaveLength(0);

  await page.getByRole('button', { name: 'Send anyway', exact: true }).click();
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Arrived');
  expect(sent()).toBe(2);
  await expect(message(page)).toHaveValue('');
});

test('a reply that fails mid-stream offers Retry, which makes exactly one more attempt', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ text: ['Partial'], incomplete: true }, { text: ['Recovered'] });
  await signIn(page, account!);
  await message(page).fill('Try this');
  await message(page).press('Enter');
  await expect(page.getByText('Something went wrong and this reply didn’t finish.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' }).last()).toHaveText('Recovered');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
  expect(provider.requests).toHaveLength(2);

  await page.reload();
  await expect(saved(page).getByRole('listitem').last()).toHaveText('Recovered');
  expect(provider.requests).toHaveLength(2);
});

test('late reply text never renders in another video or another account', async ({ page, backend }) => {
  const [account, other] = await backend.accounts(2);
  const { provider } = backend;
  const earlier = await backend.app.saveNative(account!.id, [{ role: 'user', text: 'An earlier video' }], 'Earlier video');
  await signIn(page, account!);

  provider.script({ text: ['Early ', 'late text'], hold: 'mid' });
  await message(page).fill('Start a reply');
  await message(page).press('Enter');
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Early');
  const streaming = videoId(page)!;
  await recents(page).getByRole('button', { name: 'Earlier video', exact: true }).click();
  await expect(saved(page)).toHaveText('An earlier video');
  provider.release();
  await expect.poll(async () => (await backend.read<{ messages: unknown[] }>(account!, `/memory/threads/${streaming}/messages?page=0&perPage=20`)).messages.length).toBe(2);
  await expect(page.getByText(/late text/)).toHaveCount(0);
  await expect(live(page)).toHaveCount(0);
  expect(videoId(page)).toBe(earlier.id);

  provider.script({ text: ['Private ', 'reply'], hold: 'mid' });
  await message(page).fill('Another reply');
  await message(page).press('Enter');
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Private');
  await page.getByRole('button', { name: account!.email, exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Signed out.', { exact: true })).toBeVisible();
  provider.release();
  // Back in, in the same page, as the other account.
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(other!.email);
  await page.getByLabel('Password', { exact: true }).fill(other!.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: other!.email, exact: true })).toBeVisible();
  await expect.poll(async () => (await backend.read<{ messages: unknown[] }>(account!, `/memory/threads/${earlier.id}/messages?page=0&perPage=20`)).messages.length).toBe(3);
  await expect(page.getByText(/Private|reply/)).toHaveCount(0);
  await expect(page.getByText('No videos yet.', { exact: true }).first()).toBeVisible();
});

test('an upload finishing during a reply keeps the chat mounted and the draft', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ text: ['Still ', 'here'], hold: 'mid' });
  await signIn(page, account!);
  await message(page).fill('Look at this');
  await message(page).press('Enter');
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Still');
  await message(page).fill('Next thought');
  await page.getByLabel('Choose a JPEG or PNG image').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: backend.media.imageBytes });
  await expect(page.getByRole('heading', { name: 'Image saved · Version 1' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  provider.release();
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Still here');
  await expect(message(page)).toHaveValue('Next thought');
});

test('after a reload mid-turn, a send is busy and keeps the draft; the reply appears later', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ text: ['Finished later'], hold: 'before' });
  await signIn(page, account!);
  await message(page).fill('Start');
  await message(page).press('Enter');
  await provider.held();
  await expect.poll(() => videoId(page)).not.toBeNull();
  await page.reload();
  await expect(saved(page)).toHaveText('Start');
  await expect(working(page)).toHaveCount(0);
  await message(page).fill('Too soon');
  await message(page).press('Enter');
  await expect(page.getByText('The agent is still working on the last message.', { exact: true })).toBeVisible();
  await expect(message(page)).toHaveValue('Too soon');

  provider.release();
  const video = videoId(page)!;
  await expect.poll(async () => (await backend.read<{ messages: unknown[] }>(account!, `/memory/threads/${video}/messages?page=0&perPage=20`)).messages.length).toBe(2);
  await page.reload();
  await expect(saved(page).getByRole('listitem')).toHaveText(['Start', 'Finished later']);
  provider.script({ text: ['Now it works'] });
  await message(page).fill('Again');
  await message(page).press('Enter');
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Now it works');
});

const phrase = 'Getting up to date on our progress…';
const toolBody = (request: { body: Record<string, unknown> }) => JSON.stringify((request.body.messages as { role: string; content: unknown }[]).filter(message => message.role === 'tool').at(-1)?.content);

test('read-workspace reads the uploaded image: the done line, the answer, and both after reload', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ text: ['Hello'] });
  await signIn(page, account!);
  await message(page).fill('Start a video');
  await message(page).press('Enter');
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Hello');
  await page.getByLabel('Choose a JPEG or PNG image').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: backend.media.imageBytes });
  await expect(page.getByRole('heading', { name: 'Image saved · Version 1' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  const video = videoId(page)!;
  const { assets } = await backend.read<{ assets: { version: { id: string } }[] }>(account!, `/v1/conversations/${video}/workspace`);
  const imageId = assets[0]!.version.id;

  provider.script({ toolCalls: [{ name: 'read-workspace', args: {} }] }, { text: ['You have one image saved.'], hold: 'before' });
  await message(page).fill('Check our progress on this video');
  await message(page).press('Enter');
  const reply = live(page).getByRole('listitem', { name: 'Assistant message' }).last();
  await expect(reply.getByText('Read 1 saved item', { exact: true })).toBeVisible();
  await provider.held();
  // The reply waits for its text after the finished tool line.
  await expect(reply.locator('.wp-pending-dot')).toBeVisible();
  // What the model received from the tool: the image by name and exact version id.
  const result = toolBody(provider.requests.at(-1)!);
  expect(result).toContain('Image 1 · Version 1');
  expect(result).toContain(imageId);
  provider.release();
  await expect(reply.getByText('You have one image saved.', { exact: true })).toBeVisible();
  await expect(working(page)).toHaveCount(0);
  await expect(reply.locator('.wp-pending-dot')).toHaveCount(0);

  await page.reload();
  const savedReply = saved(page).getByRole('listitem', { name: 'Assistant message' }).last();
  await expect(savedReply.getByText('Read 1 saved item', { exact: true })).toBeVisible();
  await expect(savedReply.getByText('You have one image saved.', { exact: true })).toBeVisible();
  await expect(page.getByText(phrase)).toHaveCount(0);
});

test('a running tool shows its own phrase with elapsed time, then its done summary', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ toolCalls: [{ name: 'test-gated', args: {} }] }, { text: ['Gate passed'] });
  await signIn(page, account!);
  await message(page).fill('Run the gated tool');
  await message(page).press('Enter');
  const line = live(page).locator('.wp-act');
  await expect(line).toHaveText(/^Running the gated test tool…\d+s$/);
  await expect(line).toHaveText(/^Running the gated test tool…[1-9]\d*s$/, { timeout: 5_000 });
  provider.openGate();
  await expect(line).toHaveText('Gated tool released');
  await expect(live(page).getByText('Gate passed', { exact: true })).toBeVisible();
});

test('a registered tool with no phrase shows Working…', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ toolCalls: [{ name: 'test-unphrased', args: {} }] }, { text: ['Finished'] });
  await signIn(page, account!);
  await message(page).fill('Run the unphrased tool');
  await message(page).press('Enter');
  const line = live(page).locator('.wp-act');
  await expect(line).toHaveText(/^Working…\d+s$/);
  provider.openGate();
  await expect(line).toHaveText('Done');
  await expect(live(page).getByText('Finished', { exact: true })).toBeVisible();
});

const scriptOf = (action: string) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'exterior', location: 'Mountain lake', time: 'night' }, characters: ['Mara'], script: [{ action }] }] });

test('the assistant\'s script saves show in the Script tab without a reload, and never replace an open edit', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  const panel = page.getByRole('tabpanel');
  const first = 'Mara swims across the dark lake.', second = 'Mara swims faster as the far shore appears.', mine = 'Mara floats and looks at the stars.';
  provider.script({ toolCalls: [{ name: 'update-script', args: { baseVersionId: null, script: scriptOf(first) } }] }, { text: ['I saved the script.'] });
  await signIn(page, account!);
  await message(page).fill('Write the script');
  await message(page).press('Enter');
  await expect(live(page).getByText('Saved version 1', { exact: true })).toBeVisible();
  await expect(panel).toContainText(first);
  await expect(working(page)).toHaveCount(0);

  // The editor is open with unsaved text when the assistant saves version 2 on version 1.
  const video = videoId(page)!;
  const { script } = await backend.read<{ script: { version: { id: string } } }>(account!, `/v1/conversations/${video}/workspace`);
  await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'What happens' });
  await editor.fill(mine);
  provider.script({ toolCalls: [{ name: 'update-script', args: { baseVersionId: script.version.id, script: scriptOf(second) } }] }, { text: ['Version 2 is saved.'] });
  await message(page).fill('Make her swim faster');
  await message(page).press('Enter');
  await expect(live(page).getByText('Saved version 2', { exact: true })).toBeVisible();
  await expect(working(page)).toHaveCount(0);
  await expect(editor).toHaveValue(mine);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel).toContainText('A newer version was saved. Your unsaved text is retained.');
  await page.getByRole('button', { name: 'Review latest version', exact: true }).click();
  await expect(panel).toContainText('Latest saved version · Version 2');
  await expect(panel).toContainText(second);
  await expect(editor).toHaveValue(mine);
  // The tab stays on the edit's base, version 1, until the edit closes; history already has version 2.
  await page.locator('.wp-version-history summary').click();
  await expect(page.getByRole('button', { name: 'View version 2', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(panel).toContainText(second);
  await expect(panel).not.toContainText(first);
  await expect(page.getByRole('button', { name: 'View version 1', exact: true })).toBeVisible();

  // With no editor open, the tab updates on the tool's done line: the reply is still held, so the turn hasn't ended.
  const latest = await backend.read<{ script: { version: { id: string } } }>(account!, `/v1/conversations/${video}/workspace`);
  const third = 'Mara reaches the shore and laughs.';
  provider.script({ toolCalls: [{ name: 'update-script', args: { baseVersionId: latest.script.version.id, script: scriptOf(third) } }] }, { text: ['Version 3 is saved.'], hold: 'before' });
  await message(page).fill('Let her reach the shore');
  await message(page).press('Enter');
  await expect(live(page).getByText('Saved version 3', { exact: true })).toBeVisible();
  await provider.held();
  await expect(panel).toContainText(third);
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  provider.release();
  await expect(working(page)).toHaveCount(0);
});

const abortPath = '/api/agents/assistant/threads/abort';

test('Stop mid-reply: Stopped within 10 s, the composer is usable, and reload shows the partial text', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ text: ['Partial answer', ' never sent'], hold: 'mid' });
  await signIn(page, account!);
  await message(page).fill('Write a long reply');
  await message(page).press('Enter');
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Partial answer');
  const stops: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === abortPath) stops.push(request.postData() ?? ''); });
  const clicked = Date.now();
  // From the keyboard: Stop leaves when the turn settles, and focus returns to the message field.
  await page.getByRole('button', { name: 'Stop', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Stopped.', { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - clicked).toBeLessThan(10_000);
  expect(stops).toHaveLength(1);
  await expect(working(page)).toHaveCount(0);
  await expect(message(page)).toBeFocused();
  await message(page).fill('Next');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  expect(provider.requests).toHaveLength(1);

  await page.reload();
  await expect(saved(page).getByRole('listitem')).toHaveText(['Write a long reply', 'Partial answer']);
  await expect(page.getByText('Stopped.', { exact: true })).toHaveCount(0);
});

test('a Stop that is never acknowledged settles within 10 s as unconfirmed, with no Retry, and never sends a second Stop', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ text: ['Still ', 'going'], hold: 'mid' });
  await signIn(page, account!);
  let stops = 0;
  // The Stop never reaches the server, so the reply keeps running there.
  await page.route(url => url.pathname === abortPath, route => { stops++; return route.abort(); });
  await message(page).fill('Write a long reply');
  await message(page).press('Enter');
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Still');
  const clicked = Date.now();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText('We couldn’t confirm the reply stopped.', { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - clicked).toBeLessThan(10_000);
  await expect(page.getByText('Stopped.', { exact: true })).toHaveCount(0);
  await expect(live(page).getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await message(page).fill('Next');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  expect(stops).toBe(1);
  provider.release();
});

test('closing the page mid-turn sends no Stop, and the reply is saved for when the video is reopened', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider } = backend;
  provider.script({ text: ['Kept ', 'going'], hold: 'mid' });
  await signIn(page, account!);
  const context = page.context();
  const stops: string[] = [];
  context.on('request', request => { if (new URL(request.url()).pathname === abortPath) stops.push(request.url()); });
  await message(page).fill('Keep going without me');
  await message(page).press('Enter');
  await expect(live(page).getByRole('listitem', { name: 'Assistant message' })).toHaveText('Kept');
  const video = videoId(page)!;
  await page.close();
  provider.release();
  await expect.poll(async () => (await backend.read<{ messages: unknown[] }>(account!, `/memory/threads/${video}/messages?page=0&perPage=20`)).messages.length).toBe(2);
  expect(stops).toHaveLength(0);
  const reopened = await context.newPage();
  await reopened.goto(`/app?conversation=${video}`);
  await expect(saved(reopened).getByRole('listitem')).toHaveText(['Keep going without me', 'Kept going']);
});

test('images the agent makes are shown under their line, each read once, and stay there after reload', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider, meta } = backend;
  meta.reset();
  provider.script({ toolCalls: [{ name: 'generate-image', args: { prompt: 'A quiet gallery bench', count: 3, showInChat: true } }] }, { text: ['Here they are.'] });
  const reads: string[] = [];
  page.on('request', request => { const read = /\/v1\/versions\/([^/]+)\/media$/.exec(new URL(request.url()).pathname); if (read) reads.push(read[1]!); });
  await signIn(page, account!);
  await message(page).fill('Make me three images of a gallery bench');
  await message(page).press('Enter');
  const reply = live(page).getByRole('listitem', { name: 'Assistant message' }).last();
  await expect(reply.getByText('Saved 3 images', { exact: true })).toBeVisible({ timeout: 45_000 });
  // More images than the two reads allowed at once: the rest wait their turn, so all three show.
  for (const number of [1, 2, 3]) {
    const image = reply.locator(`img[alt="Image ${number} · Version 1"]`);
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  // The image carries its own size, so its box is held before it loads.
  await expect(reply.locator('img[alt="Image 1 · Version 1"]')).toHaveAttribute('width', '64');
  await expect(reply.getByText('Here they are.', { exact: true })).toBeVisible();
  expect(new Set(reads).size).toBe(3);

  // Not asked for directly: the line, and no image. The hidden Assets panel reads nothing until it opens.
  provider.script({ toolCalls: [{ name: 'generate-image', args: { prompt: 'Another bench' } }] }, { text: ['Saved another one.'] });
  await message(page).fill('Save another bench for later');
  await message(page).press('Enter');
  const second = live(page).getByRole('listitem', { name: 'Assistant message' }).last();
  await expect(second.getByText('Saved another one.', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(second.getByText('Saved Image 4 · Version 1', { exact: true })).toBeVisible();
  await expect(second.locator('.wp-shown-image')).toHaveCount(0);
  // The refresh has landed once the hidden panel holds four rows; an eager row would read its image now.
  await expect(page.locator('.wp-asset-row')).toHaveCount(4);
  await page.waitForTimeout(500);
  expect(reads).toHaveLength(3);
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  // Rows are named as the agent names them, with no status: nothing can approve an image yet.
  for (const number of [1, 2, 3, 4]) await expect(page.locator('.wp-asset-row').nth(number - 1)).toHaveAccessibleName(new RegExp(`^Image ${number} · Version 1`));
  await expect(page.locator('.wp-assets .wp-status')).toHaveCount(0);
  await expect.poll(() => page.locator('.wp-asset-row img').evaluateAll(images => images.filter(image => (image as HTMLImageElement).naturalWidth > 0).length)).toBe(4);
  await live(page).getByRole('listitem', { name: 'Assistant message' }).first().getByRole('button', { name: 'Open Image 1 · Version 1' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Saved image', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').locator('.wp-status')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Each image was read once, however many places show it.
  expect(reads).toHaveLength(4); expect(new Set(reads).size).toBe(4);

  await page.reload();
  const replies = saved(page).getByRole('listitem', { name: 'Assistant message' });
  await expect(replies).toHaveCount(2);
  for (const number of [1, 2, 3]) await expect(replies.first().locator(`img[alt="Image ${number} · Version 1"]`)).toBeVisible();
  await expect(replies.last().locator('.wp-shown-image')).toHaveCount(0);
});

test('a video the agent makes shows its poster under the line and plays in the viewer, after reload too', async ({ page, backend }) => {
  test.slow();
  const [account] = await backend.accounts(1);
  await signIn(page, account!);
  const reply = await makeVideo(page, backend);
  await expect(reply.getByText('Saved Video 1 · Version 1', { exact: true })).toBeVisible();
  const poster = (root: typeof reply) => root.locator('img[alt="Video 1 · Version 1"]');
  await expect(poster(reply)).toBeVisible();
  await expect.poll(() => poster(reply).evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  // The poster carries the clip's own size, so its box is held before it loads, and it is at most 240 px tall.
  await expect(poster(reply)).toHaveAttribute('width', '1344');
  expect((await reply.locator('.wp-shown-image[data-kind="video"]').boundingBox())!.height).toBeLessThanOrEqual(240);
  await expect(reply.locator('.wp-clip-mark')).toBeVisible();

  /** Opens the clip from its poster, plays it, and closes the viewer. */
  const plays = async (root: typeof reply) => {
    await root.getByRole('button', { name: 'Play Video 1 · Version 1', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.wp-clip-surface[data-ready="true"]')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Play', exact: true }).click();
    // Played, not only loaded: the player reports playing or ended, or the clip has moved on.
    await expect.poll(async () => ['playing', 'ended'].includes(await dialog.locator('.wp-clip-surface').getAttribute('data-player-status') ?? '')
      || await dialog.locator('.wp-clip-media').evaluate(node => (node as HTMLVideoElement).currentTime > 0), { timeout: 10_000 }).toBe(true);
    // A clip seen in the chat is only viewed: the viewer offers no use or choice.
    await expect(dialog.getByRole('button', { name: /^Use / })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  };
  await plays(reply);

  // Not asked for directly: the line, and no video.
  const quiet = await makeVideo(page, backend, { showInChat: false, text: 'Saved it for later.' });
  await expect(quiet.getByText('Saved Video 2 · Version 1', { exact: true })).toBeVisible();
  await expect(quiet.locator('.wp-shown-image')).toHaveCount(0);

  // A refused poster read leaves the line and says the video couldn't be shown.
  await page.route('**/v1/versions/*/media', route => route.fulfill({ status: 503, body: '' }), { times: 1 });
  const refused = await makeVideo(page, backend, { text: 'One more.' });
  await expect(refused.getByText('Saved Video 3 · Version 1', { exact: true })).toBeVisible();
  await expect(refused.getByText('This video couldn’t be shown', { exact: true })).toBeVisible();

  await page.reload();
  const replies = saved(page).getByRole('listitem', { name: 'Assistant message' });
  await expect(replies).toHaveCount(3);
  await expect.poll(() => poster(replies.first()).evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await plays(replies.first());
  await expect(replies.nth(1).locator('.wp-shown-image')).toHaveCount(0);
  await expect(replies.last().locator('img[alt="Video 3 · Version 1"]')).toBeVisible();
});

test('an edit of one image is its next version: Assets keeps one row, with the earlier version in its history', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  const { provider, meta } = backend;
  meta.reset();
  provider.script({ toolCalls: [{ name: 'generate-image', args: { prompt: 'A quiet gallery bench' } }] }, { text: ['Saved it.'] });
  await signIn(page, account!);
  await message(page).fill('Save an image of a gallery bench');
  await message(page).press('Enter');
  await expect(live(page).getByText('Saved Image 1 · Version 1', { exact: true })).toBeVisible({ timeout: 45_000 });
  const row = page.locator('.wp-asset-row');
  await expect(row).toHaveCount(1);
  const first = await row.getAttribute('data-media-version-id');
  provider.script({ toolCalls: [{ name: 'generate-image', args: { prompt: 'The same bench at dusk', inputImages: [first], revises: first } }] }, { text: ['Changed it.'] });
  await message(page).fill('Make it dusk');
  await message(page).press('Enter');
  await expect(live(page).getByText('Saved Image 1 · Version 2', { exact: true })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAccessibleName(/^Image 1 · Version 2/);
  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: 'Saved image', exact: true })).toBeVisible();
  await dialog.locator('.wp-version-history summary').click();
  await expect(dialog.locator('.wp-version-history summary')).toHaveText('Version history · 1 earlier');
  await dialog.getByRole('button', { name: 'View version 1', exact: true }).click();
  await expect(dialog.getByText('Viewing version 1', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Image saved · Version 1', { exact: true })).toBeVisible();
});

test('Assets lists each script subject with its sheet and images, Other last, with no status; the sheet shows its views', async ({ page, backend }) => {
  test.slow();
  const [account] = await backend.accounts(1);
  const { provider, meta } = backend;
  meta.reset();
  const panel = page.getByRole('tabpanel');
  const turn = async (call: { name: string; args: Record<string, unknown> }, ask: string, done: string) => {
    provider.script({ toolCalls: [call] }, { text: [`${ask} done.`] });
    await message(page).fill(ask);
    await message(page).press('Enter');
    const reply = live(page).getByRole('listitem', { name: 'Assistant message' }).last();
    await expect(reply.getByText(done, { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(reply.getByText(`${ask} done.`, { exact: true })).toBeVisible();
    return reply;
  };
  await signIn(page, account!);
  // With no script and nothing saved, the tab keeps its empty text.
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await expect(panel).toHaveText('Characters, places and props will appear here.');
  const script = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: ['Mara'], script: [{ action: 'Mara finds the key.' }] }] };
  await turn({ name: 'update-script', args: { baseVersionId: null, script, subjects: [{ id: '', kind: 'character', name: 'Mara' }, { id: '', kind: 'place', name: 'The Gallery' }, { id: '', kind: 'prop', name: 'The key' }] } }, 'Write the script', 'Saved version 1');
  const subjects = panel.locator('.wp-subject');
  // Subjects appear once the script is saved, in kind order, each still empty.
  await expect(subjects).toHaveCount(3);
  await expect(subjects.locator('.wp-subject-entry')).toHaveText([/^Mara\s*Character\s*Empty$/, /^The Gallery\s*Place\s*Empty$/, /^The key\s*Prop\s*Empty$/]);

  const views = ['Full-body front', 'Three-quarter', 'Face close-up'];
  const sheetLine = await turn({ name: 'generate-sheet', args: { subject: 'mara', description: 'A courier in a long grey coat.', continuityNotes: ['Keep the grey coat.'], views: views.map(view => ({ view, prompt: `${view}, standing still` })) } }, 'Make Mara\'s sheet', 'Saved Mara · Version 1');
  // The images under the line are named by subject and view.
  for (const view of views) await expect(sheetLine.locator(`img[alt="Mara · ${view}"]`)).toBeVisible();
  await turn({ name: 'generate-image', args: { prompt: 'Mara on a bench', subject: 'mara' } }, 'Make one of Mara', 'Saved Image 4 · Version 1');
  await turn({ name: 'generate-image', args: { prompt: 'An empty bench' } }, 'Make a bench', 'Saved Image 5 · Version 1');

  const mara = panel.getByRole('region', { name: 'Mara', exact: true });
  const holds = async () => {
    await expect(subjects).toHaveCount(4);
    await expect(subjects.locator('.wp-subject-entry b')).toHaveText(['Mara', 'The Gallery', 'The key', 'Other']);
    // Mara has her sheet and one image; the sheet's views have no rows of their own, and nothing shows a status.
    await expect(mara.locator('.wp-asset-row')).toHaveCount(2);
    await expect(mara.locator('.wp-asset-row').first()).toHaveAccessibleName(/^Mara · Version 1/);
    await expect(mara.locator('.wp-asset-row small').first()).toHaveText('Character sheet · 3 views');
    await expect(mara.locator('.wp-asset-row').last()).toHaveAccessibleName(/^Image 4 · Version 1/);
    await expect(panel.locator('.wp-status')).toHaveCount(0);
    for (const name of ['The Gallery', 'The key']) await expect(panel.getByRole('region', { name, exact: true }).locator('.wp-subject-empty')).toHaveText('Empty');
    await expect(mara.locator('.wp-subject-empty')).toHaveCount(0);
    await expect(panel.getByRole('region', { name: 'Other', exact: true }).locator('.wp-asset-row')).toHaveAccessibleName(/^Image 5 · Version 1/);
    // The open sheet shows its three images, captioned by view, with no status and no view count.
    await mara.locator('.wp-asset-row').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('figcaption')).toHaveText(views);
    for (const view of views) await expect.poll(() => dialog.getByRole('img', { name: `Mara · ${view}`, exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(dialog.locator('.wp-status')).toHaveCount(0);
    await expect(dialog.getByText('Missing views')).toHaveCount(0);
    await expect(dialog.locator('.wp-sheet-kicker')).toHaveText('Character');
    // Selecting a view opens the image viewer on that exact version.
    const close = dialog.locator('figure').filter({ hasText: 'Face close-up' });
    const id = await close.getAttribute('data-view-version-id');
    await close.getByRole('button', { name: 'Open Mara · Face close-up', exact: true }).click();
    await expect(page.locator(`.wp-upload-media[data-media-version-id="${id}"]`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  };
  await holds();

  await page.reload();
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  for (const view of views) await expect(saved(page).locator(`img[alt="Mara · ${view}"]`)).toBeVisible();
  await holds();

  // An edit of a view is its image's next version: that version gets a row under Mara, and the sheet keeps the old one.
  const sheetOf = async () => (await backend.read<{ assets: { version: { kind: string; content?: { references: { versionId: string; view: string }[] } } }[] }>(account!, `/v1/conversations/${videoId(page)}/workspace`))
    .assets.find(asset => asset.version.kind === 'reference')!.version.content!.references;
  const front = (await sheetOf()).find(reference => reference.view === 'Full-body front')!.versionId;
  await turn({ name: 'generate-image', args: { prompt: 'The same, at dusk', inputImages: [front], revises: front } }, 'Make the front view dusk', 'Saved Image 1 · Version 2');
  await expect(mara.locator('.wp-asset-row')).toHaveCount(3);
  await expect(mara.locator('.wp-asset-row').nth(1)).toHaveAccessibleName(/^Image 1 · Version 2/);
  await mara.locator('.wp-asset-row').first().click();
  // The old version is read on its own, since the workspace no longer holds it.
  await expect(page.getByRole('dialog').locator(`figure[data-view-version-id="${front}"]`)).toHaveCount(1);
  await expect.poll(() => page.getByRole('dialog').getByRole('img', { name: 'Mara · Full-body front', exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  // One image that can't be read says so in its own slot; the other views still show.
  const refused = (await sheetOf()).find(reference => reference.view === 'Three-quarter')!.versionId;
  await page.route(`**/v1/versions/${refused}/media`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'integration_failure', message: 'Media unavailable' } }) }));
  await page.reload();
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await mara.locator('.wp-asset-row').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('figure').filter({ hasText: 'Three-quarter' })).toContainText('This image couldn’t be shown');
  for (const view of ['Full-body front', 'Face close-up']) await expect.poll(() => dialog.getByRole('img', { name: `Mara · ${view}`, exact: true }).evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(dialog.getByText('This image couldn’t be shown')).toHaveCount(1);

  // A person still edits the sheet's description there: it saves as the sheet's next version, kept after a reload.
  await dialog.getByRole('button', { name: 'Edit Description', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Description' }).fill('A courier in a long blue coat.');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Description' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await expect(mara.locator('.wp-asset-row').first()).toHaveAccessibleName(/^Mara · Version 2/);
  await mara.locator('.wp-asset-row').first().click();
  await expect(page.getByRole('dialog')).toContainText('A courier in a long blue coat.');
  await expect(page.getByRole('dialog').locator('figcaption')).toHaveText(views);
});
