// Chat check against the built API. Scripted by default (fake provider, placeholder key, network
// guarded); `--live` makes a handful of real Muse Spark calls and saves the sanitized shapes.
// Run through `pnpm live:chat [--live]`, which compiles the tests and starts the shared test stack.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const live = process.argv.includes('--live');
const support = join(import.meta.dirname, '../../apps/api/.test-build/test/support');
const load = name => import(pathToFileURL(join(support, name)).href);
const { accountBrowserFixture } = await load('account-browser-fixture.js');
const { chatComposition, liveChatComposition } = await load('chat-composition.js');
const { environment, liveEnvironment, placeholderMetaKey } = await load('environment.js');
const { completed, nativeTurnClient } = await load('native-turn-client.js');
const { scriptedProvider } = await load('scripted-provider.js');

/** The key comes only from the root .env, parsed here and passed to the child; never printed or put in process.env. */
function metaKey() {
  const key = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')).META_API_KEY : undefined;
  if (!key) throw new Error('live:chat --live needs META_API_KEY in the root .env');
  return key;
}

const canary = 'workprint-live-chat-canary';
process.env.WORKPRINT_LIVE_CHAT_CANARY = canary;
/** Allowlisted child env, with a canary check: nothing from this process leaks in by inheritance. */
async function childEnvironment() {
  const prepared = live ? await liveEnvironment(metaKey()) : await environment();
  const env = prepared.env;
  assert.ok(!Object.values(env).includes(canary), 'child env must be allowlisted');
  for (const name of ['META_MODEL_API_KEY', 'MINIMAX_API_KEY']) assert.equal(env[name], undefined, `${name} must not reach the child`);
  if (live) assert.equal(env.NODE_OPTIONS, undefined);
  else { assert.equal(env.META_API_KEY, placeholderMetaKey); assert.match(env.NODE_OPTIONS ?? '', /--import=/); }
  return prepared;
}

const provider = await scriptedProvider();
const fixture = await accountBrowserFixture({
  // Saved-work tables, so read-workspace reads a real (empty) workspace.
  artifacts: true,
  composition: live ? liveChatComposition(provider.gateUrl) : chatComposition(provider),
  environment: childEnvironment,
});
const results = [];
let failed = false;
try {
  const user = await fixture.auth.createAccount();
  const client = nativeTurnClient(fixture.apiOrigin, await fixture.accessToken(user), user.id);
  const timeoutMs = live ? 300000 : 30000;
  const step = async (name, run) => {
    try { const detail = await run(); results.push({ step: name, pass: true, ...detail }); }
    catch (error) { failed = true; results.push({ step: name, pass: false, reason: error instanceof Error ? error.message : String(error) }); }
  };
  const shapes = {};

  await step('send', async () => {
    if (!live) provider.script({ text: ['Hello', ', filmmaker.'] });
    const turn = await client.turn(await client.newVideo(), 'Reply with one short sentence greeting a filmmaker.', timeoutMs);
    assert.ok(completed(turn), `turn did not complete: ${turn.terminal?.type ?? 'no terminal chunk'}`);
    assert.ok(turn.text.trim().length > 0, 'empty reply');
    shapes.send = sanitize(turn.chunks);
    return { firstChunkMs: turn.firstChunkMs, outputCap: 32768 };
  });

  await step('title', async () => {
    if (!live) { provider.scriptTitle({ text: ['Night swim'] }); provider.script({ text: ['A lovely idea.'] }); }
    const video = await client.newVideo(), titleRequests = provider.titleRequests.length;
    const turn = await client.turn(video, 'I want to make a two-minute film about a night swim in a mountain lake.', timeoutMs);
    assert.ok(completed(turn), `turn did not complete: ${turn.terminal?.type ?? 'no terminal chunk'}`);
    // The title call has its own 15 s deadline; give it a little longer to be saved.
    const started = Date.now();
    let title = '';
    while (!title && Date.now() - started < 20000) {
      const response = await client.get(`/memory/threads/${video}`);
      assert.equal(response.status, 200, `thread read answered ${response.status}`);
      title = (await response.json()).title ?? '';
      if (!title) await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(title, 'no title saved within 20 s');
    assert.ok([...title].length <= 60, `title longer than 60 characters: ${[...title].length}`);
    if (!live) { assert.equal(title, 'Night swim'); assert.equal(provider.titleRequests.length - titleRequests, 1); }
    // The title text is the user's own material; record only its length.
    return { titleCharacters: [...title].length, titledMs: Date.now() - started };
  });

  /** A turn where the model should call `tool`; one rephrase is allowed, and a second decline is a finding, not a failure. */
  const toolStep = (name, tool, prompts, args, reply) => step(name, async () => {
    for (const [attempt, prompt] of prompts.entries()) {
      if (!live) provider.script({ toolCalls: [{ name: tool, args }] }, { text: [reply] });
      const turn = await client.turn(await client.newVideo(), prompt, timeoutMs);
      // The browser sees the tool only as its safe activity line.
      const called = turn.chunks.some(chunk => chunk.type === 'tool-activity' && chunk.payload?.tool === tool && chunk.payload?.state === 'done');
      if (!called && attempt === 0) continue;
      assert.ok(called, 'the model declined the tool twice (recorded as a finding, not a sprint failure)');
      assert.ok(completed(turn), `turn did not complete: ${turn.terminal?.type ?? 'no terminal chunk'}`);
      shapes[name] = sanitize(turn.chunks);
      return { rephrased: attempt > 0, firstChunkMs: turn.firstChunkMs };
    }
    throw new Error('unreachable');
  });
  await toolStep('tool', 'test-echo', ['Use the test-echo tool to echo the text "workprint-live", then tell me what it returned.', 'Call the test-echo tool now with text "workprint-live". Do not answer before calling it.'], { text: 'workprint-live' }, 'It returned workprint-live.');
  await toolStep('read-workspace', 'read-workspace', ['Check our progress on this video.', 'Call the read-workspace tool now to check our progress on this video. Do not answer before calling it.'], {}, 'Nothing is saved yet.');

  await step('stop', async () => {
    if (!live) provider.script({ text: ['Partial', ' never sent'], hold: 'mid' });
    const video = await client.newVideo();
    let accepted;
    const runId = new Promise(resolve => { accepted = resolve; });
    const turn = client.turn(video, 'Write forty numbered lines about planning a short film, one sentence each.', timeoutMs, accepted);
    const id = await runId;
    // Live: let the reply start; scripted: wait for the held step.
    if (live) await new Promise(resolve => setTimeout(resolve, 1500)); else await provider.held();
    const started = Date.now();
    const response = await client.post('/api/agents/assistant/threads/abort', { threadId: video, resourceId: user.id, expectedRunId: id, clearPendingSignals: false });
    const acknowledgedMs = Date.now() - started;
    assert.equal(response.status, 200, `Stop answered ${response.status}`);
    const { aborted } = await response.json();
    const ended = await turn;
    const reason = ended.terminal?.payload?.stepResult?.reason;
    const interrupted = ended.terminal?.type === 'abort' || reason === 'abort';
    if (live) {
      // A real model that finished before the Stop arrived is a timing finding, not a failure.
      assert.ok(interrupted || completed(ended), `turn neither stopped nor completed: ${ended.terminal?.type ?? 'no terminal chunk'}`);
    } else {
      // Scripted, the reply is held, so the Stop must land and end the turn.
      assert.equal(aborted, true, 'Stop not acknowledged');
      assert.ok(interrupted, `turn not interrupted: ${ended.terminal?.type ?? 'no terminal chunk'}`);
    }
    assert.ok(acknowledgedMs < 5000, `Stop acknowledged after ${acknowledgedMs} ms`);
    shapes.stop = sanitize(ended.chunks);
    return { aborted, interrupted, acknowledgedMs, settledMs: Date.now() - started };
  });

  if (live) {
    const directory = 'apps/api/test/support/fixtures';
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'muse-spark-live-shapes.json'), JSON.stringify({ observed: new Date().toISOString().slice(0, 10), model: 'meta/muse-spark-1.3', shapes }, null, 2) + '\n');
  }
  if (!live) assert.equal(provider.unscripted.length, 0, 'unscripted provider request');
  await fixture.close();
} catch (error) {
  failed = true;
  results.push({ step: 'setup', pass: false, reason: error instanceof Error ? error.message : String(error) });
  await fixture.close().catch(() => undefined);
} finally {
  await provider.close();
}
console.info(JSON.stringify({ mode: live ? 'live' : 'scripted', results }, null, 2));
if (failed) process.exitCode = 1;

/** Chunk types and payload keys only: no ids, text, stacks or provider metadata values. */
function sanitize(chunks) {
  return chunks.map(chunk => {
    const payload = chunk.payload ?? {};
    const shape = { type: chunk.type, payloadKeys: Object.keys(payload).sort() };
    if (chunk.type === 'tool-activity') Object.assign(shape, { tool: payload.tool, state: payload.state });
    if (chunk.type === 'step-finish' || chunk.type === 'finish') Object.assign(shape, { reason: payload.stepResult?.reason });
    if (chunk.type === 'error') Object.assign(shape, { errorName: payload.error?.name });
    return shape;
  });
}
