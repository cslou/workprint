import type { Page } from '@playwright/test';
import { test, expect, signIn } from './fixtures.js';

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
