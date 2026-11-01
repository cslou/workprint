import { nativeTransportLimits, type ApiClient, type ClientError, type NativeMessages, type NativeObservation, type NativeThread } from '@workprint/api-client';

type Native = Pick<ApiClient['native'], 'createConversation' | 'subscribe' | 'sendText' | 'loadMessages'>;

/** One turn sent from this page: the user's text and the reply as it streams. */
export type LiveTurn = Readonly<{
  key: number;
  text: string;
  reply: string;
  /** failed: the server ended the turn with an error. lost: this page stopped receiving it; it may still finish. */
  state: 'streaming' | 'completed' | 'failed' | 'interrupted' | 'lost';
  /** A failed or interrupted turn offers Retry once; Retry starts a new turn. */
  retried: boolean;
}>;
/**
 * idle: Send available. sending: waiting for the send to be accepted. working: a turn from this page is running.
 * checking: re-reading history after an unconfirmed send. unconfirmed: the send's outcome is still unknown.
 */
export type ChatPhase = 'idle' | 'sending' | 'working' | 'checking' | 'unconfirmed';
export type ChatNotice = 'busy' | 'not_sent' | 'too_long' | null;
export type ChatSnapshot = Readonly<{ phase: ChatPhase; turns: readonly LiveTurn[]; notice: ChatNotice }>;

export type ChatSessionConfig = {
  native: Native;
  accountId: string;
  /** The open video, or none for New video: the first send creates the native thread. */
  conversationId?: string;
  /** Saved message ids already shown, so a re-read can tell a new message from an older one with the same text. */
  knownMessageIds(): ReadonlySet<string>;
  /** The draft was accepted (or found saved): clear it. */
  clearDraft(): void;
  /** A New video's first send was accepted: the thread becomes this video (URL, Recents). */
  onStarted(thread: NativeThread): void;
  /**
   * An unconfirmed send was found saved: show history as re-read (newest first, as the server returns it).
   * `thread` is the New video's thread, or null when the video was already saved.
   */
  onConfirmed(thread: NativeThread | null, page: NativeMessages): void;
  /** A turn from this page ended. */
  onSettled?(): void;
};

/** Definite rejections: the server answered and the message was not accepted. Anything else is unknown. */
const definite: ReadonlySet<ClientError['code']> = new Set(['invalid_input', 'unauthenticated', 'not_found', 'integration_failure', 'not_implemented', 'unsupported']);
export const chatInputBytes = nativeTransportLimits.inputBytes;
export const tooLong = (text: string) => new TextEncoder().encode(text).byteLength > chatInputBytes;
/** Enter sends; Shift+Enter is a newline; an Enter that confirms an IME composition is neither. */
export const sendsOnEnter = (key: { key: string; shiftKey: boolean; isComposing: boolean; keyCode: number }) => key.key === 'Enter' && !key.shiftKey && !key.isComposing && key.keyCode !== 229;

/**
 * Composer state for one video in one page. Never resends on its own: an unknown outcome is
 * re-read once, then waits for "Check again" or "Send anyway". Dispose drops every late event.
 */
export function createChatSession(config: ChatSessionConfig) {
  let state: ChatSnapshot = { phase: 'idle', turns: [], notice: null };
  let alive = true, threadId = config.conversationId, started = config.conversationId !== undefined, keys = 0;
  let observation: NativeObservation | null = null;
  // A thread created for New video, adopted as the video once its first send is accepted.
  let startedThread: NativeThread | null = null;
  let pending: { text: string; fromDraft: boolean } | null = null;
  const listeners = new Set<() => void>();
  const sentIds = new Set<string>();
  const update = (patch: Partial<ChatSnapshot>) => { if (!alive) return; state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const patchTurn = (key: number, patch: Partial<LiveTurn>) => update({ turns: state.turns.map(turn => turn.key === key ? { ...turn, ...patch } : turn) });
  const close = () => { observation?.close(); observation = null; };
  const known = () => new Set([...config.knownMessageIds(), ...sentIds]);

  /** `rejected`: nothing was sent. Otherwise the send was accepted or its outcome is unknown. */
  async function submit(text: string, fromDraft: boolean): Promise<'rejected' | 'sent'> {
    if (!alive || state.phase !== 'idle' || !text.trim()) return 'rejected';
    if (tooLong(text)) { update({ notice: 'too_long' }); return 'rejected'; }
    update({ phase: 'sending', notice: null });
    const scope = { resourceId: config.accountId };
    if (!threadId) {
      const created = await config.native.createConversation(scope);
      if (!alive) return 'rejected';
      if (!created.ok) { update({ phase: 'idle', notice: 'not_sent' }); return 'rejected'; }
      threadId = created.value.id;
      startedThread = created.value;
    }
    const id = threadId;
    // Observe before sending so no reply chunk is missed.
    const subscribed = await config.native.subscribe({ threadId: id, resourceId: config.accountId });
    if (!alive) { if (subscribed.ok) subscribed.value.close(); return 'rejected'; }
    if (!subscribed.ok) { update({ phase: 'idle', notice: 'not_sent' }); return 'rejected'; }
    observation = subscribed.value;
    const sent = await config.native.sendText({ threadId: id, resourceId: config.accountId, message: text });
    if (!alive) { close(); return 'sent'; }
    if (!sent.ok) {
      close();
      if (sent.error.code === 'busy') { update({ phase: 'idle', notice: 'busy' }); return 'rejected'; }
      if (definite.has(sent.error.code)) { update({ phase: 'idle', notice: 'not_sent' }); return 'rejected'; }
      pending = { text, fromDraft };
      await check();
      return 'sent';
    }
    sentIds.add(sent.value.inputMessageId);
    if (fromDraft) config.clearDraft();
    if (!started && startedThread) { started = true; config.onStarted(startedThread); }
    const key = ++keys;
    update({ phase: 'working', turns: [...state.turns, { key, text, reply: '', state: 'streaming', retried: false }] });
    const current = observation;
    const result = await current.consumeTurn(sent.value.runId, part => { if (alive) patchTurn(key, { reply: (state.turns.find(turn => turn.key === key)?.reply ?? '') + part.text }); });
    if (!alive) return 'sent';
    if (observation === current) observation = null;
    patchTurn(key, { state: !result.ok ? 'lost' : result.value.outcome === 'complete' ? 'completed' : result.value.outcome });
    update({ phase: 'idle' });
    config.onSettled?.();
    return 'sent';
  }

  /** Re-read history once: a new user message with this text means the send landed. */
  async function check() {
    if (!alive || !pending || !threadId) return;
    update({ phase: 'checking', notice: null });
    const id = threadId, text = pending.text, before = known();
    const read = await config.native.loadMessages({ id, resourceId: config.accountId, page: 0, perPage: 20 });
    if (!alive) return;
    const found = read.ok && read.value.messages.some(message => message.role === 'user' && !before.has(message.id) && message.content.parts.map(part => part.type === 'text' ? part.text : '').join('') === text);
    if (!read.ok || !found) { update({ phase: 'unconfirmed' }); return; }
    if (pending.fromDraft) config.clearDraft();
    const thread = started ? null : startedThread;
    pending = null; started = true;
    for (const message of read.value.messages) sentIds.add(message.id);
    // Saved history now holds these turns; drop the live copies so nothing shows twice.
    update({ phase: 'idle', turns: [] });
    config.onConfirmed(thread, read.value);
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Send the composer draft. The draft is cleared only once the send is accepted or found saved. */
    send: async (text: string) => { await submit(text, true); },
    /** One new attempt for a failed or interrupted turn: the same text, sent again. */
    retry(key: number) {
      const turn = state.turns.find(candidate => candidate.key === key);
      if (!turn || turn.retried || (turn.state !== 'failed' && turn.state !== 'interrupted') || state.phase !== 'idle') return Promise.resolve();
      // Disabled at once against double presses; given back if nothing was sent.
      patchTurn(key, { retried: true });
      return submit(turn.text, false).then(outcome => { if (outcome === 'rejected') patchTurn(key, { retried: false }); });
    },
    checkAgain: () => state.phase === 'unconfirmed' ? check() : Promise.resolve(),
    /** Explicitly send the unconfirmed text again; this may duplicate the message and turn. */
    sendAnyway() {
      if (state.phase !== 'unconfirmed' || !pending) return Promise.resolve();
      const { text, fromDraft } = pending; pending = null;
      update({ phase: 'idle' });
      return submit(text, fromDraft).then(() => undefined);
    },
    /** The draft changed; drop a stale too-long or not-sent notice. */
    edited() { if (state.notice === 'too_long' || state.notice === 'not_sent') update({ notice: null }); },
    /** Observer disconnect only: the server turn keeps running. Never Stop. */
    dispose() { if (!alive) return; close(); alive = false; listeners.clear(); },
  };
}
export type ChatSession = ReturnType<typeof createChatSession>;
