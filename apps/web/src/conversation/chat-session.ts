import { nativeTransportLimits, type ApiClient, type ClientError, type NativeMessages, type NativeObservation, type NativeThread, type NativeToolActivity, type NativeToolActivityChunk } from '@workprint/api-client';

type Native = Pick<ApiClient['native'], 'createConversation' | 'subscribe' | 'sendText' | 'loadMessages' | 'stop'>;

/** A run of reply text, or one tool's activity line with when this page first saw it running. */
export type LivePart = Readonly<{ kind: 'text'; text: string } | { kind: 'activity'; activity: NativeToolActivity; startedAt?: number }>;
/** One turn sent from this page: the user's text and the reply as it streams, in the order it arrived. */
export type LiveTurn = Readonly<{
  key: number;
  text: string;
  parts: readonly LivePart[];
  /** failed: the server ended the turn with an error. lost: this page stopped receiving it; it may still finish. */
  state: 'streaming' | 'completed' | 'failed' | 'interrupted' | 'lost';
  /** A failed or interrupted turn offers Retry once; Retry starts a new turn. */
  retried: boolean;
  /**
   * Set once Stop is pressed. stopped: the server acknowledged the Stop and the turn ended interrupted.
   * unacknowledged: the turn ended interrupted, but the server did not acknowledge this Stop.
   * unconfirmed: this page stopped hearing the turn, so it may still be running.
   */
  stop?: 'stopping' | 'stopped' | 'unacknowledged' | 'unconfirmed';
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
  /** Clock for activity elapsed time; tests supply their own. */
  now?(): number;
  /** How long after Stop the turn settles here even without an outcome; tests shorten it. */
  stopSettleMs?: number;
};

/** Definite rejections: the server answered and the message was not accepted. Anything else is unknown. */
const definite: ReadonlySet<ClientError['code']> = new Set(['invalid_input', 'unauthenticated', 'not_found', 'integration_failure', 'not_implemented', 'unsupported']);
export const chatInputBytes = nativeTransportLimits.inputBytes;
/** After Stop, the chat settles within this long even if the outcome never arrives (the story allows 10 s). */
export const stopSettleMs = 8000;
export const tooLong = (text: string) => new TextEncoder().encode(text).byteLength > chatInputBytes;
/** The reply's text so far, without activity lines. */
export const replyText = (turn: LiveTurn) => turn.parts.map(part => part.kind === 'text' ? part.text : '').join('');

/** Appends streamed text, extending the last text run. */
function withText(parts: readonly LivePart[], text: string): LivePart[] {
  const last = parts.at(-1);
  return last?.kind === 'text' ? [...parts.slice(0, -1), { kind: 'text', text: last.text + text }] : [...parts, { kind: 'text', text }];
}
/** Adds a tool's line, or moves its existing line on (running → done or failed). */
function withActivity(parts: readonly LivePart[], chunk: NativeToolActivityChunk, now: number): LivePart[] {
  const activity: NativeToolActivity = { toolCallId: chunk.toolCallId, tool: chunk.tool, phrase: chunk.phrase, state: chunk.state, ...(chunk.summary !== undefined ? { summary: chunk.summary } : {}) };
  const index = parts.findIndex(part => part.kind === 'activity' && part.activity.toolCallId === activity.toolCallId);
  if (index < 0) return [...parts, { kind: 'activity', activity, startedAt: now }];
  return parts.map((part, at) => at === index && part.kind === 'activity' ? { ...part, activity } : part);
}
/**
 * A turn the server ended leaves no line running. A lost turn may still be running, so its lines stay
 * running but stop counting time: this page no longer watches them.
 */
const settledParts = (parts: readonly LivePart[], lost: boolean): LivePart[] => parts.map(part => part.kind !== 'activity' || part.activity.state !== 'running' ? part
  : lost ? { kind: 'activity', activity: part.activity } : { ...part, activity: { ...part.activity, state: 'incomplete' } });

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
  // The turn this page is watching, so Stop names its exact run. `acknowledged` is the server's answer to Stop (bounded by the client).
  let active: { key: number; threadId: string; runId: string; settled: boolean; acknowledged?: Promise<boolean>; deadline?: ReturnType<typeof setTimeout> } | null = null;
  // A thread created for New video, adopted as the video once its first send is accepted.
  let startedThread: NativeThread | null = null;
  let pending: { text: string; fromDraft: boolean } | null = null;
  const listeners = new Set<() => void>();
  const sentIds = new Set<string>();
  const update = (patch: Partial<ChatSnapshot>) => { if (!alive) return; state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const patchTurn = (key: number, patch: Partial<LiveTurn>) => update({ turns: state.turns.map(turn => turn.key === key ? { ...turn, ...patch } : turn) });
  const close = () => { observation?.close(); observation = null; };
  const known = () => new Set([...config.knownMessageIds(), ...sentIds]);
  const now = config.now ?? Date.now;
  const partsOf = (key: number) => state.turns.find(turn => turn.key === key)?.parts ?? [];

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
    const run: NonNullable<typeof active> = { key, threadId: id, runId: sent.value.runId, settled: false };
    active = run;
    update({ phase: 'working', turns: [...state.turns, { key, text, parts: [], state: 'streaming', retried: false }] });
    const current = observation;
    const result = await current.consumeTurn(sent.value.runId,
      part => { if (alive) patchTurn(key, { parts: withText(partsOf(key), part.text) }); },
      activity => { if (alive) patchTurn(key, { parts: withActivity(partsOf(key), activity, now()) }); });
    if (!alive || run.settled) return 'sent';
    if (observation === current) observation = null;
    const outcome = !result.ok ? 'lost' : result.value.outcome === 'complete' ? 'completed' : result.value.outcome;
    const stopping = state.turns.find(turn => turn.key === key)?.stop === 'stopping';
    if (stopping && (outcome === 'interrupted' || outcome === 'lost')) {
      // "Stopped" needs both: the turn ended interrupted and the server acknowledged this Stop.
      const stop = outcome === 'lost' ? 'unconfirmed' : await run.acknowledged === true ? 'stopped' : 'unacknowledged';
      if (alive) settle(run, 'interrupted', outcome === 'lost', stop);
    } else settle(run, outcome, !result.ok);
    return 'sent';
  }

  /** Ends this page's view of a turn once: its state, its lines, and the composer becomes available again. */
  function settle(run: NonNullable<typeof active>, outcome: LiveTurn['state'], lost: boolean, stop?: Exclude<LiveTurn['stop'], 'stopping'>) {
    if (run.settled) return;
    run.settled = true; clearTimeout(run.deadline);
    if (active === run) active = null;
    // Without `stop`, a Stop that lost the race to a reply that ended anyway leaves the reply as it ended.
    update({ phase: 'idle', turns: state.turns.map(turn => turn.key !== run.key ? turn
      : { key: turn.key, text: turn.text, retried: turn.retried, parts: settledParts(turn.parts, lost), state: outcome, ...(stop ? { stop } : {}) }) });
    config.onSettled?.();
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
      if (!turn || turn.retried || (turn.state !== 'failed' && turn.state !== 'interrupted') || turn.stop === 'unconfirmed' || state.phase !== 'idle') return Promise.resolve();
      // Disabled at once against double presses; given back if nothing was sent.
      patchTurn(key, { retried: true });
      return submit(turn.text, false).then(outcome => { if (outcome === 'rejected') patchTurn(key, { retried: false }); });
    },
    /**
     * Stop this page's running turn by its exact run id. The chat settles when the turn ends, or after
     * `stopSettleMs` without an outcome; closing the page or switching video never sends a Stop.
     */
    async stop() {
      const run = active;
      const turn = run && state.turns.find(candidate => candidate.key === run.key);
      if (!alive || !run || !turn || turn.stop || state.phase !== 'working') return;
      patchTurn(run.key, { stop: 'stopping' });
      run.deadline = setTimeout(() => {
        if (run.settled || !alive) return;
        // Give up watching (observer only), never a second Stop.
        if (active === run) close();
        settle(run, 'interrupted', true, 'unconfirmed');
      }, config.stopSettleMs ?? stopSettleMs);
      run.acknowledged = config.native.stop({ threadId: run.threadId, resourceId: config.accountId, runId: run.runId }).then(result => result.ok && result.value.abortRequested);
      await run.acknowledged;
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
    dispose() { if (!alive) return; clearTimeout(active?.deadline); close(); alive = false; listeners.clear(); },
  };
}
export type ChatSession = ReturnType<typeof createChatSession>;
