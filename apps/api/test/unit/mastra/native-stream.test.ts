import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import type { AgentTool } from '../../../src/agent/index.js';
import { sanitizeNativeStream, sanitizedNativeResponse } from '../../../src/mastra/native-stream.js';

const runId = 'run-1';
const registry: AgentTool[] = [{ id: 'read-workspace', description: 'Read', inputSchema: z.strictObject({}), phrase: 'Getting up to date on our progress…', doneSummary: () => 'Read 2 saved items', execute: async () => ({}) }];
const sse = (values: unknown[]) => values.map(value => `data: ${JSON.stringify(value)}\n\n`).join('');

/** Feeds `text` in `size`-byte pieces, so events split across reads, and returns the safe events. */
async function sanitize(text: string, size = 7) {
  const bytes = new TextEncoder().encode(text);
  const source = new ReadableStream<Uint8Array>({ start(controller) { for (let at = 0; at < bytes.length; at += size) controller.enqueue(bytes.slice(at, at + size)); controller.close(); } });
  const out = await new Response(sanitizeNativeStream(source, registry)).text();
  return { out, events: out.split('\n\n').filter(event => event && !event.startsWith(':')).map(event => JSON.parse(event.replace(/^data: /, '')) as Record<string, unknown>) };
}

test('only allowlisted chunks leave, re-framed, with tool calls as activity lines', async () => {
  const { out, events } = await sanitize(sse([
    { type: 'start', runId, from: 'AGENT', payload: { id: 'assistant', messageId: 'm1' } },
    { type: 'data-user-message', runId, payload: { text: 'private input' } },
    { type: 'step-start', runId, payload: { request: { body: 'You are the Workprint assistant' } } },
    { type: 'text-delta', runId, payload: { id: 'txt-0', text: 'Hé' } },
    { type: 'tool-call-delta', runId, payload: { toolCallId: 'call_1', toolName: 'read-workspace', argsTextDelta: '{"versionId":"secret-arg"}' } },
    { type: 'tool-call', runId, payload: { toolCallId: 'call_1', toolName: 'read-workspace', args: { versionId: 'secret-arg' } } },
    { type: 'tool-result', runId, payload: { toolCallId: 'call_1', toolName: 'read-workspace', args: {}, result: { items: ['secret-result'] } } },
    { type: 'tool-call', runId, payload: { toolCallId: 'call_2', toolName: 'invented-tool', args: {} } },
    { type: 'tool-error', runId, payload: { toolCallId: 'call_3', toolName: 'read-workspace', error: { message: 'secret-error', stack: '/Users/x/node_modules' } } },
    { type: 'step-finish', runId, payload: { _durableResponseMessages: ['secret-result'], output: {} } },
    { type: 'finish', runId, payload: { output: { usage: {} }, stepResult: { reason: 'stop', messageId: 'm1', headers: { date: 'x' } } } },
  ]));
  assert.deepEqual(events, [
    { type: 'start', runId, payload: { messageId: 'm1' } },
    { type: 'text-delta', runId, payload: { text: 'Hé' } },
    { type: 'tool-activity', runId, payload: { toolCallId: 'call_1', tool: 'read-workspace', phrase: 'Getting up to date on our progress…', state: 'running' } },
    { type: 'tool-activity', runId, payload: { toolCallId: 'call_1', tool: 'read-workspace', phrase: 'Getting up to date on our progress…', state: 'done', summary: 'Read 2 saved items' } },
    { type: 'tool-activity', runId, payload: { toolCallId: 'call_3', tool: 'read-workspace', phrase: 'Getting up to date on our progress…', state: 'failed' } },
    { type: 'finish', runId, payload: { stepResult: { reason: 'stop', messageId: 'm1' } } },
  ]);
  assert.doesNotMatch(out, /secret|private|Workprint assistant|invented|usage|headers|AGENT/);
});

test('errors keep a class name and a safe message; our step limit keeps its notice', async () => {
  const { events } = await sanitize(sse([
    { type: 'error', runId, payload: { error: { name: 'AI_APICallError', message: 'Provider said: secret', stack: 'at /Users/x' } } },
    { type: 'error', runId, payload: { error: { name: 'bad name with spaces', message: 'Stopped after too many steps.' } } },
    { type: 'tripwire', runId, payload: { reason: 'secret processor detail', processorId: 'x' } },
    { type: 'tripwire', runId, payload: { reason: 'Stopped after too many steps.' } },
    { type: 'abort', runId, payload: { reason: 'secret' } },
  ]), 3);
  assert.deepEqual(events, [
    { type: 'error', runId, payload: { error: { name: 'AI_APICallError', message: 'The reply failed.' } } },
    { type: 'error', runId, payload: { error: { name: 'Error', message: 'Stopped after too many steps.' } } },
    { type: 'tripwire', runId, payload: {} },
    { type: 'tripwire', runId, payload: { reason: 'Stopped after too many steps.' } },
    { type: 'abort', runId },
  ]);
});

test('run observation events are sanitized inside their envelope; malformed events are dropped and comments kept', async () => {
  const { out, events } = await sanitize(`: heartbeat\r\n\r\ndata: not json\r\n\r\n${sse([
    { type: 'chunk', runId, data: { type: 'text-delta', payload: { text: 'ok' } } },
    { type: 'chunk', runId, data: { type: 'step-start', payload: { request: 'secret' } } },
    { type: 'finish', runId, data: { stepResult: { reason: 'stop', messageId: 'm1', usage: 'secret' } } },
    { type: 'error', runId, data: { error: { name: 'MastraTimeoutError', message: 'secret' } } },
    { type: 'abort', runId, data: { reason: 'secret' } },
  ])}`);
  assert.ok(out.startsWith(': heartbeat\n\n'), 'heartbeat kept');
  assert.deepEqual(events, [
    { type: 'chunk', runId, data: { type: 'text-delta', runId, payload: { text: 'ok' } } },
    { type: 'finish', runId, data: { stepResult: { reason: 'stop', messageId: 'm1' } } },
    { type: 'error', runId, data: { error: { name: 'MastraTimeoutError', message: 'The reply failed.' } } },
    { type: 'abort', runId },
  ]);
});

test('an event over 16 MiB ends the stream, whether it arrives in one read or many', async () => {
  const huge = `data: ${JSON.stringify({ type: 'text-delta', runId, payload: { text: 'x'.repeat(16 * 1024 * 1024) } })}\n\n`;
  await assert.rejects(sanitize(huge, huge.length), /too large/);
  await assert.rejects(sanitize(huge, 1024 * 1024), /too large/);
});

test('only an event-stream success is re-framed; JSON answers pass unchanged', async () => {
  const json = new Response('{"ok":true}', { status: 409, headers: { 'Content-Type': 'application/json' } });
  assert.equal(sanitizedNativeResponse(json, registry), json);
  const stream = sanitizedNativeResponse(new Response(sse([{ type: 'step-start', runId, payload: {} }]), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Content-Length': '99' } }), registry);
  assert.equal(stream.headers.get('content-length'), null);
  assert.equal(await stream.text(), '');
});
