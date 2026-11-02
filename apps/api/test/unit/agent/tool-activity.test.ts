import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { projectToolActivity, type AgentTool } from '../../../src/agent/index.js';

const family = '\u{1F469}‍\u{1F469}‍\u{1F467}';
const tool = (summary: string): AgentTool[] => [{ id: 'read-workspace', description: 'Read', inputSchema: z.strictObject({}), phrase: 'Reading…', doneSummary: () => summary, execute: async () => ({}) }];
const summary = (text: string) => projectToolActivity(tool(text), { toolCallId: 'call_1', toolName: 'read-workspace', state: 'done', output: {} })?.summary;

test('a long done summary is cut at 60 whole characters, never inside an emoji', () => {
  assert.equal(summary('Read 2 saved items'), 'Read 2 saved items');
  const cut = summary(`${'a'.repeat(58)}${family}${'b'.repeat(10)}`)!;
  assert.equal(cut, `${'a'.repeat(58)}${family}…`);
  assert.ok(!/[\uD800-\uDFFF]/u.test(cut.replace(family, '')), 'no lone surrogate');
});

test('a done line carries only saved version ids (UUIDs) as shown images, at most 10', () => {
  const ids = Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  const registry = (shownImages: AgentTool['shownImages']): AgentTool[] => [{ id: 'generate-image', description: 'Make', inputSchema: z.strictObject({}), execute: async () => ({}), ...(shownImages ? { shownImages } : {}) }];
  const project = (registryTools: AgentTool[], state: 'running' | 'done' = 'done') => projectToolActivity(registryTools, { toolCallId: 'call_1', toolName: 'generate-image', state, output: {} });
  assert.deepEqual(project(registry(() => ['not-a-uuid', ...ids]))?.images, ids.slice(0, 10), 'a non-UUID and the eleventh id are dropped');
  assert.equal(project(registry(() => ids), 'running')?.images, undefined, 'only a done line shows images');
  assert.equal(project(registry(() => []))?.images, undefined);
  assert.equal(project(registry(() => { throw new Error('bad output'); }))?.images, undefined);
});
