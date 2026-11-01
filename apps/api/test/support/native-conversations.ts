import { randomUUID } from 'node:crypto';
import type { MastraCompositeStore } from '@mastra/core/storage';
import type { MastraDBMessage } from '@mastra/core/agent';
import { startedConversation } from '../../src/mastra/started-conversations.js';

/** Test-only native conversation fixture; callers own isolated Postgres and teardown. */
export async function createNativeConversation(
  store: Pick<MastraCompositeStore, 'getStore'>,
  accountId: string,
  messages: readonly { role: MastraDBMessage['role']; text: string }[] = [],
  title = 'Synthetic test conversation',
) {
  const memory = await store.getStore('memory');
  if (!memory) throw new Error('Native memory storage is required for this fixture');
  const now = new Date();
  const thread = await memory.saveThread({ thread: {
    id: randomUUID(), resourceId: accountId, title,
    // Saved messages stand for accepted sends, so such a thread is listed like a started video.
    metadata: messages.length ? { ...startedConversation } : {}, createdAt: now, updatedAt: now,
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
