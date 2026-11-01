import type { MemoryStorage } from '@mastra/core/storage';

/**
 * A video is listed in Recents only once a send to it has been accepted. New video creates the
 * native thread just before its first send; a thread whose send never landed stays unlisted.
 */
export const startedConversation: Readonly<Record<string, unknown>> = Object.freeze({ workprintStarted: true });
const markDeadlineMs = 2000;

/** `written` runs once the mark's write has settled, even after the deadline: a later thread write cannot race it. */
export async function markConversationStarted(memory: MemoryStorage, threadId: string, accountId: string, written?: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Native's serialized metadata merge, never a title write; bounded so a slow write cannot hold the send.
  const mark = memory.updateThreadMetadata({ id: threadId, resourceId: accountId, update: thread => thread.metadata?.workprintStarted === true ? undefined : { ...startedConversation } });
  if (written) void mark.then(written, written);
  try {
    await Promise.race([mark, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Started video mark timed out')), markDeadlineMs); })]);
  } finally { clearTimeout(timer); }
}
