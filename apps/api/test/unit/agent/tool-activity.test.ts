import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { productionTools, projectToolActivity, type AgentTool } from '../../../src/agent/index.js';

const family = '\u{1F469}‍\u{1F469}‍\u{1F467}';
const tool = (summary: string): AgentTool[] => [{ id: 'read-workspace', description: 'Read', inputSchema: z.strictObject({}), phrase: 'Reading…', doneSummary: () => summary, execute: async () => ({}) }];
const summary = (text: string) => projectToolActivity(tool(text), { toolCallId: 'call_1', toolName: 'read-workspace', state: 'done', output: {} })?.summary;

test('a long done summary is cut at 60 whole characters, never inside an emoji', () => {
  assert.equal(summary('Read 2 saved items'), 'Read 2 saved items');
  const cut = summary(`${'a'.repeat(58)}${family}${'b'.repeat(10)}`)!;
  assert.equal(cut, `${'a'.repeat(58)}${family}…`);
  assert.ok(!/[\uD800-\uDFFF]/u.test(cut.replace(family, '')), 'no lone surrogate');
});

test('a done line carries only saved image or video version ids (UUIDs) as shown media, at most 10', () => {
  const ids = Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  const registry = (shownMedia: AgentTool['shownMedia']): AgentTool[] => [{ id: 'generate-image', description: 'Make', inputSchema: z.strictObject({}), execute: async () => ({}), ...(shownMedia ? { shownMedia } : {}) }];
  const project = (registryTools: AgentTool[], state: 'running' | 'done' = 'done') => projectToolActivity(registryTools, { toolCallId: 'call_1', toolName: 'generate-image', state, output: {} });
  const image = (versionId: string) => ({ kind: 'image' as const, versionId });
  assert.deepEqual(project(registry(() => [image('not-a-uuid'), image(ids[0]!), ...ids.map(image)]))?.media, ids.slice(0, 10).map(image), 'a non-UUID, a repeat and the eleventh id are dropped');
  assert.deepEqual(project(registry(() => [{ kind: 'video', versionId: ids[1]! }, { kind: 'audio', versionId: ids[2]! } as never]))?.media, [{ kind: 'video', versionId: ids[1] }], 'only images and videos');
  assert.equal(project(registry(() => ids.map(image)), 'running')?.media, undefined, 'only a done line shows media');
  assert.equal(project(registry(() => []))?.media, undefined);
  assert.equal(project(registry(() => { throw new Error('bad output'); }))?.media, undefined);
});

test('a generate-image result saved before videos still shows its images, and a made video shows under its line', () => {
  const [first, second] = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  // The result shape stored by Sprint 008 turns, read back from saved history.
  const saved = { made: true, images: [{ versionId: first, label: 'Image 1 · Version 1', width: 64, height: 48 }], failed: 0, showInChat: true };
  assert.deepEqual(projectToolActivity(productionTools, { toolCallId: 'call_1', toolName: 'generate-image', state: 'done', output: saved })?.media, [{ kind: 'image', versionId: first }]);
  const video = (showInChat: boolean) => ({ made: true, jobId: 'job', showInChat, video: { versionId: second, label: 'Video 1 · Version 1', width: 1344, height: 768, durationS: 4 } });
  assert.deepEqual(projectToolActivity(productionTools, { toolCallId: 'call_2', toolName: 'generate-video', state: 'done', output: video(true) })?.media, [{ kind: 'video', versionId: second }]);
  assert.equal(projectToolActivity(productionTools, { toolCallId: 'call_3', toolName: 'generate-video', state: 'done', output: video(false) })?.media, undefined);
});
