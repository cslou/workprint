import type { MastraCompositeStore } from '@mastra/core/storage';
import { idSchema } from '@workprint/contracts';
import type { CheckOwnedConversation } from '../../application/index.js';

/** Read-only native lookup; accountId must come from verified admission. */
export function createOwnedConversationCheck(storage: Pick<MastraCompositeStore, 'getStore'>): CheckOwnedConversation {
  return async (accountId, conversationId) => {
    if (!idSchema.safeParse(conversationId).success || conversationId === '.' || conversationId === '..' || /\p{Cc}/u.test(conversationId)) return { kind: 'not_found' };
    try {
      const memory = await storage.getStore('memory');
      if (!memory) return { kind: 'unavailable', reason: 'native_storage' };
      const thread = await memory.getThreadById({ threadId: conversationId, resourceId: accountId });
      return thread?.resourceId === accountId ? { kind: 'owned' } : { kind: 'not_found' };
    } catch {
      // Native errors can contain query/connection details; expose only the typed failure.
      return { kind: 'unavailable', reason: 'native_storage' };
    }
  };
}
