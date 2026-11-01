import { useSyncExternalStore } from 'react';
import type { ChatSession, ChatSnapshot } from './chat-session.js';

const idle: ChatSnapshot = { phase: 'idle', turns: [], notice: null };
const none = () => () => {};
const idleSnapshot = () => idle;

/** The chat's current state, or idle when there is no chat (an unconfigured shell). */
export function useChatSnapshot(chat: ChatSession | null | undefined) {
  return useSyncExternalStore(chat?.subscribe ?? none, chat?.getSnapshot ?? idleSnapshot);
}
