import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createArtifactStore, createAssistantScripts, createVersionUses } from '../../src/artifacts/index.js';
import { createAssistantScriptSaver } from '../../src/application/index.js';
import { createOwnedConversationCheck } from '../../src/agent/index.js';
import { accountBrowserFixture } from '../support/account-browser-fixture.js';
import { chatComposition } from '../support/chat-composition.js';
import { metaImageFake, testPng } from '../support/meta-image-fake.js';
import { completed, nativeTurnClient } from '../support/native-turn-client.js';
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
