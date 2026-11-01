import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { accountBrowserFixture } from '../support/account-browser-fixture.js';
import { chatComposition } from '../support/chat-composition.js';
import { completed, nativeTurnClient, type ObservedTurn } from '../support/native-turn-client.js';
import { scriptedProvider } from '../support/scripted-provider.js';

const interrupted = (turn: ObservedTurn) => turn.terminal?.type === 'abort' || (turn.terminal?.type === 'finish' && (turn.terminal.payload?.stepResult as { reason?: string } | undefined)?.reason === 'abort');

// Stop through the browser's exact-turn route (`threads/abort` with the captured run id), on the built server.
test('Stop ends exactly the turn it names, including a running tool, and nothing else', { timeout: 300000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const fixture = await accountBrowserFixture({ composition: chatComposition(provider) }); t.after(fixture.close);
  const [owner, other] = [await fixture.auth.createAccount(), await fixture.auth.createAccount()];
  const ownerToken = await fixture.accessToken(owner), otherToken = await fixture.accessToken(other);
  const client = nativeTurnClient(fixture.apiOrigin, ownerToken, owner.id);
  const stranger = nativeTurnClient(fixture.apiOrigin, otherToken, other.id);
  t.beforeEach(() => provider.reset());
  const stop = (as: ReturnType<typeof nativeTurnClient>, accountId: string, video: string, runId: string) => as.post('/api/agents/assistant/threads/abort', { threadId: video, resourceId: accountId, expectedRunId: runId, clearPendingSignals: false });
  /** Starts a turn and resolves its run id once the native send was accepted. */
  const running = (video: string, message: string) => {
    let runId!: (id: string) => void;
    const accepted = new Promise<string>(resolve => { runId = resolve; });
    const turn = client.turn(video, message, 30000, id => runId(id));
    return { accepted, turn };
  };
  const history = async (video: string) => {
    const response = await fetch(`${fixture.apiOrigin}/memory/threads/${video}/messages?page=0&perPage=20`, { headers: { Authorization: `Bearer ${ownerToken}` } });
    assert.equal(response.status, 200);
    return ((await response.json()) as { messages: { role: string; content: { parts: { type: string; text?: string }[] } }[] }).messages;
  };

  await t.test('Stop during streaming text interrupts the turn, saves the partial text and makes no further request', async () => {
    const video = await client.newVideo();
    provider.script({ text: ['Partial', ' never sent'], hold: 'mid' });
    const { accepted, turn } = running(video, 'Write a long reply');
    const runId = await accepted; await provider.held();
    const acknowledged = await stop(client, owner.id, video, runId);
    assert.equal(acknowledged.status, 200); assert.deepEqual(await acknowledged.json(), { aborted: true });
    const ended = await turn;
    assert.ok(interrupted(ended), JSON.stringify(ended.terminal)); assert.equal(ended.text, 'Partial');
    await wait(1000);
    assert.equal(provider.requests.length + provider.unscripted.length, 1);
    const saved = await history(video);
    assert.deepEqual(saved.map(message => message.content.parts.map(part => part.text ?? `[${part.type}]`).join('')).reverse(), ['Write a long reply', 'Partial']);
  });

  await t.test('Stop during a held tool aborts the tool and ends the whole turn', async () => {
    const video = await client.newVideo();
    provider.script({ toolCalls: [{ name: 'test-gated', args: {} }] }, { text: ['Should never be asked for'] });
    const { accepted, turn } = running(video, 'Run the gated tool');
    const runId = await accepted; await provider.gate().reached;
    const acknowledged = await stop(client, owner.id, video, runId);
    assert.equal(acknowledged.status, 200); assert.deepEqual(await acknowledged.json(), { aborted: true });
    const ended = await turn;
    assert.ok(interrupted(ended), JSON.stringify(ended.terminal));
    await wait(1000);
    assert.equal(provider.gate().aborted(), true, 'the tool observed the abort');
    assert.equal(provider.requests.length + provider.unscripted.length, 1, 'no model step after Stop');
  });

  await t.test('a delayed Stop for an earlier turn does not touch the next one', async () => {
    const video = await client.newVideo();
    provider.script({ text: ['First'] });
    const first = await client.turn(video, 'One');
    assert.ok(completed(first) && first.runId);
    provider.script({ text: ['Second ', 'finished'], hold: 'mid' });
    const { accepted, turn } = running(video, 'Two');
    await accepted; await provider.held();
    const late = await stop(client, owner.id, video, first.runId);
    assert.equal(late.status, 200); assert.deepEqual(await late.json(), { aborted: false });
    provider.release();
    const second = await turn;
    assert.ok(completed(second), JSON.stringify(second.terminal)); assert.equal(second.text, 'Second finished');
  });

  await t.test('Stop on another account\'s video is not found and the turn runs on', async () => {
    const video = await client.newVideo();
    provider.script({ text: ['Mine ', 'to finish'], hold: 'mid' });
    const { accepted, turn } = running(video, 'Keep going');
    const runId = await accepted; await provider.held();
    assert.equal((await stop(stranger, other.id, video, runId)).status, 404);
    assert.equal((await stop(stranger, owner.id, video, runId)).status, 400, 'a claimed scope is not ownership');
    provider.release();
    assert.ok(completed(await turn));
  });
});
