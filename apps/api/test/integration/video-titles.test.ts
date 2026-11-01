import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { titleInstructions } from '../../src/agent/index.js';
import { accountBrowserFixture } from '../support/account-browser-fixture.js';
import { chatComposition } from '../support/chat-composition.js';
import { completed, nativeTurnClient } from '../support/native-turn-client.js';
import { scriptedProvider } from '../support/scripted-provider.js';

type Thread = { id: string; title?: string };

// The built server with the model routed to the scripted provider. The title deadline is shortened to
// 1 s here, so a held title call times out quickly; production uses 15 s.
test('each video is named once from an accepted message, a failed title never hurts the chat, and Recents keeps it', { timeout: 300000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const fixture = await accountBrowserFixture({ composition: chatComposition(provider, { titleMs: 1000 }) }); t.after(fixture.close);
  const owner = await fixture.auth.createAccount();
  const client = nativeTurnClient(fixture.apiOrigin, await fixture.accessToken(owner), owner.id);
  t.beforeEach(() => provider.reset());
  const read = async <T>(path: string) => {
    const response = await client.get(path);
    assert.equal(response.status, 200, path);
    return await response.json() as T;
  };
  const title = async (video: string) => (await read<Thread>(`/memory/threads/${video}`)).title ?? '';
  const recents = async () => (await read<{ threads: Thread[] }>(`/memory/threads?resourceId=${owner.id}&page=0&perPage=50`)).threads;
  /** Waits for every title request so far to have been answered and its outcome saved or dropped. */
  const titleSettled = async (video: string, expected: string) => {
    for (let tries = 0; tries < 100 && await title(video) !== expected; tries++) await wait(50);
    await wait(300);
    assert.equal(await title(video), expected);
  };
  const turn = async (video: string, message: string, reply = 'Sure') => {
    provider.script({ text: [reply] });
    const ended = await client.turn(video, message);
    assert.ok(completed(ended), JSON.stringify(ended.terminal));
    return ended;
  };

  await t.test('the first message makes exactly one capped title request and saves a trimmed title; the second makes none', async () => {
    const video = await client.newVideo();
    provider.scriptTitle({ text: ['"A night swim at the lake where the old boathouse leans into the water, at dusk."'] });
    await turn(video, 'A short film about a night swim at the lake');
    await titleSettled(video, 'A night swim at the lake where the old boathouse leans into');
    assert.equal(provider.titleRequests.length, 1);
    const body = provider.titleRequests[0]!.body as { max_tokens?: number; messages: { role: string; content: unknown }[] };
    assert.equal(body.max_tokens, 32);
    assert.deepEqual(body.messages, [{ role: 'system', content: titleInstructions }, { role: 'user', content: 'A short film about a night swim at the lake' }]);
    assert.equal(provider.requests.length, 1, 'turn requests exclude the title request');
    // The title is written alone: the started mark Recents lists by survives it.
    assert.deepEqual((await recents()).filter(thread => thread.id === video).map(thread => thread.title), ['A night swim at the lake where the old boathouse leans into']);

    await turn(video, 'Make it in winter');
    await wait(300);
    assert.equal(provider.titleRequests.length, 1, 'no further attempt once titled');
    assert.equal(await title(video), 'A night swim at the lake where the old boathouse leans into');
  });

  await t.test('a failing title call leaves the video untitled and the turn completed; the next message tries exactly once more', async () => {
    const video = await client.newVideo();
    provider.scriptTitle({ status: 500 });
    await turn(video, 'Something about trains');
    await titleSettled(video, '');
    assert.equal(provider.titleRequests.length, 1);
    assert.ok((await recents()).some(thread => thread.id === video), 'still listed, untitled');

    provider.scriptTitle({ text: ['Night trains'] });
    await turn(video, 'Night trains across the border');
    await titleSettled(video, 'Night trains');
    assert.equal(provider.titleRequests.length, 2);
    assert.equal((provider.titleRequests[1]!.body as { messages: { content: unknown }[] }).messages[1]!.content, 'Night trains across the border');
  });

  await t.test('a title call held past its deadline is abandoned: no title, and the turn completed', async () => {
    const video = await client.newVideo();
    provider.scriptTitle({ text: ['Too late'], hold: 'before' });
    const ended = await turn(video, 'Slow title please', 'Replied anyway');
    assert.equal(ended.text, 'Replied anyway');
    await wait(1500);
    provider.release();
    await titleSettled(video, '');
    assert.equal(provider.titleRequests.length, 1);
  });
});
