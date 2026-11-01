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
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
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

test('Shift+Enter adds a line and whitespace-only input is never sent', async ({ page, backend }) => {
  const [account] = await backend.accounts(1);
  await signIn(page, account!);
  await message(page).fill('first');
  await message(page).press('Shift+Enter');
  await message(page).pressSequentially('second');
  await expect(message(page)).toHaveValue('first\nsecond');
  await message(page).fill('   \n  ');
  await message(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await expect(message(page)).toHaveValue('   \n  ');
  expect(backend.provider.requests).toHaveLength(0);
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
