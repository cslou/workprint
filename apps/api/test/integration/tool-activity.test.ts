import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createArtifactStore } from '../../src/artifacts/index.js';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { accountBrowserFixture } from '../support/account-browser-fixture.js';
import { chatComposition } from '../support/chat-composition.js';
import { completed, nativeTurnClient } from '../support/native-turn-client.js';
import { scriptedProvider } from '../support/scripted-provider.js';

type Listing = { found: true; mode: 'listing'; items: { name: string; kind: string; versionId: string; use: string; state: string; text: string }[]; total: number; truncated: boolean };
type Item = { found: true; mode: 'item'; item: { name: string; versionId: string; content?: { subject?: { name?: string } } } };
type Missing = { found: false; reason: string };

// The built server with read-workspace registered in production tools, the model routed to the scripted provider.
// The tool result is read from the provider's next request: exactly what the model received.
test('read-workspace reads only the run\'s own saved work, within bounds, and only safe activity leaves the server', { timeout: 300000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const fixture = await accountBrowserFixture({ artifacts: true, composition: chatComposition(provider) });
  const pool = new Pool({ connectionString: fixture.servingUrl, max: 2 });
  // The pool ends before its database is removed.
  t.after(async () => { await pool.end(); await fixture.close(); });
  const store = createArtifactStore(pool, createOwnedConversationCheck(fixture.native));
  const [owner, other] = [await fixture.auth.createAccount(), await fixture.auth.createAccount()];
  const tokens = new Map(await Promise.all([owner, other].map(async user => [user.id, await fixture.accessToken(user)] as const)));
  const clients = new Map([owner, other].map(user => [user.id, nativeTurnClient(fixture.apiOrigin, tokens.get(user.id)!, user.id)] as const));
  const client = (user: { id: string }) => clients.get(user.id)!;
  t.beforeEach(() => provider.reset());

  const saveReference = (accountId: string, conversationId: string, name: string, description = `${name} in a long grey coat.`) => store.insert({
    accountId, conversationId, kind: 'reference', createdBy: 'human', dependencies: [],
    content: { schemaVersion: 1, subject: { id: randomUUID(), kind: 'character', name, description, continuityNotes: ['Same coat in every shot.'] }, references: [] },
    use: { binding: { purpose: 'reference' }, state: 'draft' },
  });
  /** Runs one turn in which the model calls read-workspace with `args`, and returns what the tool gave the model. */
  const readWorkspace = async (user: { id: string }, video: string, args: Record<string, unknown> = {}) => {
    provider.reset();
    provider.script({ toolCalls: [{ name: 'read-workspace', args }] }, { text: ['Read it'] });
    const turn = await client(user).turn(video, 'Check our progress on this video');
    assert.ok(completed(turn), JSON.stringify(turn.terminal));
    const messages = (provider.requests[1]!.body as { messages: { role: string; content: unknown }[] }).messages;
    // This turn's result is the last tool message; earlier turns' results come first in the history.
    const content = messages.findLast(message => message.role === 'tool')?.content;
    assert.ok(content !== undefined, 'tool result sent to the model');
    return { turn, result: (typeof content === 'string' ? JSON.parse(content) : content) as Listing | Item | Missing };
  };
  const history = async (user: { id: string }, video: string) => {
    const response = await fetch(`${fixture.apiOrigin}/memory/threads/${video}/messages?page=0&perPage=20`, { headers: { Authorization: `Bearer ${tokens.get(user.id)}` } });
    return { status: response.status, body: await response.json() as { messages: { role: string; content: { parts: Record<string, unknown>[] } }[] } };
  };

  const video = await client(owner).newVideo(), otherVideo = await client(owner).newVideo(), foreignVideo = await client(other).newVideo();
  const [mara, theo] = [await saveReference(owner.id, video, 'Mara'), await saveReference(owner.id, video, 'Theo')];
  const elsewhere = await saveReference(owner.id, otherVideo, 'Elsewhere');
  const foreign = await saveReference(other.id, foreignVideo, 'Private Vesna');

  await t.test('listing names every exact version the video uses, for the run\'s own account and video', async () => {
    const { result } = await readWorkspace(owner, video);
    assert.ok(result.found && result.mode === 'listing', JSON.stringify(result));
    assert.deepEqual(result.items.map(item => [item.name, item.kind, item.versionId, item.use, item.state]), [['Mara · Version 1', 'reference', mara.id, 'reference', 'Draft'], ['Theo · Version 1', 'reference', theo.id, 'reference', 'Draft']]);
    assert.match(result.items[0]!.text, /Mara in a long grey coat/);
    assert.equal(result.total, 2); assert.equal(result.truncated, false);
    const theirs = await readWorkspace(other, foreignVideo);
    assert.ok(theirs.result.found && theirs.result.mode === 'listing');
    assert.deepEqual(theirs.result.items.map(item => item.versionId), [foreign.id]);
  });

  await t.test('item mode returns one used version in full; a foreign, other-video or missing id is simply not found', async () => {
    const { result } = await readWorkspace(owner, video, { versionId: theo.id });
    assert.ok(result.found && result.mode === 'item', JSON.stringify(result));
    assert.equal(result.item.versionId, theo.id); assert.equal(result.item.content?.subject?.name, 'Theo');
    for (const versionId of [foreign.id, elsewhere.id, randomUUID()]) {
      const missing = await readWorkspace(owner, video, { versionId });
      assert.deepEqual(missing.result, { found: false, reason: 'not_found' });
    }
    assert.ok(!JSON.stringify(provider.requests).includes('Private Vesna'));
  });

  await t.test('a listing stays within 50 items, 16 KiB and 200 characters per text, and says when it left items out', async () => {
    const crowded = await client(owner).newVideo();
    for (let index = 0; index < 51; index++) await saveReference(owner.id, crowded, `Extra ${index + 1}`, `Extra ${index + 1} ${'with a very long saved description '.repeat(12)}`);
    const { result } = await readWorkspace(owner, crowded);
    assert.ok(result.found && result.mode === 'listing');
    assert.equal(result.total, 51); assert.equal(result.truncated, true);
    assert.ok(result.items.length > 0 && result.items.length <= 50, String(result.items.length));
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 16 * 1024, 'the whole tool result');
    for (const item of result.items) { assert.ok(item.text.length <= 200); assert.ok(item.name.length <= 200); }
  });

  await t.test('the stream carries the tool\'s phrase and done summary, never arguments, results, request bodies or step payloads', async () => {
    const { turn } = await readWorkspace(owner, video, { versionId: mara.id });
    const activity = turn.chunks.filter(chunk => chunk.type === 'tool-activity').map(chunk => chunk.payload);
    assert.deepEqual(activity.map(payload => [payload?.tool, payload?.phrase, payload?.state, payload?.summary]), [
      ['read-workspace', 'Getting up to date on our progress…', 'running', undefined],
      ['read-workspace', 'Getting up to date on our progress…', 'done', 'Read Mara · Version 1'],
    ]);
    assert.ok(turn.chunks.every(chunk => ['start', 'text-delta', 'tool-activity', 'finish'].includes(chunk.type)), turn.chunks.map(chunk => chunk.type).join());
    const wire = JSON.stringify(turn.chunks);
    for (const secret of [mara.id, 'long grey coat', 'Check our progress', 'You are the Workprint assistant', 'usage', 'headers']) assert.ok(!wire.includes(secret), secret);
  });

  await t.test('a failed reply\'s error leaves the server as a name and a safe message only', async () => {
    provider.script({ status: 500 });
    const failed = await client(owner).turn(await client(owner).newVideo(), 'Fail please');
    assert.deepEqual(failed.terminal?.payload, { error: { name: 'AI_APICallError', message: 'The reply failed.' } });
    assert.doesNotMatch(JSON.stringify(failed.chunks), /stack|Scripted failure|node_modules|\/Users\//);
  });

  await t.test('history keeps the safe tool line in order with the text, and fails closed on a part it does not know', async () => {
    const { status, body } = await history(owner, video);
    assert.equal(status, 200);
    const reply = body.messages.find(message => message.role === 'assistant')!;
    assert.deepEqual(reply.content.parts.map(part => part.type), ['tool-activity', 'text']);
    const line = reply.content.parts[0]!;
    assert.deepEqual(Object.keys(line).sort(), ['phrase', 'state', 'summary', 'tool', 'toolCallId', 'type']);
    assert.deepEqual([line.tool, line.state, line.summary], ['read-workspace', 'done', 'Read Mara · Version 1']);
    for (const secret of [mara.id, 'long grey coat', 'step-start', 'toolInvocation', 'args']) assert.ok(!JSON.stringify(body).includes(secret), secret);

    const memory = await fixture.native.getStore('memory');
    // Stored tool states the scripted runs above don't produce: a tool that threw, one never answered, an invented tool, and reasoning.
    const states = await client(owner).newVideo();
    const invocation = (toolCallId: string, toolName: string, state: string) => ({ type: 'tool-invocation', toolInvocation: { state, toolCallId, toolName, args: { secret: 'arg' }, ...(state === 'output-error' ? { errorText: 'secret error' } : {}) } });
    await memory!.saveMessages({ messages: [{ id: randomUUID(), threadId: states, resourceId: owner.id, role: 'assistant', createdAt: new Date(), content: { format: 2, parts: [
      { type: 'reasoning', reasoning: 'secret thought', details: [] }, invocation('c1', 'read-workspace', 'output-error'), invocation('c2', 'test-gated', 'call'), invocation('c3', 'invented-tool', 'result'), { type: 'text', text: 'After' },
    ] as never } }] });
    const projected = await history(owner, states);
    assert.equal(projected.status, 200);
    assert.deepEqual(projected.body.messages[0]!.content.parts.map(part => [part.type, part.tool, part.state]), [['tool-activity', 'read-workspace', 'failed'], ['tool-activity', 'test-gated', 'incomplete'], ['text', undefined, undefined]]);
    assert.doesNotMatch(JSON.stringify(projected.body), /secret|invented/);

    await memory!.saveMessages({ messages: [{ id: randomUUID(), threadId: otherVideo, resourceId: owner.id, role: 'assistant', createdAt: new Date(), content: { format: 2, parts: [{ type: 'data-private', data: { secret: 'never shown' } }] } }] });
    const unknown = await history(owner, otherVideo);
    assert.equal(unknown.status, 503); assert.ok(!JSON.stringify(unknown.body).includes('never shown'));
  });
});
