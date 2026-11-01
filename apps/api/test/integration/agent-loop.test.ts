import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { accountBrowserFixture } from '../support/account-browser-fixture.js';
import { placeholderMetaKey } from '../support/environment.js';
import { chatComposition } from '../support/chat-composition.js';
import { completed, nativeTurnClient, type TurnChunk } from '../support/native-turn-client.js';
import { scriptedProvider } from '../support/scripted-provider.js';

// The built server through the test composition: Muse Spark routed to the scripted provider,
// test tools registered, and the step cap and stall limit lowered so the edges are reachable.
test('the Muse Spark agent loop runs tools, enforces its limits and fails without retries', { timeout: 300000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const fixture = await accountBrowserFixture({ composition: chatComposition(provider, { maxSteps: 3, stallMs: 1000 }) }); t.after(fixture.close);
  const user = await fixture.auth.createAccount();
  const token = await fixture.accessToken(user);
  const client = nativeTurnClient(fixture.apiOrigin, token, user.id);
  const { post, send, newVideo } = client;
  const streamed: TurnChunk[] = [];
  const turn = async (videoId: string, message: string) => { const result = await client.turn(videoId, message); streamed.push(...result.chunks); return result; };
  const bodies = () => provider.requests.map(request => request.body as { messages: { role: string; content: unknown }[]; tools?: unknown; max_tokens?: number });
  t.beforeEach(() => provider.reset());

  await t.test('a text reply streams and the next turn carries the saved first turn', async () => {
    const video = await newVideo();
    provider.script({ text: ['Hello', ' there'] }, { text: ['Again'] });
    const first = await turn(video, 'Hi');
    assert.ok(completed(first), JSON.stringify(first.terminal)); assert.equal(first.text, 'Hello there');
    const second = await turn(video, 'And again');
    assert.ok(completed(second)); assert.equal(second.text, 'Again');
    const sentToModel = JSON.stringify(bodies()[1]!.messages);
    assert.match(sentToModel, /"Hi"/); assert.match(sentToModel, /Hello there/); assert.match(sentToModel, /And again/);
    assert.equal(provider.unscripted.length, 0);
  });

  await t.test('the output cap reaches the provider and the static prompt and tool list are byte-identical across turns', async () => {
    const video = await newVideo();
    provider.script({ text: ['One'] }, { text: ['Two'] });
    assert.ok(completed(await turn(video, 'First')));
    assert.ok(completed(await turn(await newVideo(), 'Second')));
    const [first, second] = bodies();
    assert.equal(first!.max_tokens, 32768); assert.equal(second!.max_tokens, 32768);
    assert.equal(first!.messages[0]!.role, 'system');
    assert.equal(JSON.stringify(first!.messages[0]), JSON.stringify(second!.messages[0]));
    assert.equal(JSON.stringify(first!.tools), JSON.stringify(second!.tools));
  });

  await t.test('a tool call runs and its result reaches the next step', async () => {
    provider.script({ toolCalls: [{ name: 'test-echo', args: { text: 'ping-7f3a' } }] }, { text: ['Echo done'] });
    const result = await turn(await newVideo(), 'Echo ping');
    assert.ok(completed(result), JSON.stringify(result.terminal)); assert.equal(result.text, 'Echo done');
    assert.equal(provider.requests.length, 2);
    const toolMessage = bodies()[1]!.messages.find(message => message.role === 'tool');
    assert.ok(toolMessage, 'tool result sent to the model'); assert.match(JSON.stringify(toolMessage.content), /ping-7f3a/);
  });

  await t.test('a tool call on the final allowed step fails the turn; a normal stop there completes it', async () => {
    const echo = { toolCalls: [{ name: 'test-echo', args: { text: 'again' } }] };
    provider.script(echo, echo, echo);
    const capped = await turn(await newVideo(), 'Loop');
    assert.notEqual(capped.terminal?.type, 'finish', JSON.stringify(capped.terminal));
    assert.match(JSON.stringify(capped.terminal), /Stopped after too many steps\./);
    assert.equal(provider.requests.length, 3);
    provider.reset();
    provider.script(echo, echo, { text: ['Finished on the last step'] });
    const last = await turn(await newVideo(), 'Loop then stop');
    assert.ok(completed(last), JSON.stringify(last.terminal)); assert.equal(provider.requests.length, 3);
  });

  await t.test('input over 32 KiB is rejected at admission with no provider request', async () => {
    const video = await newVideo();
    const rejected = await send(video, 'a'.repeat(32 * 1024 + 1));
    assert.equal(rejected.status, 400); assert.equal((await rejected.json() as { error: { code: string } }).error.code, 'invalid_input');
    assert.equal(provider.requests.length + provider.unscripted.length, 0);
  });

  await t.test('provider error, incomplete stream and stall each fail once with no retry', async () => {
    for (const [name, step, errorName] of [['error', { status: 500 }, 'AI_APICallError'], ['incomplete', { text: ['Partial'], incomplete: true }, 'AI_InvalidResponseDataError'], ['stall', { text: ['Partial'], hold: 'mid' }, 'ModelStallError']] as const) {
      provider.reset();
      provider.script(step);
      const failed = await turn(await newVideo(), `Fail by ${name}`);
      assert.ok(failed.terminal && !completed(failed), `${name}: ${JSON.stringify(failed.terminal)}`);
      assert.equal(failed.terminal.type, 'error', name);
      assert.equal((failed.terminal.payload?.error as { name?: string } | undefined)?.name, errorName, name);
      assert.equal(provider.requests.length, 1, `${name}: no retry`);
      assert.equal(provider.unscripted.length, 0, `${name}: no extra request`);
    }
    provider.release();
  });

  await t.test('a stream that keeps sending data past the stall limit is not cut off', async () => {
    provider.script({ text: ['a', 'b', 'c', 'd', 'e'], dripMs: 400 });
    const slow = await turn(await newVideo(), 'Slow but steady');
    assert.ok(completed(slow), JSON.stringify(slow.terminal)); assert.equal(slow.text, 'abcde');
  });

  await t.test('a send while the video has an active turn is rejected as busy with no provider request', async () => {
    const video = await newVideo();
    provider.script({ text: ['Held'], hold: 'before' });
    const running = turn(video, 'Start');
    await provider.held();
    const busy = await send(video, 'Too soon');
    assert.equal(busy.status, 409); assert.equal((await busy.json() as { error: { code: string } }).error.code, 'busy');
    assert.equal(provider.requests.length, 1);
    provider.release();
    assert.ok(completed(await running));
    assert.equal(provider.requests.length + provider.unscripted.length, 1);
  });

  await t.test('there is no message queue', async () => {
    const queued = await post('/api/agents/assistant/queue-message', { threadId: await newVideo(), resourceId: user.id, message: 'Later' });
    assert.equal(queued.status, 404);
    assert.equal(provider.requests.length + provider.unscripted.length, 0);
  });

  await t.test('the key never reaches the stream or the server log', async () => {
    assert.ok(streamed.length > 0);
    assert.ok(!JSON.stringify(streamed).includes(placeholderMetaKey));
    assert.ok(!(await readFile(fixture.serverLog, 'utf8')).includes(placeholderMetaKey));
  });
});
