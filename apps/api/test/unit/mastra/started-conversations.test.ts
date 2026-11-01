import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MemoryStorage } from '@mastra/core/storage';
import { markConversationStarted } from '../../../src/mastra/started-conversations.js';

/** Memory whose started-mark write settles only when the test says so. */
function lateMemory() {
  let settle!: (outcome: 'written' | 'failed') => void;
  const write = new Promise<null>((resolve, reject) => { settle = outcome => outcome === 'written' ? resolve(null) : reject(new Error('write failed')); });
  write.catch(() => undefined);
  return { memory: { updateThreadMetadata: () => write } as unknown as MemoryStorage, settle };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('the after-write callback (which starts the title save) runs only once the started mark is written', async () => {
  const { memory, settle } = lateMemory();
  let written = 0;
  const marking = markConversationStarted(memory, 'video', 'owner', () => { written++; });
  await tick();
  assert.equal(written, 0, 'not while the mark is being written');
  settle('written'); await marking; await tick();
  assert.equal(written, 1);
});

test('it also runs when the mark write fails, or settles after the send stopped waiting for it', { timeout: 10000 }, async () => {
  const failing = lateMemory();
  let afterFailure = 0;
  const failed = markConversationStarted(failing.memory, 'video', 'owner', () => { afterFailure++; });
  failing.settle('failed');
  await assert.rejects(failed); await tick();
  assert.equal(afterFailure, 1);

  const slow = lateMemory();
  let afterDeadline = 0;
  await assert.rejects(markConversationStarted(slow.memory, 'video', 'owner', () => { afterDeadline++; }), /timed out/);
  assert.equal(afterDeadline, 0, 'the write is still running');
  slow.settle('written'); await tick();
  assert.equal(afterDeadline, 1);
});
