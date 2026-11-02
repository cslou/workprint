import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { Pool } from 'pg';
import { createArtifactStore, createArtifactWriters, createAssistantScripts, createVersionUses } from '../../src/artifacts/index.js';
import { createAssistantScriptSaver } from '../../src/application/index.js';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { createGenerationJobs } from '../../src/generation/index.js';
import { accountBrowserFixture } from '../support/account-browser-fixture.js';
import { chatComposition } from '../support/chat-composition.js';
import { metaImageFake, testPng, type FakeImageStep } from '../support/meta-image-fake.js';
import { generatedClip, miniMaxVideoFake } from '../support/minimax-video-fake.js';
import { completed, nativeTurnClient, type ObservedTurn } from '../support/native-turn-client.js';
import { scriptedProvider } from '../support/scripted-provider.js';
import { testStack } from '../support/test-stack.js';

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

type ScriptResult = { saved: true; versionId: string; version: number } | { saved: false; reason: string; message: string } | { error: true };

// update-script through real turns, and the assistant script capability directly where a turn cannot reach the case.
test('update-script saves the video\'s current script as a draft, and never overwrites newer or foreign work', { timeout: 300000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const fixture = await accountBrowserFixture({ artifacts: true, composition: chatComposition(provider) });
  const pool = new Pool({ connectionString: fixture.servingUrl, max: 4 });
  t.after(async () => { await pool.end(); await fixture.close(); });
  const check = createOwnedConversationCheck(fixture.native);
  const store = createArtifactStore(pool, check);
  const saveScript = createAssistantScriptSaver(createAssistantScripts(pool, check).save);
  const [owner, other] = [await fixture.auth.createAccount(), await fixture.auth.createAccount()];
  const clients = new Map(await Promise.all([owner, other].map(async user => [user.id, nativeTurnClient(fixture.apiOrigin, await fixture.accessToken(user), user.id)] as const)));
  const client = (user: { id: string }) => clients.get(user.id)!;
  t.beforeEach(() => provider.reset());

  const script = (action: string, speaker = 'Mara') => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'exterior', location: 'Mountain lake', time: 'night' }, characters: ['Mara'], script: [{ action }, { dialogue: { character: speaker, text: 'Almost there.' } }] }] });
  const versions = async (account: string, video: string) => Number((await pool.query<{ count: string }>('SELECT count(*) FROM artifacts.versions WHERE owner_id=$1 AND origin_conversation_id=$2', [account, video])).rows[0]!.count);
  /** One turn in which the model calls update-script with `args`; returns what the tool gave the model and the activity lines. */
  const updateScript = async (user: { id: string }, video: string, args: Record<string, unknown>) => {
    provider.reset();
    provider.script({ toolCalls: [{ name: 'update-script', args }] }, { text: ['Done'] });
    const turn = await client(user).turn(video, 'Write the script');
    assert.ok(completed(turn), JSON.stringify(turn.terminal));
    const messages = (provider.requests[1]!.body as { messages: { role: string; content: unknown }[] }).messages;
    const content = messages.findLast(message => message.role === 'tool')?.content;
    assert.ok(content !== undefined, 'tool result sent to the model');
    const lines = turn.chunks.filter(chunk => chunk.type === 'tool-activity').map(chunk => [chunk.payload?.phrase, chunk.payload?.state, chunk.payload?.summary]);
    return { turn, lines, result: (typeof content === 'string' ? JSON.parse(content) : content) as ScriptResult };
  };

  const video = await client(owner).newVideo(), otherVideo = await client(owner).newVideo(), foreignVideo = await client(other).newVideo();
  let first = '', second = '';
  /** The video's script: its version, the version its use points at, and the use's state. */
  const current = async (video: string) => { const work = (await store.workspace(owner.id, video)).script; return [work?.version.id, work?.use?.versionId, work?.use?.state]; };

  await t.test('a video with no script gets version 1, created by the assistant and used as a draft', async () => {
    const revision = (await store.workspace(owner.id, video)).selectionRevision;
    const { turn, lines, result } = await updateScript(owner, video, { baseVersionId: null, script: script('Mara swims across the lake.') });
    assert.ok('saved' in result && result.saved, JSON.stringify(result));
    assert.equal(result.version, 1); first = result.versionId;
    assert.equal((await store.workspace(owner.id, video)).selectionRevision, revision, 'a script save is not a selection change');
    assert.deepEqual(lines, [['Updating the script…', 'running', undefined], ['Updating the script…', 'done', 'Saved version 1']]);
    assert.ok(!JSON.stringify(turn.chunks).includes('Mara swims'), 'no script text leaves the server');
    const workspace = await store.workspace(owner.id, video);
    assert.equal(workspace.script?.version.id, first); assert.equal(workspace.script?.version.createdBy, 'assistant');
    assert.equal(workspace.script?.use?.state, 'draft'); assert.equal(workspace.script?.state, 'Draft');
  });

  await t.test('the next save on the current version becomes version 2 and moves the same use', async () => {
    const prior = await store.workspace(owner.id, video), before = prior.script!.use!.id;
    const { lines, result } = await updateScript(owner, video, { baseVersionId: first, script: script('Mara swims faster.') });
    assert.equal((await store.workspace(owner.id, video)).selectionRevision, prior.selectionRevision);
    assert.ok('saved' in result && result.saved, JSON.stringify(result));
    assert.equal(result.version, 2); second = result.versionId;
    assert.deepEqual(lines.at(-1), ['Updating the script…', 'done', 'Saved version 2']);
    const workspace = await store.workspace(owner.id, video);
    assert.equal(workspace.script?.version.id, second); assert.equal(workspace.script?.use?.id, before); assert.equal(workspace.script?.use?.state, 'draft');
    assert.equal(await versions(owner.id, video), 2);
  });

  await t.test('an earlier base is stale and saves nothing', async () => {
    const { lines, result } = await updateScript(owner, video, { baseVersionId: first, script: script('Mara stops.') });
    assert.ok('saved' in result && !result.saved && result.reason === 'stale', JSON.stringify(result));
    assert.deepEqual(lines.at(-1), ['Updating the script…', 'done', 'Not saved: the script changed']);
    assert.equal(await versions(owner.id, video), 2); assert.deepEqual(await current(video), [second, second, 'draft']);
  });

  await t.test('a base from another account or another video is not found and saves nothing', async () => {
    const elsewhere = (await saveScript(owner.id, otherVideo, { baseVersionId: null, content: script('Elsewhere.') }));
    const foreign = (await saveScript(other.id, foreignVideo, { baseVersionId: null, content: script('Private.') }));
    assert.ok(elsewhere.kind === 'saved' && foreign.kind === 'saved');
    for (const baseVersionId of [elsewhere.versionId, foreign.versionId, randomUUID()]) {
      const { lines, result } = await updateScript(owner, video, { baseVersionId, script: script('Mara stops.') });
      assert.ok('saved' in result && !result.saved && result.reason === 'not_found', JSON.stringify(result));
      assert.deepEqual(lines.at(-1), ['Updating the script…', 'done', 'Not saved: script not found']);
      // The model must read what it would replace: the refusal sends it to read-workspace and names no id.
      assert.match(result.message, /Call read-workspace/); assert.ok(!result.message.includes(second));
    }
    // The malformed base Muse Spark sent, on a video that has a script, is not found too.
    assert.deepEqual(await saveScript(owner.id, video, { baseVersionId: 'script-v1', content: script('Mara stops.') }), { kind: 'not_found' });
    assert.equal(await versions(owner.id, video), 2); assert.deepEqual(await current(video), [second, second, 'draft']);
    assert.ok(!JSON.stringify(provider.requests).includes('Private.'));
  });

  await t.test('a video with no script has nothing to overwrite: a first save with any base, even a made-up one, is version 1', async () => {
    const fresh = await client(owner).newVideo();
    const { lines, result } = await updateScript(owner, fresh, { baseVersionId: 'script-v1', script: script('Mara dives in.') });
    assert.ok('saved' in result && result.saved && result.version === 1, JSON.stringify(result));
    assert.deepEqual(lines.at(-1), ['Updating the script…', 'done', 'Saved version 1']);
    assert.equal(await versions(owner.id, fresh), 1); assert.deepEqual(await current(fresh), [result.versionId, result.versionId, 'draft']);
  });

  await t.test('content the saved-script schema refuses is not saved, and the line says so', async () => {
    const { lines, result } = await updateScript(owner, video, { baseVersionId: second, script: script('Mara waves.', 'Nobody') });
    assert.ok('error' in result, JSON.stringify(result));
    assert.deepEqual(lines.at(-1), ['Updating the script…', 'done', 'Not saved: the script isn’t valid']);
    // The domain refuses on its own too, for a caller that skips the tool's input schema.
    assert.deepEqual(await saveScript(owner.id, video, { baseVersionId: second, content: script('Mara waves.', 'Nobody') }), { kind: 'invalid' });
    assert.equal(await versions(owner.id, video), 2); assert.deepEqual(await current(video), [second, second, 'draft']);
  });

  await t.test('scope comes from the run: a missing video or another account\'s video is not found; another video\'s base never moves it', async () => {
    assert.deepEqual(await saveScript(owner.id, randomUUID(), { baseVersionId: null, content: script('Lost.') }), { kind: 'not_found' });
    assert.deepEqual(await saveScript(other.id, video, { baseVersionId: second, content: script('Taken.') }), { kind: 'not_found' });
    // A base from this account's other video starts this video's own script; the other video's script is untouched.
    const unscripted = await client(owner).newVideo();
    const own = await saveScript(owner.id, unscripted, { baseVersionId: second, content: script('Moved.') });
    assert.ok(own.kind === 'saved' && own.revision === 1, JSON.stringify(own));
    assert.equal(await versions(owner.id, unscripted), 1); assert.equal(await versions(owner.id, video), 2);
    assert.deepEqual(await current(unscripted), [own.versionId, own.versionId, 'draft']); assert.deepEqual(await current(video), [second, second, 'draft']);
  });

  await t.test('two first saves at once make exactly one script; the other is stale', async () => {
    const fresh = await client(owner).newVideo();
    const outcomes = await Promise.all([1, 2].map(n => saveScript(owner.id, fresh, { baseVersionId: null, content: script(`Take ${n}.`) })));
    assert.deepEqual(outcomes.map(outcome => outcome.kind).sort(), ['saved', 'stale']);
    assert.equal(await versions(owner.id, fresh), 1);
    const uses = await pool.query('SELECT 1 FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2 AND purpose=$3', [owner.id, fresh, 'script']);
    assert.equal(uses.rowCount, 1);
  });

  await t.test('a base lookup that fails is ignored on a first save, but makes a save on a scripted video unavailable', async () => {
    // Ownership of the base's original video is unavailable; the target video is still owned.
    const flaky = createAssistantScriptSaver(createAssistantScripts(pool, async (account, conversation) => conversation === video ? { kind: 'unavailable', reason: 'native_storage' } : check(account, conversation)).save);
    const fresh = await client(owner).newVideo();
    const saved = await flaky(owner.id, fresh, { baseVersionId: second, content: script('Mara wades in.') });
    assert.ok(saved.kind === 'saved' && saved.revision === 1, JSON.stringify(saved));
    assert.deepEqual(await flaky(owner.id, fresh, { baseVersionId: second, content: script('Mara wades back.') }), { kind: 'unavailable' });
    assert.equal(await versions(owner.id, fresh), 1); assert.deepEqual(await current(fresh), [saved.versionId, saved.versionId, 'draft']);
  });

  await t.test('the base is the version in use: after Use this version on v1, v2 is stale and v1 saves version 3', async () => {
    await createVersionUses(pool, check).useVersion(owner.id, video, { operationId: randomUUID(), versionId: first, purpose: 'script' });
    assert.deepEqual(await saveScript(owner.id, video, { baseVersionId: second, content: script('Mara turns back.') }), { kind: 'stale' });
    const third = await saveScript(owner.id, video, { baseVersionId: first, content: script('Mara floats.') });
    assert.ok(third.kind === 'saved' && third.revision === 3, JSON.stringify(third));
    assert.equal(await versions(owner.id, video), 3); assert.deepEqual(await current(video), [third.versionId, third.versionId, 'draft']);
  });

  const gallery = (characters: string[]) => ({ schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters, script: [{ action: 'Mara holds the key.' }] }] });
  type Stored = { subjects?: { id: string; kind: string; name: string }[]; scenes: { characters: string[] }[] };
  const stored = async (video: string) => { const version = (await store.workspace(owner.id, video)).script!.version; return ('content' in version ? version.content : {}) as unknown as Stored; };

  await t.test('the script lists its subjects with server-made ids that a rename keeps, and refuses ids it never had', async () => {
    const fresh = await client(owner).newVideo();
    const made = await saveScript(owner.id, fresh, { baseVersionId: null, content: gallery([]), subjects: [{ id: '', kind: 'character', name: 'Mara' }, { id: '', kind: 'place', name: 'The Gallery' }, { id: ' ', kind: 'prop', name: 'The key' }] });
    assert.ok(made.kind === 'saved', JSON.stringify(made));
    assert.deepEqual((await stored(fresh)).subjects, [{ id: 'mara', kind: 'character', name: 'Mara' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }, { id: 'the-key', kind: 'prop', name: 'The key' }]);
    assert.deepEqual((await stored(fresh)).scenes[0]!.characters, ['Mara'], 'the server sets characters from the character subjects');
    const renamed = await saveScript(owner.id, fresh, { baseVersionId: made.versionId, content: gallery(['Mara']), subjects: [{ id: 'mara', kind: 'character', name: 'Mara Vale' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }, { id: 'the-key', kind: 'prop', name: 'The key' }] });
    assert.ok(renamed.kind === 'saved', JSON.stringify(renamed));
    assert.deepEqual((await stored(fresh)).subjects?.map(subject => [subject.id, subject.name]), [['mara', 'Mara Vale'], ['the-gallery', 'The Gallery'], ['the-key', 'The key']]);
    assert.deepEqual((await stored(fresh)).scenes[0]!.characters, ['Mara Vale']);
    assert.deepEqual(await saveScript(owner.id, fresh, { baseVersionId: renamed.versionId, content: gallery(['Ben']), subjects: [{ id: 'ben', kind: 'character', name: 'Ben' }] }), { kind: 'invalid', field: 'subjects' });
    // An empty list keeps the subjects while the characters match them.
    assert.deepEqual(await saveScript(owner.id, fresh, { baseVersionId: renamed.versionId, content: gallery(['Mara Vale', 'Ben']) }), { kind: 'subjects_differ' });
    const kept = await saveScript(owner.id, fresh, { baseVersionId: renamed.versionId, content: gallery(['Mara Vale']) });
    assert.ok(kept.kind === 'saved' && kept.revision === 3, JSON.stringify(kept));
    assert.deepEqual((await stored(fresh)).subjects?.map(subject => subject.id), ['mara', 'the-gallery', 'the-key']);
    assert.equal(await versions(owner.id, fresh), 3);
  });

  await t.test('a script saved before subjects existed stores its derived subjects on the next save, and a rename keeps their ids', async () => {
    const fresh = await client(owner).newVideo();
    const old = await store.insert({ accountId: owner.id, conversationId: fresh, kind: 'script', createdBy: 'human', dependencies: [], content: gallery(['Mara']), use: { binding: { purpose: 'script' }, state: 'draft' } });
    const next = await saveScript(owner.id, fresh, { baseVersionId: old.id, content: gallery(['Mara']) });
    assert.ok(next.kind === 'saved', JSON.stringify(next));
    assert.deepEqual((await stored(fresh)).subjects, [{ id: 'mara', kind: 'character', name: 'Mara' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }]);
    const renamed = await saveScript(owner.id, fresh, { baseVersionId: next.versionId, content: gallery(['Mara']), subjects: [{ id: 'mara', kind: 'character', name: 'Mara Vale' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }] });
    assert.ok(renamed.kind === 'saved', JSON.stringify(renamed));
    assert.deepEqual((await stored(fresh)).subjects?.map(subject => [subject.id, subject.name]), [['mara', 'Mara Vale'], ['the-gallery', 'The Gallery']]);
    // An old base's derived ids are the ones read-workspace listed, so they are kept on the first save that passes subjects too.
    const older = await client(owner).newVideo();
    const base = await store.insert({ accountId: owner.id, conversationId: older, kind: 'script', createdBy: 'human', dependencies: [], content: gallery(['Mara']), use: { binding: { purpose: 'script' }, state: 'draft' } });
    const passed = await saveScript(owner.id, older, { baseVersionId: base.id, content: gallery(['Mara']), subjects: [{ id: 'mara', kind: 'character', name: 'Mara Vale' }, { id: '', kind: 'prop', name: 'The key' }] });
    assert.ok(passed.kind === 'saved', JSON.stringify(passed));
    assert.deepEqual((await stored(older)).subjects?.map(subject => subject.id), ['mara', 'the-key']);
  });

  await t.test('an update-script turn with subjects saves them, and the next read-workspace turn lists them with their ids', async () => {
    const fresh = await client(owner).newVideo();
    const { lines, result } = await updateScript(owner, fresh, { baseVersionId: null, script: gallery([]), subjects: [{ id: 'null', kind: 'character', name: 'Mara' }, { id: '', kind: 'place', name: 'The Gallery' }, { id: '', kind: 'prop', name: 'The key' }] });
    assert.ok('saved' in result && result.saved, JSON.stringify(result));
    assert.deepEqual(lines.at(-1), ['Updating the script…', 'done', 'Saved version 1']);
    provider.reset();
    provider.script({ toolCalls: [{ name: 'read-workspace', args: {} }] }, { text: ['Read it'] });
    const turn = await client(owner).turn(fresh, 'What are the subjects?');
    assert.ok(completed(turn), JSON.stringify(turn.terminal));
    const content = (provider.requests[1]!.body as { messages: { role: string; content: unknown }[] }).messages.findLast(message => message.role === 'tool')?.content;
    const listing = (typeof content === 'string' ? JSON.parse(content) : content) as { subjects?: unknown };
    assert.deepEqual(listing.subjects, [{ id: 'mara', kind: 'character', name: 'Mara' }, { id: 'the-gallery', kind: 'place', name: 'The Gallery' }, { id: 'the-key', kind: 'prop', name: 'The key' }]);
  });
});

type ImageResult = { made: true; images: { versionId: string; label: string; width: number; height: number }[]; failed: number; showInChat: boolean } | { made: false; reason: string; message: string };

// generate-image through real turns: the fake Meta answers, and storage and the real decode check and keep the images.
test('generate-image makes images with Meta and saves each as a draft image of the run\'s own video', { timeout: 300000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const meta = await metaImageFake(); t.after(meta.close);
  const { storage, media } = testStack();
  const fixture = await accountBrowserFixture({ artifacts: true, storage, media: media.toolchain, composition: chatComposition(provider, {}, { url: meta.url }) });
  const pool = new Pool({ connectionString: fixture.servingUrl, max: 2 });
  t.after(async () => { await pool.end(); await fixture.close(); });
  const store = createArtifactStore(pool, createOwnedConversationCheck(fixture.native));
  const [owner, other] = [await fixture.auth.createAccount(), await fixture.auth.createAccount()];
  const clients = new Map(await Promise.all([owner, other].map(async user => [user.id, nativeTurnClient(fixture.apiOrigin, await fixture.accessToken(user), user.id)] as const)));
  const client = (user: { id: string }) => clients.get(user.id)!;
  t.beforeEach(() => { provider.reset(); meta.reset(); });

  /** One turn in which the model calls generate-image with `args`; returns what the tool gave the model and the activity lines. */
  const generate = async (user: { id: string }, video: string, args: Record<string, unknown>) => {
    provider.script({ toolCalls: [{ name: 'generate-image', args }] }, { text: ['Done'] });
    const turn = await client(user).turn(video, 'Make an image');
    assert.ok(completed(turn), JSON.stringify(turn.terminal));
    const messages = (provider.requests[1]!.body as { messages: { role: string; content: unknown }[] }).messages;
    const content = messages.findLast(message => message.role === 'tool')?.content;
    assert.ok(content !== undefined, 'tool result sent to the model');
    assert.ok(!JSON.stringify(provider.requests).includes('iVBORw0KGgo'), 'no image bytes reach the model');
    const lines = turn.chunks.filter(chunk => chunk.type === 'tool-activity').map(chunk => [chunk.payload?.phrase, chunk.payload?.state, chunk.payload?.summary]);
    return { lines, result: (typeof content === 'string' ? JSON.parse(content) : content) as ImageResult };
  };
  const made = async (video: string) => (await pool.query<{ version_id: string; created_by: string; provenance: string }>("SELECT version_id,created_by,provenance FROM artifacts.versions WHERE origin_conversation_id=$1 AND kind='image' ORDER BY publication_revision", [video])).rows;
  const video = await client(owner).newVideo(), foreignVideo = await client(other).newVideo();
  const tools = { enable_image_search: false, enable_web_search: false, enable_shell: false };

  await t.test('generate with options: Meta gets the request, both images are saved as drafts, and only ids reach the model', async () => {
    const { lines, result } = await generate(owner, video, { prompt: 'A quiet gallery bench', count: 2, size: '1536x1024', reasoning: 'low', imageSearch: false, webSearch: false, shell: false });
    assert.equal(meta.requests.length, 1); assert.equal(meta.requests[0]!.path, '/v1/images/generations');
    assert.deepEqual(meta.requests[0]!.body, { model: 'muse-image-1.0', prompt: 'A quiet gallery bench', response_format: 'b64_json', n: 2, size: '1536x1024', output_format: 'png', reasoning_strength: 'low', tool_enablement: tools });
    const rows = await made(video);
    assert.deepEqual(rows.map(row => [row.created_by, row.provenance]), [['assistant', 'assistant'], ['assistant', 'assistant']]);
    assert.deepEqual(result, { made: true, failed: 0, showInChat: false, images: rows.map((row, index) => ({ versionId: row.version_id, label: `Image ${index + 1} · Version 1`, width: 64, height: 48 })) });
    assert.deepEqual(lines, [['Making 2 images…', 'running', undefined], ['Making 2 images…', 'done', 'Saved 2 images']]);
    assert.deepEqual((await store.workspace(owner.id, video)).assets.map(asset => asset.state), ['Draft', 'Draft']);
    // Saved history projects the same phrase from the stored arguments.
    const response = await fetch(`${fixture.apiOrigin}/memory/threads/${video}/messages?page=0&perPage=20`, { headers: { Authorization: `Bearer ${await fixture.accessToken(owner)}` } });
    const saved = (await response.json() as { messages: { content: { parts: Record<string, unknown>[] } }[] }).messages.flatMap(message => message.content.parts).filter(part => part.type === 'tool-activity');
    assert.deepEqual(saved.map(part => [part.phrase, part.summary]), [['Making 2 images…', 'Saved 2 images']]);
    // The model is offered no nullable field.
    const offered = (provider.requests[0]!.body as { tools: { function: { name: string; parameters: unknown } }[] }).tools.find(entry => entry.function.name === 'generate-image');
    assert.ok(offered); assert.ok(!JSON.stringify(offered.function.parameters).includes('"null"'));
  });

  await t.test('edit: an image the video uses goes to Meta as its exact bytes, with Meta\'s defaults, and becomes a dependency', async () => {
    const [input] = await made(video);
    const { lines, result } = await generate(owner, video, { prompt: 'The same bench at dusk', inputImages: [input!.version_id], showInChat: true });
    assert.equal(meta.requests[0]!.path, '/v1/images/edits');
    assert.deepEqual(meta.requests[0]!.body, { model: 'muse-image-1.0', prompt: 'The same bench at dusk', response_format: 'b64_json', n: 1, size: 'auto', output_format: 'png', reasoning_strength: 'high',
      tool_enablement: { enable_image_search: true, enable_web_search: true, enable_shell: true }, images: [{ image_url: `data:image/png;base64,${testPng({ seed: 1 }).toString('base64')}` }] });
    assert.ok(result.made && result.showInChat);
    assert.deepEqual((await store.version(owner.id, result.images[0]!.versionId)).dependencies, [input!.version_id]);
    assert.deepEqual(lines.at(-1), ['Making an image…', 'done', 'Saved Image 3 · Version 1']);
  });

  await t.test('an edit that revises one image is its next version in the same place; variations stay new images', async () => {
    const fresh = await client(owner).newVideo();
    // `generate` reads the turn's result from the provider's second request, so each turn starts from a reset.
    const turn = (args: Record<string, unknown>) => { provider.reset(); meta.reset(); return generate(owner, fresh, args); };
    await turn({ prompt: 'A quiet gallery bench' });
    const [first] = await made(fresh);
    const before = (await store.workspace(owner.id, fresh)).assets;
    const { lines, result } = await turn({ prompt: 'The same bench at dusk', inputImages: [first!.version_id], revises: first!.version_id });
    assert.ok(result.made);
    const revised = await store.version(owner.id, result.images[0]!.versionId);
    assert.equal(revised.artifactId, before[0]!.version.artifactId); assert.equal(revised.revision, 2);
    assert.deepEqual(revised.dependencies, [first!.version_id]);
    const after = (await store.workspace(owner.id, fresh)).assets;
    assert.deepEqual(after.map(asset => [asset.use?.id, asset.version.id, asset.state]), [[before[0]!.use?.id, revised.id, 'Draft']]);
    assert.deepEqual(lines.at(-1), ['Making an image…', 'done', 'Saved Image 1 · Version 2']);
    // With count above 1, or revises not among the inputs, each result is a new image.
    const variations = await turn({ prompt: 'Two takes at dusk', inputImages: [revised.id], revises: revised.id, count: 2 });
    const stray = await turn({ prompt: 'Another bench', revises: revised.id });
    assert.ok(variations.result.made && stray.result.made);
    const assets = (await store.workspace(owner.id, fresh)).assets;
    assert.equal(assets.length, 4); assert.equal(new Set(assets.map(asset => asset.version.artifactId)).size, 4);
    assert.deepEqual(stray.lines.at(-1), ['Making an image…', 'done', 'Saved Image 4 · Version 1']);
  });

  await t.test('another account\'s image is not found, and nothing is sent to Meta', async () => {
    const [input] = await made(video);
    const { lines, result } = await generate(other, foreignVideo, { prompt: 'Borrow it', inputImages: [input!.version_id] });
    assert.ok(!result.made && result.reason === 'input_not_found', JSON.stringify(result));
    assert.deepEqual(lines.at(-1), ['Making an image…', 'done', 'Not made: an input image wasn’t found']);
    assert.equal(meta.requests.length, 0); assert.deepEqual(await made(foreignVideo), []);
  });

  await t.test('a content-policy refusal says so and saves nothing', async () => {
    meta.script({ status: 400, error: { type: 'invalid_request_error', code: 'content_policy_violation', message: 'refused' } });
    const fresh = await client(owner).newVideo();
    const { lines, result } = await generate(owner, fresh, { prompt: 'Something refused' });
    assert.deepEqual(await made(fresh), []);
    assert.ok(!result.made && result.reason === 'content_policy');
    assert.deepEqual(lines.at(-1), ['Making an image…', 'done', 'Not made: the request was refused']);
    assert.equal((await made(video)).length, 3);
  });
});

// Composition without storage or the media checker supplies no image client: a paid image would be lost, so none is asked for.
test('generate-image on a server that can\'t save images refuses before any call to Meta', { timeout: 300000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const meta = await metaImageFake(); t.after(meta.close);
  const fixture = await accountBrowserFixture({ artifacts: true, composition: chatComposition(provider, {}, { url: meta.url }) });
  t.after(fixture.close);
  const user = await fixture.auth.createAccount();
  const client = nativeTurnClient(fixture.apiOrigin, await fixture.accessToken(user), user.id);
  const video = await client.newVideo();
  provider.script({ toolCalls: [{ name: 'generate-image', args: { prompt: 'A quiet gallery bench' } }] }, { text: ['Done'] });
  const turn = await client.turn(video, 'Make an image');
  assert.ok(completed(turn), JSON.stringify(turn.terminal));
  const content = (provider.requests[1]!.body as { messages: { role: string; content: unknown }[] }).messages.findLast(message => message.role === 'tool')?.content;
  const result = (typeof content === 'string' ? JSON.parse(content) : content) as ImageResult;
  assert.ok(!result.made && result.reason === 'unsaveable', JSON.stringify(result));
  assert.equal(meta.requests.length, 0);
  assert.deepEqual(turn.chunks.filter(chunk => chunk.type === 'tool-activity').at(-1)?.payload?.summary, 'Not made: images can’t be saved on this server');
});

type VideoResult = { made: true; jobId: string; showInChat: boolean; video: { versionId: string; label: string; width: number; height: number; durationS: number } }
  | { made: false; reason: string; message: string; jobId?: string };
type Job = { request_id: string; status: string; task_id: string | null; failure_reason: string | null; result_version_id: string | null; inputs: string[] };

const pollDeadlineMs = 1000;
const released = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
async function until<T>(read: () => Promise<T>, done: (value: T) => boolean, what: string, ms = 20000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() - started > ms) throw new Error(`Timed out waiting for ${what}: ${JSON.stringify(value)}`);
    await wait(50);
  }
}

// generate-video through real turns: the fake MiniMax answers, and storage and the real decode check save the clip.
test('generate-video makes one MiniMax video, waits for it and saves it as the video\'s draft clip', { timeout: 600000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const meta = await metaImageFake(); t.after(meta.close);
  const minimax = await miniMaxVideoFake({ clip: await generatedClip() }); t.after(minimax.close);
  const { storage, media } = testStack();
  const fixture = await accountBrowserFixture({ artifacts: true, storage, media: media.toolchain,
    composition: chatComposition(provider, {}, { url: meta.url }, {}, { url: minimax.url, timing: { pollIntervalMs: 50, pollDeadlineMs }, submitTimeoutMs: 1500 }) });
  const pool = new Pool({ connectionString: fixture.servingUrl, max: 2 });
  const setup = new Pool({ connectionString: fixture.setupUrl, max: 1 });
  t.after(async () => { await pool.end(); await setup.end(); await fixture.close(); });
  const store = createArtifactStore(pool, createOwnedConversationCheck(fixture.native));
  const [owner, other] = [await fixture.auth.createAccount(), await fixture.auth.createAccount()];
  let origin = fixture.apiOrigin;
  const tokens = new Map(await Promise.all([owner, other].map(async user => [user.id, await fixture.accessToken(user)] as const)));
  const client = (user: { id: string }) => nativeTurnClient(origin, tokens.get(user.id)!, user.id);
  t.beforeEach(() => { provider.reset(); meta.reset(); minimax.reset(); });

  const lines = (turn: ObservedTurn) => turn.chunks.filter(chunk => chunk.type === 'tool-activity' && chunk.payload?.tool === 'generate-video').map(chunk => [chunk.payload?.phrase, chunk.payload?.state, chunk.payload?.summary]);
  const toolResult = () => {
    const content = (provider.requests[1]!.body as { messages: { role: string; content: unknown }[] }).messages.findLast(message => message.role === 'tool')?.content;
    assert.ok(content !== undefined, 'tool result sent to the model');
    return (typeof content === 'string' ? JSON.parse(content) : content) as VideoResult;
  };
  /** One completed turn in which the model calls generate-video with `args`. */
  const generate = async (user: { id: string }, video: string, args: Record<string, unknown>) => {
    provider.reset();
    provider.script({ toolCalls: [{ name: 'generate-video', args }] }, { text: ['Done'] });
    const turn = await client(user).turn(video, 'Make a video', 60000);
    assert.ok(completed(turn), JSON.stringify(turn.terminal));
    return { turn, result: toolResult(), lines: lines(turn) };
  };
  /** One completed turn in which the model calls read-workspace; returns the stopped videos it was given. */
  const readStopped = async (user: { id: string }, video: string) => {
    provider.reset();
    provider.script({ toolCalls: [{ name: 'read-workspace', args: {} }] }, { text: ['Found it'] });
    const turn = await client(user).turn(video, 'Can you resume the video?', 60000);
    assert.ok(completed(turn), JSON.stringify(turn.terminal));
    return toolResult() as unknown as { stoppedVideos?: { jobId: string; frames: string[] }[] };
  };
  /** Starts a turn that calls generate-video, and resolves its run id once accepted. */
  const running = (user: { id: string }, video: string, args: Record<string, unknown>, timeoutMs = 60000) => {
    provider.reset();
    provider.script({ toolCalls: [{ name: 'generate-video', args }] }, { text: ['Done'] });
    let accept!: (id: string) => void;
    const accepted = new Promise<string>(resolve => { accept = resolve; });
    return { accepted, turn: client(user).turn(video, 'Make a video', timeoutMs, id => accept(id)) };
  };
  const stop = (user: { id: string }, video: string, runId: string) => client(user).post('/api/agents/assistant/threads/abort', { threadId: video, resourceId: user.id, expectedRunId: runId, clearPendingSignals: false });
  const jobs = async (video: string) => (await pool.query<Job>('SELECT request_id,status,task_id,failure_reason,result_version_id,inputs FROM generation.requests WHERE conversation_id=$1 ORDER BY submitted_at', [video])).rows;
  const settled = (video: string, status: string) => until(() => jobs(video), rows => rows.length === 1 && rows[0]!.status === status, `a ${status} job`);
  const clips = async (user: { id: string }, video: string) => (await store.workspace(user.id, video)).generatedVideos ?? [];
  const historyLines = async (user: { id: string }, video: string) => {
    const response = await client(user).get(`/memory/threads/${video}/messages?page=0&perPage=20`);
    const body = await response.json() as { messages: { content: { parts: Record<string, unknown>[] } }[] };
    return body.messages.flatMap(message => message.content.parts).filter(part => part.type === 'tool-activity' && part.tool === 'generate-video').map(part => [part.state, part.summary]);
  };
  const queried = () => minimax.requests.filter(request => request.path.startsWith('/v2/query/')).length;

  await t.test('a prompt-only video is created once, polled, checked and saved as a draft clip', async () => {
    const video = await client(owner).newVideo();
    const { lines: line, result } = await generate(owner, video, { prompt: 'A slow push-in on a quiet gallery bench', showInChat: true });
    assert.equal(minimax.creates, 1);
    const create = minimax.requests[0]!;
    assert.equal(create.authorization, 'Bearer workprint-placeholder-minimax-key');
    assert.deepEqual(create.body, { model: 'MiniMax-H3', content: [{ type: 'text', text: 'A slow push-in on a quiet gallery bench' }], resolution: '768P', duration: 6, ratio: '16:9' });
    const [job] = await jobs(video);
    assert.ok(result.made, JSON.stringify(result));
    assert.deepEqual(result, { made: true, jobId: job!.request_id, showInChat: true, video: { versionId: job!.result_version_id, label: 'Video 1 · Version 1', width: 1344, height: 768, durationS: 4 } });
    assert.deepEqual([job!.status, job!.inputs], ['succeeded', []]); assert.match(job!.task_id ?? '', /^\d+$/);
    assert.deepEqual(line, [['Making a video…', 'running', undefined], ['Making a video…', 'done', 'Saved Video 1 · Version 1']]);
    const [clip] = await clips(owner, video);
    assert.equal(clip?.version.id, result.video.versionId); assert.equal(clip?.state, 'Draft');
    // The result URL is a credential: it never reaches the model.
    assert.ok(!JSON.stringify(provider.requests).includes('Signature'));
  });

  await t.test('a first-and-last-frame video sends both frames as data URLs and keeps them as dependencies', async () => {
    const video = await client(owner).newVideo();
    const pngs = [testPng({ width: 320, height: 256, seed: 3 }), testPng({ width: 320, height: 256, seed: 4 })];
    meta.script({ images: pngs });
    provider.script({ toolCalls: [{ name: 'generate-image', args: { prompt: 'Two stills', count: 2 } }] }, { text: ['Made'] });
    assert.ok(completed(await client(owner).turn(video, 'Make two stills')));
    const [first, last] = (await store.workspace(owner.id, video)).assets.map(asset => asset.version.id);
    const { result } = await generate(owner, video, { prompt: 'The light moves from one still to the next', firstFrame: first, lastFrame: last, ratio: '9:16' });
    assert.ok(result.made, JSON.stringify(result));
    assert.equal(minimax.creates, 1);
    const body = minimax.requests[0]!.body as { content: { type: string; image_url?: { url: string }; role?: string }[]; ratio: string };
    assert.equal(body.ratio, 'adaptive');
    assert.deepEqual(body.content.slice(1), pngs.map((png, index) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` }, role: index ? 'last_frame' : 'first_frame' })));
    assert.deepEqual((await store.version(owner.id, result.video.versionId)).dependencies, [first, last]);
    assert.equal(result.video.label, 'Video 1 · Version 1');
  });

  await t.test('Stop while polling interrupts the job with its task id; a resume next turn saves it with no second create', async () => {
    const video = await client(owner).newVideo();
    const gate = released();
    minimax.script.query({ task: 'running', after: gate.promise });
    const { accepted, turn } = running(owner, video, { prompt: 'A pan across the bench' });
    const runId = await accepted;
    await until(async () => queried(), count => count === 1, 'the first poll');
    assert.equal((await stop(owner, video, runId)).status, 200);
    const ended = await turn;
    gate.release();
    const [job] = await settled(video, 'interrupted');
    assert.ok(!completed(ended));
    assert.ok(job!.task_id); assert.equal(minimax.creates, 1);
    assert.deepEqual(await historyLines(owner, video), [['done', 'Stopped waiting for the video']]);
    const { result, lines: line } = await generate(owner, video, { resume: job!.request_id });
    assert.ok(result.made, JSON.stringify(result));
    assert.equal(minimax.creates, 1, 'a resume never creates');
    assert.deepEqual(line.at(-1), ['Making a video…', 'done', 'Saved Video 1 · Version 1']);
    // Resuming a saved job refuses with its label and calls nothing.
    const before = minimax.requests.length;
    const again = await generate(owner, video, { resume: job!.request_id });
    assert.ok(!again.result.made && again.result.reason === 'already_saved');
    assert.deepEqual(again.lines.at(-1), ['Making a video…', 'done', 'That video is already saved as Video 1 · Version 1']);
    assert.equal(minimax.requests.length, before);
  });

  await t.test('query errors keep polling; at the poll deadline the job is interrupted, and it resumes with one create', async () => {
    const video = await client(owner).newVideo();
    minimax.script.query({ status: 500 }, { status: 429 }, { status: 429 }, ...Array.from({ length: 200 }, () => ({ task: 'running' as const })));
    const { result, lines: line } = await generate(owner, video, { prompt: 'Rain on the gallery window' });
    assert.ok(!result.made && result.reason === 'stopped', JSON.stringify(result));
    assert.match(result.message, new RegExp(`resume set to "${result.jobId}"`));
    assert.deepEqual(line.at(-1), ['Making a video…', 'done', 'Stopped waiting for the video']);
    const [job] = await jobs(video);
    assert.equal(job!.status, 'interrupted'); assert.ok(queried() > 4, String(queried()));
    assert.equal(minimax.creates, 1);
    minimax.reset();
    // The fake forgot the task on reset; its next answers are scripted, as MiniMax still has it.
    minimax.script.query({ task: 'succeeded' });
    const resumed = await generate(owner, video, { resume: job!.request_id, prompt: 'ignored', firstFrame: randomUUID() });
    assert.ok(resumed.result.made, JSON.stringify(resumed.result));
    assert.equal(minimax.creates, 0);
  });

  await t.test('an expired job fails on resume with no call; another account\'s or an unknown job is not found', async () => {
    const video = await client(owner).newVideo(), jobId = randomUUID();
    // Only setup may backdate a job; it then moves along its real transitions.
    await setup.query(`INSERT INTO generation.requests(owner_id,request_id,conversation_id,purpose,prompt_sha256,status,submitted_at)
      VALUES($1,$2,$3,'video',repeat('a',64),'submitting',clock_timestamp() - interval '8 days')`, [owner.id, jobId, video]);
    const saved = createGenerationJobs(pool);
    await saved.started(owner.id, jobId, 'task-old'); await saved.interrupted(owner.id, jobId);
    const foreign = await generate(other, await client(other).newVideo(), { resume: jobId });
    assert.ok(!foreign.result.made && foreign.result.reason === 'not_found');
    assert.deepEqual(foreign.lines.at(-1), ['Making a video…', 'done', 'Couldn’t find that video job']);
    const unknown = await generate(owner, video, { resume: randomUUID() });
    assert.ok(!unknown.result.made && unknown.result.reason === 'not_found');
    const expired = await generate(owner, video, { resume: jobId });
    assert.ok(!expired.result.made && expired.result.reason === 'not_resumable');
    assert.deepEqual(expired.lines.at(-1), ['Making a video…', 'done', 'That video failed and can’t be resumed']);
    assert.deepEqual(minimax.requests, []);
    assert.deepEqual((await jobs(video)).map(job => [job.status, job.failure_reason]), [['failed', 'expired']]);
  });

  await t.test('Stop during a held create waits it out: the job is interrupted with that task id and one create', async () => {
    const video = await client(owner).newVideo();
    const gate = released();
    minimax.script.create({ taskId: 'held-create-1', after: gate.promise });
    const { accepted, turn } = running(owner, video, { prompt: 'A held create' });
    const runId = await accepted;
    await until(async () => minimax.creates, count => count === 1, 'the create');
    assert.equal((await stop(owner, video, runId)).status, 200);
    await wait(200);
    gate.release();
    await turn;
    const [job] = await settled(video, 'interrupted');
    assert.equal(job!.task_id, 'held-create-1'); assert.equal(minimax.creates, 1);
  });

  await t.test('a create that times out fails with an unknown outcome and is never sent again', async () => {
    const video = await client(owner).newVideo();
    minimax.script.create({ hang: true });
    const { result, lines: line } = await generate(owner, video, { prompt: 'A lost create' });
    assert.ok(!result.made && result.reason === 'outcome_unknown', JSON.stringify(result));
    assert.deepEqual(line.at(-1), ['Making a video…', 'done', 'Not made: MiniMax’s answer was lost']);
    assert.deepEqual((await jobs(video)).map(job => [job.status, job.failure_reason, job.task_id]), [['failed', 'outcome_unknown', null]]);
    assert.equal(minimax.creates, 1);
    const resumed = await generate(owner, video, { resume: result.jobId });
    assert.ok(!resumed.result.made && resumed.result.reason === 'not_resumable');
    assert.equal(minimax.creates, 1);
  });

  await t.test('a download stopped mid-way saves nothing; an unavailable download leaves the job resumable', async () => {
    const video = await client(owner).newVideo();
    const gate = released();
    minimax.script.download({ declare: (await generatedClip()).length, after: gate.promise });
    const { accepted, turn } = running(owner, video, { prompt: 'A late download' });
    const runId = await accepted;
    await until(async () => minimax.requests.filter(request => request.path.startsWith('/files/')).length, count => count === 1, 'the download');
    assert.equal((await stop(owner, video, runId)).status, 200);
    await turn;
    gate.release();
    await settled(video, 'interrupted');
    await wait(500);
    assert.deepEqual(await clips(owner, video), []);

    const unavailable = await client(owner).newVideo();
    minimax.reset(); minimax.script.download({ status: 503 });
    const { result, lines: line } = await generate(owner, unavailable, { prompt: 'An unavailable download' });
    assert.ok(!result.made && result.reason === 'stopped', JSON.stringify(result));
    assert.deepEqual(line.at(-1), ['Making a video…', 'done', 'Stopped waiting for the video']);
    assert.deepEqual((await jobs(unavailable)).map(job => job.status), ['interrupted']);
  });

  await t.test('MiniMax\'s failed task fails the job; a disconnected observer doesn\'t stop a job, which is saved', async () => {
    const video = await client(owner).newVideo();
    minimax.script.query({ task: 'failed', code: '1027' });
    const { result, lines: line } = await generate(owner, video, { prompt: 'A failed task' });
    assert.ok(!result.made && result.reason === 'task_failed', JSON.stringify(result));
    assert.deepEqual(line.at(-1), ['Making a video…', 'done', 'Not made: MiniMax couldn’t make the video']);
    assert.deepEqual((await jobs(video)).map(job => [job.status, job.failure_reason]), [['failed', 'provider_error']]);

    const watched = await client(owner).newVideo();
    const gate = released();
    minimax.reset(); minimax.script.download({ declare: (await generatedClip()).length, after: gate.promise });
    // The observer gives up after 1 s while the clip is still downloading.
    const { turn } = running(owner, watched, { prompt: 'Nobody is watching' }, 1000);
    const ended = await turn;
    assert.equal(ended.terminal, undefined);
    assert.equal(minimax.requests.filter(request => request.path.startsWith('/files/')).length, 1);
    gate.release();
    const [job] = await settled(watched, 'succeeded');
    assert.equal((await clips(owner, watched))[0]?.version.id, job!.result_version_id);
    await until(() => historyLines(owner, watched), saved => saved.length === 1 && saved[0]![1] === 'Saved Video 1 · Version 1', 'the saved line');
  });

  // Last: this restarts the server.
  await t.test('closing the server while polling leaves the job running; the next start interrupts it and a resume saves it', async () => {
    const video = await client(owner).newVideo();
    minimax.script.query({ hang: true });
    const { turn } = running(owner, video, { prompt: 'A restart' });
    await until(async () => queried(), count => count === 1, 'the first poll');
    await fixture.stopServer();
    await turn;
    assert.deepEqual((await jobs(video)).map(job => job.status), ['running']);
    origin = await fixture.restartServer();
    const [job] = await settled(video, 'interrupted');
    assert.equal(minimax.creates, 1);
    // No result in the history carries the id: the model finds it in read-workspace, as it would after a real restart.
    const listing = await readStopped(owner, video);
    assert.deepEqual(listing.stoppedVideos?.map(stopped => [stopped.jobId, stopped.frames]), [[job!.request_id, []]]);
    minimax.script.query({ task: 'succeeded' });
    const { result } = await generate(owner, video, { resume: listing.stoppedVideos![0]!.jobId });
    assert.ok(result.made, JSON.stringify(result));
    assert.equal(minimax.creates, 1);
    // Saved, it is no longer listed as stopped.
    assert.equal((await readStopped(owner, video)).stoppedVideos, undefined);
  });
});

// Composition without storage or the media checker supplies no video jobs: a paid video would be lost, so none is asked for.
test('generate-video on a server that can\'t save videos refuses before any call to MiniMax', { timeout: 300000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const minimax = await miniMaxVideoFake(); t.after(minimax.close);
  const fixture = await accountBrowserFixture({ artifacts: true, composition: chatComposition(provider, {}, undefined, {}, { url: minimax.url }) });
  t.after(fixture.close);
  const user = await fixture.auth.createAccount();
  const client = nativeTurnClient(fixture.apiOrigin, await fixture.accessToken(user), user.id);
  provider.script({ toolCalls: [{ name: 'generate-video', args: { prompt: 'A bench' } }] }, { text: ['Done'] });
  const turn = await client.turn(await client.newVideo(), 'Make a video');
  assert.ok(completed(turn), JSON.stringify(turn.terminal));
  assert.equal(turn.chunks.filter(chunk => chunk.type === 'tool-activity').at(-1)?.payload?.summary, 'Not made: videos can’t be saved on this server');
  assert.deepEqual(minimax.requests, []);
});

type SheetView = { view: string; versionId: string };
type SheetResult = { made: true; sheet: { versionId: string; label: string }; views: SheetView[]; given: number; landed: number; missing: { view: string; reason: string; message: string }[] }
  | { made: false; reason: string; summary: string; message: string; kept?: SheetView[] };
type SheetContent = { schemaVersion: 1; subject: { id: string; kind: string; name: string; description: string; continuityNotes: string[] }; references: (SheetView & { notes: string[] })[] };

// generate-sheet through real turns over a script that lists Mara and the Gallery: the fake Meta answers, and storage
// and the real decode check keep each view. Every request the fake records is one paid image in production.
test('generate-sheet makes a script subject\'s views one at a time with Meta and saves them as its draft sheet', { timeout: 300000 }, async t => {
  const provider = await scriptedProvider(); t.after(provider.close);
  const meta = await metaImageFake(); t.after(meta.close);
  const { storage, media } = testStack();
  const fixture = await accountBrowserFixture({ artifacts: true, storage, media: media.toolchain, composition: chatComposition(provider, {}, { url: meta.url }) });
  const pool = new Pool({ connectionString: fixture.servingUrl, max: 2 });
  t.after(async () => { await pool.end(); await fixture.close(); });
  const check = createOwnedConversationCheck(fixture.native), store = createArtifactStore(pool, check);
  const saveScript = createAssistantScriptSaver(createAssistantScripts(pool, check).save);
  const person = createArtifactWriters(pool, check).human;
  const [owner, other] = [await fixture.auth.createAccount(), await fixture.auth.createAccount()];
  const clients = new Map(await Promise.all([owner, other].map(async user => [user.id, nativeTurnClient(fixture.apiOrigin, await fixture.accessToken(user), user.id)] as const)));
  const client = (user: { id: string }) => clients.get(user.id)!;

  const toolResult = () => {
    const content = (provider.requests[1]!.body as { messages: { role: string; content: unknown }[] }).messages.findLast(message => message.role === 'tool')?.content;
    assert.ok(content !== undefined, 'tool result sent to the model');
    return (typeof content === 'string' ? JSON.parse(content) : content) as SheetResult;
  };
  const sheetLines = (turn: ObservedTurn) => turn.chunks.filter(chunk => chunk.type === 'tool-activity' && chunk.payload?.tool === 'generate-sheet');
  /** Starts a turn in which the model calls generate-sheet with `args`; the fake Meta answers `steps` first. */
  const running = (user: { id: string }, video: string, args: Record<string, unknown>, steps: FakeImageStep[] = []) => {
    provider.reset(); meta.reset(); meta.script(...steps);
    provider.script({ toolCalls: [{ name: 'generate-sheet', args }] }, { text: ['Done'] });
    let accept!: (id: string) => void;
    const accepted = new Promise<string>(resolve => { accept = resolve; });
    return { accepted, turn: client(user).turn(video, 'Make a sheet', 60000, id => accept(id)) };
  };
  /** One completed generate-sheet turn: what the tool gave the model and its activity lines. */
  const sheet = async (user: { id: string }, video: string, args: Record<string, unknown>, steps: FakeImageStep[] = []) => {
    const turn = await running(user, video, args, steps).turn;
    assert.ok(completed(turn), JSON.stringify(turn.terminal));
    return { result: toolResult(), lines: sheetLines(turn).map(chunk => [chunk.payload?.phrase, chunk.payload?.state, chunk.payload?.summary]), media: sheetLines(turn).at(-1)?.payload?.media };
  };
  /** Images made with generate-image in one turn, in order. */
  const images = async (user: { id: string }, video: string, count = 1) => {
    provider.reset(); meta.reset();
    provider.script({ toolCalls: [{ name: 'generate-image', args: { prompt: 'A photo of Mara', count } }] }, { text: ['Done'] });
    assert.ok(completed(await client(user).turn(video, 'Make an image')));
    return (await made(video)).slice(-count).map(row => row.version_id);
  };
  const made = async (video: string) => (await pool.query<{ version_id: string }>("SELECT version_id FROM artifacts.versions WHERE origin_conversation_id=$1 AND kind='image' ORDER BY publication_revision", [video])).rows;
  const sheetVersions = async (video: string) => Number((await pool.query<{ count: string }>("SELECT count(*) FROM artifacts.versions WHERE origin_conversation_id=$1 AND kind='reference'", [video])).rows[0]!.count);
  /** The subject's current sheet: the version the video uses, its use and its content. */
  const sheetOf = async (video: string, subject = 'mara') => {
    for (const asset of (await store.workspace(owner.id, video)).assets) {
      if (asset.version.kind !== 'reference' || !('content' in asset.version)) continue;
      const content = asset.version.content as unknown as SheetContent;
      if (content.subject.id === subject) return { version: asset.version, use: asset.use, content };
    }
    return undefined;
  };
  const gallery = { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'The Gallery', time: 'night' }, characters: [], script: [{ action: 'Mara waits.' }] }] };
  /** A new video whose script lists Mara and the Gallery. */
  const scripted = async () => {
    const video = await client(owner).newVideo();
    const saved = await saveScript(owner.id, video, { baseVersionId: null, content: gallery, subjects: [{ id: '', kind: 'character', name: 'Mara' }, { id: '', kind: 'place', name: 'The Gallery' }] });
    assert.equal(saved.kind, 'saved', JSON.stringify(saved));
    return video;
  };
  const view = (name: string) => ({ view: name, prompt: `${name}, standing still` });
  const mara = (views: unknown[], extra: Record<string, unknown> = {}) => ({ subject: 'mara', description: 'A courier in a long grey coat.', continuityNotes: ['Keep the grey coat.'], views, ...extra });
  const png = (seed: number) => `data:image/png;base64,${testPng({ seed }).toString('base64')}`;
  const keep = 'Keep the same person as the input image: the same face, build, hair and clothing.';
  const frame = (name: string) => `One reference view of Mara, a character, for a reference sheet: ${name}. A courier in a long grey coat. Keep consistent: Keep the grey coat.`;
  const references = (content: SheetContent | undefined) => content?.references.map(reference => [reference.versionId, reference.view]);
  const maraVideo = await scripted();

  await t.test('a new sheet: views made in order, the first from its prompt and the rest keeping it, saved as one draft sheet', async () => {
    const { result, lines, media: shown } = await sheet(owner, maraVideo, mara([view('Full-body front'), view('Three-quarter'), view('Face close-up')]));
    assert.ok(result.made, JSON.stringify(result));
    assert.deepEqual(meta.requests.map(request => [request.path, request.body.n, request.body.images]), [
      ['/v1/images/generations', 1, undefined], ['/v1/images/edits', 1, [{ image_url: png(1) }]], ['/v1/images/edits', 1, [{ image_url: png(1) }]]]);
    const prompts = meta.requests.map(request => String(request.body.prompt));
    assert.ok(prompts[0]!.startsWith(frame('Full-body front')), prompts[0]);
    assert.ok(prompts[1]!.startsWith(`${keep}\n\n${frame('Three-quarter')}`), prompts[1]);
    assert.ok(prompts[2]!.startsWith(`${keep}\n\n${frame('Face close-up')}`) && prompts[2]!.endsWith('Face close-up, standing still'), prompts[2]);
    const saved = await sheetOf(maraVideo);
    assert.deepEqual([saved?.version.id, saved?.version.revision, saved?.version.createdBy, saved?.use?.state], [result.sheet.versionId, 1, 'assistant', 'draft']);
    assert.deepEqual(references(saved?.content), result.views.map(item => [item.versionId, item.view]));
    assert.deepEqual(result.views.map(item => item.view), ['Full-body front', 'Three-quarter', 'Face close-up']);
    assert.deepEqual((await store.version(owner.id, result.sheet.versionId)).dependencies, result.views.map(item => item.versionId));
    const [first, ...rest] = result.views;
    assert.deepEqual((await store.version(owner.id, first!.versionId)).dependencies, []);
    for (const item of rest) assert.deepEqual((await store.version(owner.id, item.versionId)).dependencies, [first!.versionId]);
    assert.deepEqual(lines, [['Making a reference sheet…', 'running', undefined], ['Making a reference sheet…', 'done', 'Saved Mara · Version 1']]);
    assert.deepEqual(shown, result.views.map(item => ({ kind: 'image', versionId: item.versionId })));
    // The next read-workspace turn lists Mara with her sheet's views, and the views aren't items again.
    provider.reset();
    provider.script({ toolCalls: [{ name: 'read-workspace', args: {} }] }, { text: ['Read it'] });
    assert.ok(completed(await client(owner).turn(maraVideo, 'What does Mara have?')));
    const listing = toolResult() as unknown as { subjects: { id: string; sheet?: unknown }[]; items: { name: string; versionId: string }[] };
    assert.deepEqual(listing.subjects.find(subject => subject.id === 'mara')?.sheet, { versionId: result.sheet.versionId, views: result.views });
    assert.deepEqual(listing.items.map(item => item.name), ['Script · Version 1', 'Mara · Version 1']);
  });

  await t.test('a next version redoes a view by its name in place, keeping the base\'s spelling and its first view as the identity', async () => {
    const before = await sheetOf(maraVideo);
    const { result, lines } = await sheet(owner, maraVideo, mara([view('face close-up ')]));
    assert.ok(result.made, JSON.stringify(result));
    assert.deepEqual(meta.requests.map(request => [request.path, request.body.images]), [['/v1/images/edits', [{ image_url: png(1) }]]]);
    const after = await sheetOf(maraVideo);
    assert.deepEqual([after?.use?.id, after?.version.artifactId, after?.version.revision], [before?.use?.id, before?.version.artifactId, 2]);
    const [front, side, face] = before!.content.references;
    assert.deepEqual(references(after?.content), [[front!.versionId, 'Full-body front'], [side!.versionId, 'Three-quarter'], [result.views[2]!.versionId, 'Face close-up']]);
    assert.notEqual(result.views[2]!.versionId, face!.versionId);
    assert.deepEqual(lines.at(-1), ['Making a reference sheet…', 'done', 'Saved Mara · Version 2']);
  });

  await t.test('a failed redo keeps the sheet as it was, and a call past 5 views sends nothing', async () => {
    const { result, lines } = await sheet(owner, maraVideo, mara([view('Three-quarter')]), [{ status: 400, error: { type: 'invalid_request_error', code: 'content_policy_violation', message: 'refused' } }]);
    assert.ok(!result.made && result.reason === 'content_policy', JSON.stringify(result));
    assert.deepEqual(lines.at(-1), ['Making a reference sheet…', 'done', 'Not made: the request was refused']);
    assert.equal((await sheetOf(maraVideo))?.version.revision, 2); assert.equal(await sheetVersions(maraVideo), 2);
    const full = await sheet(owner, maraVideo, mara([view('Hands'), view('Back'), view('Side')]));
    assert.deepEqual(full.lines.at(-1), ['Making a reference sheet…', 'done', 'Not made: a sheet holds at most 5 views']);
    assert.equal(meta.requests.length, 0);
  });

  await t.test('identity keeps every made view to a given image that stays out of the sheet; a view with image makes nothing', async () => {
    const video = await scripted();
    const [photo, existing] = await images(owner, video, 2);
    const { result } = await sheet(owner, video, mara([view('Front'), { view: 'Coat', image: existing }, view('Face')], { identity: photo }));
    assert.ok(result.made, JSON.stringify(result));
    assert.deepEqual(meta.requests.map(request => [request.path, request.body.images]), [['/v1/images/edits', [{ image_url: png(1) }]], ['/v1/images/edits', [{ image_url: png(1) }]]]);
    for (const request of meta.requests) assert.ok(String(request.body.prompt).startsWith(keep));
    assert.deepEqual(result.views.map(item => item.view), ['Front', 'Coat', 'Face']); assert.equal(result.views[1]!.versionId, existing);
    assert.ok(!result.views.some(item => item.versionId === photo));
    for (const item of [result.views[0]!, result.views[2]!]) assert.deepEqual((await store.version(owner.id, item.versionId)).dependencies, [photo]);
    // That image is in Mara's sheet only.
    const gallerySheet = await sheet(owner, video, { ...mara([{ view: 'Wide', image: existing }]), subject: 'the-gallery' });
    assert.deepEqual(gallerySheet.lines.at(-1), ['Making a reference sheet…', 'done', 'Not made: that image is already in Mara’s sheet']);
    assert.equal(meta.requests.length, 0);
  });

  await t.test('each refusal before a paid call sends nothing to Meta', async () => {
    const [theirs] = await images(other, await client(other).newVideo());
    const capped = await scripted();
    const [one] = await images(owner, capped);
    await pool.query(`INSERT INTO artifacts.conversation_uses(owner_id,conversation_id,use_id,version_id,binding,purpose,state)
      SELECT $1,$2,gen_random_uuid()::text,$3,jsonb_build_object('purpose','reference','role','extra-'||n),'reference','draft' FROM generate_series(1,98) n`, [owner.id, capped, one]);
    const unscripted = await client(owner).newVideo();
    const cases: [string, Record<string, unknown>, string][] = [
      [unscripted, mara([view('Front')]), 'Not made: there is no script yet; write it first'],
      [maraVideo, { ...mara([view('Front')]), subject: 'ben' }, 'Not made: that subject isn’t in the script'],
      [maraVideo, mara([view('Hands')], { identity: theirs }), 'Not made: an image wasn’t found'],
      [maraVideo, mara(['Hands', 'Back', 'Side', 'Top', 'Feet', 'Coat'].map(view)), 'Not made: the sheet wasn’t valid'],
      [capped, mara([view('Front')]), 'Not made: this video has too many saved items'],
    ].map(([video, args, line]) => [video as string, args as Record<string, unknown>, line as string]);
    for (const [video, args, line] of cases) {
      const { lines } = await sheet(owner, video, args);
      assert.deepEqual(lines.at(-1), ['Making a reference sheet…', 'done', line]);
      assert.equal(meta.requests.length, 0, line);
    }
    // A person's sheet with more than 5 views is read but not revised.
    const six = await images(owner, unscripted, 6);
    const listed = await saveScript(owner.id, unscripted, { baseVersionId: null, content: gallery, subjects: [{ id: '', kind: 'character', name: 'Mara' }] });
    assert.equal(listed.kind, 'saved');
    await store.insert({ accountId: owner.id, conversationId: unscripted, kind: 'reference', createdBy: 'human', dependencies: six, use: { binding: { purpose: 'reference' }, state: 'draft' },
      content: { schemaVersion: 1, subject: { id: 'mara', kind: 'character', name: 'Mara', description: 'Drawn by hand.', continuityNotes: ['n'] }, references: six.map((versionId, index) => ({ versionId, view: `View ${index + 1}`, notes: [] })) } });
    const long = await sheet(owner, unscripted, mara([view('View 1')]));
    assert.deepEqual(long.lines.at(-1), ['Making a reference sheet…', 'done', 'Not made: Mara’s sheet has over 5 views; trim it first']);
    assert.equal(meta.requests.length, 0);
  });

  await t.test('a first view that fails saves nothing and makes no more; a later one leaves the sheet without it', async () => {
    const video = await scripted();
    const refused = { status: 400, error: { type: 'invalid_request_error', code: 'content_policy_violation', message: 'refused' } };
    const first = await sheet(owner, video, mara([view('Front'), view('Side'), view('Face')]), [refused]);
    assert.deepEqual(first.lines.at(-1), ['Making a reference sheet…', 'done', 'Not made: the request was refused']);
    assert.equal(meta.requests.length, 1); assert.deepEqual(await made(video), []); assert.equal(await sheetVersions(video), 0);
    const third = await sheet(owner, video, mara([view('Front'), view('Side'), view('Face')]), [{ images: [testPng({ seed: 11 })] }, { images: [testPng({ seed: 12 })] }, refused]);
    assert.ok(third.result.made, JSON.stringify(third.result));
    assert.deepEqual(third.result.views.map(item => item.view), ['Front', 'Side']);
    assert.deepEqual(third.result.missing.map(item => [item.view, item.reason]), [['Face', 'content_policy']]);
    assert.deepEqual(third.lines.at(-1), ['Making a reference sheet…', 'done', 'Saved Mara · Version 1 · 2 of 3 views']);
  });

  await t.test('a person\'s revision while a view is being made makes the save stale; the made views are kept as draft images', async () => {
    const video = await scripted();
    const base = await sheet(owner, video, mara([view('Full-body front'), view('Face close-up')]));
    assert.ok(base.result.made);
    const gate = released();
    const { turn } = running(owner, video, mara([view('Full-body front'), view('Face close-up'), view('Hands')]), [{ images: [testPng({ seed: 21 })] }, { images: [testPng({ seed: 22 })] }, { hold: gate.promise }]);
    await until(async () => meta.requests.length, count => count === 3, 'the third view\'s request');
    const current = (await sheetOf(video))!;
    await person.save(owner.id, video, { operationId: randomUUID(), artifactId: current.version.artifactId, baseVersionId: current.version.id, kind: 'reference', intendedUse: { purpose: 'reference' },
      content: { ...current.content, subject: { ...current.content.subject, description: 'Revised by hand.' } }, dependencies: current.content.references.map(reference => reference.versionId) });
    gate.release();
    const ended = await turn;
    assert.ok(completed(ended), JSON.stringify(ended.terminal));
    const result = toolResult();
    assert.ok(!result.made && result.reason === 'stale', JSON.stringify(result));
    assert.deepEqual(result.kept?.map(item => item.view), ['Full-body front', 'Face close-up', 'Hands']);
    const images = (await made(video)).map(row => row.version_id);
    assert.equal(images.length, 5); assert.equal(await sheetVersions(video), 2);
    assert.deepEqual(result.kept?.map(item => item.versionId), images.slice(2), 'the kept ids are the saved draft images');
    const states = (await pool.query<{ state: string }>('SELECT state FROM artifacts.conversation_uses WHERE version_id = ANY($1::text[])', [images.slice(2)])).rows.map(row => row.state);
    assert.deepEqual(states, ['draft', 'draft', 'draft']);
    assert.equal((await sheetOf(video))?.content.subject.description, 'Revised by hand.');
    assert.equal(sheetLines(ended).at(-1)?.payload?.summary, 'Not saved: the sheet changed; views kept as images');
  });

  await t.test('Stop while a view is being made ends the line incomplete: views saved before it stay, and no sheet is saved', async () => {
    const video = await scripted();
    const { accepted, turn } = running(owner, video, mara([view('Front'), view('Side'), view('Face')]), [{ images: [testPng({ seed: 31 })] }, { hang: true }]);
    const runId = await accepted;
    await until(async () => meta.requests.length, count => count === 2, 'the second view\'s request');
    assert.equal((await client(owner).post('/api/agents/assistant/threads/abort', { threadId: video, resourceId: owner.id, expectedRunId: runId, clearPendingSignals: false })).status, 200);
    const ended = await turn;
    assert.ok(!completed(ended));
    assert.equal((await made(video)).length, 1); assert.equal(await sheetVersions(video), 0);
    assert.equal(meta.requests.length, 2);
    const history = await client(owner).get(`/memory/threads/${video}/messages?page=0&perPage=20`);
    const parts = (await history.json() as { messages: { content: { parts: Record<string, unknown>[] } }[] }).messages.flatMap(message => message.content.parts);
    assert.deepEqual(parts.filter(part => part.type === 'tool-activity' && part.tool === 'generate-sheet').map(part => part.state), ['incomplete']);
  });
});
