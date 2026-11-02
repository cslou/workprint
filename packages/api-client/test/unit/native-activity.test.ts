import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isHistoryPart, shownMedia } from '../../src/native-activity.js';
import { nativeOutcome } from '../../src/native-outcome.js';

const runId = '11111111-1111-4111-8111-111111111111', messageId = '22222222-2222-4222-8222-222222222222';
const activity = (state: string, extra: Record<string, unknown> = {}) => ({ type: 'tool-activity', runId, payload: { toolCallId: 'call_1', tool: 'read-workspace', phrase: 'Getting up to date on our progress…', state, ...extra } });

test('tool activity chunks reach onActivity in order, between text, and the turn still completes', () => {
  const seen: unknown[] = [];
  const decoder = nativeOutcome(runId, part => seen.push(['text', part.text]), line => seen.push(['activity', line.state, line.summary, line.runId]));
  for (const chunk of [{ type: 'start', runId, payload: { messageId } }, { type: 'text-delta', runId, payload: { text: 'Let me look' } }, activity('running'), activity('done', { summary: 'Read 2 saved items' }), { type: 'text-delta', runId, payload: { text: 'Done' } }]) assert.equal(decoder.chunk(chunk), undefined);
  assert.deepEqual(decoder.chunk({ type: 'finish', runId, payload: { stepResult: { reason: 'stop', messageId } } }), { ok: true, value: { outcome: 'complete', runId, assistantMessageId: messageId } });
  assert.deepEqual(seen, [['text', 'Let me look'], ['activity', 'running', undefined, runId], ['activity', 'done', 'Read 2 saved items', runId], ['text', 'Done']]);
});

test('malformed tool activity fails the observation rather than showing an unchecked line', () => {
  for (const bad of [activity('running', { args: { secret: true } }), activity('pending'), { ...activity('running'), payload: { ...activity('running').payload, phrase: '' } }]) {
    const decoder = nativeOutcome(runId, () => {}, () => assert.fail('no line for a malformed chunk'));
    decoder.chunk({ type: 'start', runId, payload: { messageId } });
    const result = decoder.chunk(bad);
    assert.ok(result && !result.ok && result.error.code === 'invalid_response', JSON.stringify(bad));
  }
  const early = nativeOutcome(runId, () => {}, () => assert.fail('no line before the run starts'));
  const result = early.chunk(activity('running'));
  assert.ok(result && !result.ok && result.error.code === 'invalid_response');
});

test('saved history accepts text and exact tool activity parts only', () => {
  const line = { type: 'tool-activity', toolCallId: 'call_1', tool: 'read-workspace', phrase: 'Getting up to date on our progress…', state: 'done', summary: 'Read 2 saved items' };
  assert.ok(isHistoryPart({ type: 'text', text: 'Hi' }));
  assert.ok(isHistoryPart(line));
  assert.ok(isHistoryPart({ ...line, state: 'incomplete', summary: undefined }));
  for (const bad of [{ ...line, result: {} }, { ...line, state: 'running?' }, { ...line, tool: 'Read Workspace' }, { type: 'tool-invocation', toolInvocation: {} }, { type: 'reasoning', text: 'private' }]) assert.equal(isHistoryPart(bad), false, JSON.stringify(bad));
});

test('a line\'s shown media are 1 to 10 image or video version ids (UUIDs), and a line in the earlier images shape still shows its images', () => {
  const line = { type: 'tool-activity', toolCallId: 'call_1', tool: 'generate-image', phrase: 'Making an image…', state: 'done', summary: 'Saved Image 1 · Version 1' };
  const ids = Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  const media = ids.slice(0, 10).map((versionId, index) => ({ kind: index ? 'image' : 'video', versionId }));
  assert.ok(isHistoryPart({ ...line, media }));
  for (const bad of [[{ kind: 'image', versionId: 'not-a-uuid' }], ids.map(versionId => ({ kind: 'image', versionId })), [], [{ kind: 'audio', versionId: ids[0] }], [{ kind: 'image', versionId: ids[0], src: 'x' }], [ids[0]]]) {
    assert.equal(isHistoryPart({ ...line, media: bad }), false, JSON.stringify(bad));
  }
  // The shape saved before videos: image ids only.
  const earlier = { ...line, images: ids.slice(0, 2) };
  assert.ok(isHistoryPart(earlier));
  assert.deepEqual(shownMedia(earlier as never), ids.slice(0, 2).map(versionId => ({ kind: 'image', versionId })));
  assert.deepEqual(shownMedia({ ...line, media } as never), media);
  for (const images of [['not-a-uuid'], ids, [], [{ id: ids[0] }], ids[0]]) assert.equal(isHistoryPart({ ...line, images }), false, JSON.stringify(images));
  assert.equal(isHistoryPart({ ...line, images: [ids[0]], media: [media[0]] }), false, 'one shape per line');
  assert.equal(isHistoryPart({ ...line, media: [media[0]], thumbnails: [] }), false, 'an extra key');
});

test('a run observation\'s abort event ends the turn as interrupted', () => {
  const decoder = nativeOutcome(runId, () => {});
  assert.equal(decoder.event({ type: 'chunk', runId, data: { type: 'start', runId, payload: { messageId } } }), undefined);
  assert.deepEqual(decoder.event({ type: 'abort', runId }), { ok: true, value: { outcome: 'interrupted', runId, assistantMessageId: messageId } });
});
