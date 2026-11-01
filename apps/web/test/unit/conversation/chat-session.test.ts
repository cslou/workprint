import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClientResult, NativeMessages, NativeObservation, NativeObservedTurn, NativeThread, NativeToolActivityChunk } from '@workprint/api-client';
import { createChatSession, replyText, sendsOnEnter, tooLong, type ChatSessionConfig } from '../../../src/conversation/chat-session.js';

const account = '22222222-2222-4222-8222-222222222222';
const video = '11111111-1111-4111-8111-111111111111';
const thread: NativeThread = { id: video, resourceId: account, title: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' } as NativeThread;
const fail = (code: string): ClientResult<never> => ({ ok: false, error: { code, message: code } as never });
const page = (texts: string[]): NativeMessages => ({ messages: texts.map((text, index) => ({ id: `0000000${index}-0000-4000-8000-000000000000`, threadId: video, resourceId: account, role: 'user', createdAt: '2026-11-01T00:00:00.000Z', content: { format: 2, parts: [{ type: 'text', text }] } })), total: texts.length, page: 0, perPage: 20, hasMore: false } as unknown as NativeMessages);

/** A scripted native client: each call takes the next scripted result and is counted. */
function harness(options: { conversationId?: string; send?: ClientResult<{ runId: string; inputMessageId: string }>[]; turn?: (onText: (part: { runId: string; text: string }) => void, onActivity: (activity: NativeToolActivityChunk) => void) => Promise<ClientResult<NativeObservedTurn>>; reads?: ClientResult<NativeMessages>[]; created?: ClientResult<NativeThread>; now?: () => number } = {}) {
  const calls = { create: 0, subscribe: 0, send: [] as string[], read: 0, closed: 0, cleared: 0, started: [] as NativeThread[], confirmed: [] as (NativeThread | null)[] };
  const sends = [...(options.send ?? [])], reads = [...(options.reads ?? [])];
  const observation: NativeObservation = {
    consume: () => Promise.reject(new Error('unused')),
    consumeTurn: (runId, onText, onActivity) => options.turn ? options.turn(onText, onActivity ?? (() => {})) : (onText({ runId, text: 'Hello' }), onText({ runId, text: ' there' }), Promise.resolve({ ok: true, value: { outcome: 'complete', runId, assistantMessageId: 'a' } })),
    close: () => { calls.closed++; },
  };
  const native: ChatSessionConfig['native'] = {
    createConversation: async () => { calls.create++; return options.created ?? { ok: true, value: thread }; },
    subscribe: async () => { calls.subscribe++; return { ok: true, value: observation }; },
    sendText: async input => { calls.send.push(input!.message); return sends.shift() ?? { ok: true, value: { runId: `run-${calls.send.length}`, inputMessageId: `input-${calls.send.length}` } }; },
    loadMessages: async () => { calls.read++; return reads.shift() ?? { ok: true, value: page([]) }; },
  } as ChatSessionConfig['native'];
  const session = createChatSession({
    native, accountId: account, ...(options.conversationId ? { conversationId: options.conversationId } : {}),
    knownMessageIds: () => new Set(), clearDraft: () => { calls.cleared++; },
    onStarted: value => { calls.started.push(value); }, onConfirmed: value => { calls.confirmed.push(value); }, ...(options.now ? { now: options.now } : {}),
  });
  return { session, calls };
}

test('Enter sends once; Shift+Enter and IME composition do not', () => {
  assert.equal(sendsOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 13 }), true);
  assert.equal(sendsOnEnter({ key: 'Enter', shiftKey: true, isComposing: false, keyCode: 13 }), false);
  assert.equal(sendsOnEnter({ key: 'Enter', shiftKey: false, isComposing: true, keyCode: 13 }), false);
  assert.equal(sendsOnEnter({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 }), false);
  assert.equal(sendsOnEnter({ key: 'a', shiftKey: false, isComposing: false, keyCode: 65 }), false);
});

test('a New video send creates the thread, streams the reply and adopts the video once', async () => {
  const { session, calls } = harness();
  await session.send('Hi');
  assert.deepEqual(calls.send, ['Hi']); assert.equal(calls.create, 1); assert.equal(calls.cleared, 1);
  assert.deepEqual(calls.started, [thread]);
  assert.deepEqual(session.getSnapshot().turns.map(turn => [turn.text, replyText(turn), turn.state]), [['Hi', 'Hello there', 'completed']]);
  assert.equal(session.getSnapshot().phase, 'idle');
  await session.send('Again');
  assert.equal(calls.create, 1, 'the same video'); assert.equal(calls.started.length, 1);
});

test('whitespace and input over 32 KiB are never sent; the draft is kept', async () => {
  const { session, calls } = harness();
  await session.send('  \n ');
  assert.equal(tooLong('a'.repeat(32 * 1024)), false); assert.equal(tooLong('a'.repeat(32 * 1024 + 1)), true);
  await session.send('a'.repeat(32 * 1024 + 1));
  assert.equal(session.getSnapshot().notice, 'too_long');
  assert.equal(calls.create + calls.send.length, 0); assert.equal(calls.cleared, 0);
});

test('a busy rejection keeps the draft and shows busy', async () => {
  const { session, calls } = harness({ conversationId: video, send: [fail('busy')] });
  await session.send('Too soon');
  assert.equal(session.getSnapshot().notice, 'busy'); assert.equal(session.getSnapshot().phase, 'idle');
  assert.equal(calls.cleared, 0); assert.equal(calls.closed, 1); assert.deepEqual(session.getSnapshot().turns, []);
});

test('a definite first-send failure starts no video, keeps the draft and reuses the thread next time', async () => {
  const { session, calls } = harness({ send: [fail('integration_failure')] });
  await session.send('First');
  assert.equal(session.getSnapshot().notice, 'not_sent'); assert.equal(calls.cleared, 0); assert.deepEqual(calls.started, []);
  await session.send('First');
  assert.equal(calls.create, 1); assert.deepEqual(calls.started, [thread]);
});

test('a lost acknowledgment never resends: it re-reads once, then waits for Check again or Send anyway', async () => {
  const { session, calls } = harness({ send: [fail('transport_failure')], reads: [{ ok: true, value: page([]) }, { ok: true, value: page(['Lost']) }] });
  await session.send('Lost');
  assert.equal(session.getSnapshot().phase, 'unconfirmed'); assert.equal(calls.read, 1);
  assert.deepEqual(calls.send, ['Lost']); assert.equal(calls.cleared, 0);
  await session.send('Lost');
  assert.deepEqual(calls.send, ['Lost'], 'Send is blocked while unconfirmed');
  await session.checkAgain();
  assert.equal(calls.read, 2); assert.equal(session.getSnapshot().phase, 'idle');
  assert.deepEqual(calls.confirmed, [thread]); assert.equal(calls.cleared, 1); assert.deepEqual(calls.send, ['Lost']);
});

test('Send anyway is the only path that sends an unconfirmed message again', async () => {
  const { session, calls } = harness({ send: [fail('timed_out')], reads: [{ ok: true, value: page([]) }] });
  await session.send('Maybe');
  assert.equal(session.getSnapshot().phase, 'unconfirmed');
  await session.sendAnyway();
  assert.deepEqual(calls.send, ['Maybe', 'Maybe']); assert.equal(calls.create, 1);
  assert.equal(calls.cleared, 1); assert.equal(session.getSnapshot().turns.at(-1)?.state, 'completed');
});

test('a reply that fails offers one Retry, which sends the same text once without touching the draft', async () => {
  let attempt = 0;
  const { session, calls } = harness({ conversationId: video, turn: async onText => { onText({ runId: 'r', text: 'Part' }); return ++attempt === 1 ? { ok: true, value: { outcome: 'failed', runId: 'r', reason: 'error' } } : { ok: true, value: { outcome: 'complete', runId: 'r', assistantMessageId: 'a' } }; } });
  await session.send('Please');
  const failed = session.getSnapshot().turns[0]!;
  assert.equal(failed.state, 'failed'); assert.equal(replyText(failed), 'Part');
  await session.retry(failed.key); await session.retry(failed.key);
  assert.deepEqual(calls.send, ['Please', 'Please']); assert.equal(calls.cleared, 1);
  assert.deepEqual(session.getSnapshot().turns.map(turn => [turn.state, turn.retried]), [['failed', true], ['completed', false]]);
});

test('a lost observation is not a failed reply and offers no Retry; a server failure is', async () => {
  const outcomes: ClientResult<NativeObservedTurn>[] = [fail('transport_failure'), { ok: true, value: { outcome: 'failed', runId: 'r', reason: 'error' } }];
  const { session, calls } = harness({ conversationId: video, turn: async () => outcomes.shift()! });
  await session.send('One'); await session.send('Two');
  const [lost, failed] = session.getSnapshot().turns;
  assert.equal(lost!.state, 'lost'); assert.equal(failed!.state, 'failed');
  await session.retry(lost!.key);
  assert.deepEqual(calls.send, ['One', 'Two'], 'a lost reply may still be running');
});

test('a Retry that is rejected outright is given back', async () => {
  const { session, calls } = harness({ conversationId: video, send: [{ ok: true, value: { runId: 'r1', inputMessageId: 'i1' } }, fail('busy')], turn: async () => ({ ok: true, value: { outcome: 'failed', runId: 'r', reason: 'error' } }) });
  await session.send('Please');
  const turn = session.getSnapshot().turns[0]!;
  await session.retry(turn.key);
  assert.equal(session.getSnapshot().notice, 'busy');
  assert.equal(session.getSnapshot().turns[0]!.retried, false);
  assert.deepEqual(calls.send, ['Please', 'Please']);
});

test('tool activity lines sit in order between the reply text, move on in place, and never stay running', async () => {
  const line = (toolCallId: string, state: NativeToolActivityChunk['state'], summary?: string): NativeToolActivityChunk => ({ runId: 'r', toolCallId, tool: 'read-workspace', phrase: 'Getting up to date on our progress…', state, ...(summary ? { summary } : {}) });
  let clock = 1000;
  const { session } = harness({ conversationId: video, now: () => clock, turn: async (onText, onActivity) => {
    onText({ runId: 'r', text: 'Let me ' }); onText({ runId: 'r', text: 'look' });
    onActivity(line('a', 'running')); clock = 4000; onActivity(line('b', 'running')); onActivity(line('a', 'done', 'Read 2 saved items'));
    onText({ runId: 'r', text: 'Found it' });
    return { ok: true, value: { outcome: 'interrupted', runId: 'r' } };
  } });
  await session.send('Check');
  const turn = session.getSnapshot().turns[0]!;
  assert.deepEqual(turn.parts.map(part => part.kind === 'text' ? part.text : [part.activity.toolCallId, part.activity.state, part.activity.summary, part.startedAt]), [
    'Let me look', ['a', 'done', 'Read 2 saved items', 1000], ['b', 'incomplete', undefined, 4000], 'Found it',
  ]);
  assert.equal(replyText(turn), 'Let me lookFound it');
});

test('a lost turn leaves its running line running, without a clock, because it may still finish', async () => {
  const { session } = harness({ conversationId: video, now: () => 5, turn: async (_onText, onActivity) => {
    onActivity({ runId: 'r', toolCallId: 'a', tool: 'read-workspace', phrase: 'Getting up to date on our progress…', state: 'running' });
    return fail('transport_failure');
  } });
  await session.send('Check');
  const [part] = session.getSnapshot().turns[0]!.parts;
  assert.ok(part?.kind === 'activity');
  assert.equal(part.activity.state, 'running'); assert.equal(part.startedAt, undefined);
});

test('after dispose, late reply text and results change nothing', async () => {
  let push!: (text: string) => void, finish!: () => void;
  const { session, calls } = harness({ conversationId: video, turn: onText => new Promise(resolve => { push = text => onText({ runId: 'r', text }); finish = () => resolve({ ok: true, value: { outcome: 'complete', runId: 'r', assistantMessageId: 'a' } }); }) });
  const sending = session.send('Hi');
  await new Promise(resolve => setImmediate(resolve));
  push('Early');
  assert.equal(replyText(session.getSnapshot().turns[0]!), 'Early'); assert.equal(session.getSnapshot().phase, 'working');
  session.dispose(); push(' late'); finish(); await sending;
  assert.equal(replyText(session.getSnapshot().turns[0]!), 'Early'); assert.equal(session.getSnapshot().phase, 'working');
  assert.equal(calls.closed, 1);
});
