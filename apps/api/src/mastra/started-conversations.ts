import type { MemoryStorage } from '@mastra/core/storage';

/**
 * A video is listed in Recents only once a send to it has been accepted. New video creates the
 * native thread just before its first send; a thread whose send never landed stays unlisted.
 */
export const startedConversation: Readonly<Record<string, unknown>> = Object.freeze({ workprintStarted: true });

export async function markConversationStarted(memory: MemoryStorage, threadId: string) {
  // Metadata only: leave the title to its own writer.
  await memory.patchThread({ id: threadId, metadata: { ...startedConversation } });
}
