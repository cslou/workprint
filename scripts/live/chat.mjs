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

  await step('tool', async () => {
    const prompts = ['Use the test-echo tool to echo the text "workprint-live", then tell me what it returned.', 'Call the test-echo tool now with text "workprint-live". Do not answer before calling it.'];
    for (const [attempt, prompt] of prompts.entries()) {
      if (!live) provider.script({ toolCalls: [{ name: 'test-echo', args: { text: 'workprint-live' } }] }, { text: ['It returned workprint-live.'] });
      const turn = await client.turn(await client.newVideo(), prompt, timeoutMs);
      const called = turn.chunks.some(chunk => chunk.type === 'tool-call' && chunk.payload?.toolName === 'test-echo');
      if (!called && attempt === 0) continue;
      assert.ok(called, 'the model declined the tool twice (recorded as a finding, not a sprint failure)');
      assert.ok(completed(turn), `turn did not complete: ${turn.terminal?.type ?? 'no terminal chunk'}`);
      shapes.tool = sanitize(turn.chunks);
      return { rephrased: attempt > 0, firstChunkMs: turn.firstChunkMs };
    }
    throw new Error('unreachable');
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
    if (chunk.type === 'tool-call') Object.assign(shape, { toolName: payload.toolName, argsKeys: Object.keys(payload.args ?? {}).sort() });
    if (chunk.type === 'tool-result') Object.assign(shape, { toolName: payload.toolName, resultKeys: Object.keys(payload.result ?? {}).sort() });
    if (chunk.type === 'step-finish' || chunk.type === 'finish') Object.assign(shape, { reason: payload.stepResult?.reason });
    if (chunk.type === 'error') Object.assign(shape, { errorName: payload.error?.name });
    return shape;
  });
}
