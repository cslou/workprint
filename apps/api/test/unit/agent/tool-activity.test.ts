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
