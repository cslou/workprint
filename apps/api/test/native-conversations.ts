import { randomUUID } from 'node:crypto';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { MastraDBMessage } from '@mastra/core/agent';

/** Test-only native conversation fixture; callers own isolated Postgres and teardown. */
export async function createNativeConversation(
  store: Pick<MastraCompositeStore, 'getStore'>,
  accountId: string,
  messages: readonly { role: 'user' | 'assistant'; text: string }[] = [],
) {
  const memory = await store.getStore('memory');
  if (!memory) throw new Error('Native memory storage is required for this fixture');
  const now = new Date();
  const thread = await memory.saveThread({ thread: {
    id: randomUUID(), resourceId: accountId, title: 'Synthetic test conversation',
    metadata: {}, createdAt: now, updatedAt: now,
  } });
  if (messages.length) {
    await memory.saveMessages({ messages: messages.map((message, index): MastraDBMessage => ({
      id: randomUUID(), threadId: thread.id, resourceId: accountId, role: message.role,
      createdAt: new Date(now.getTime() + index),
      content: { format: 2, parts: [{ type: 'text', text: message.text }] },
    })) });
  }
  return thread;
}
