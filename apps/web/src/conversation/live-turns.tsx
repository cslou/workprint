import { Button } from '../ui/controls.js';
import { ActivityLine } from './activity-line.js';
import type { LiveTurn } from './chat-session.js';
import './live-turns.css';

const notices = {
  failed: 'Something went wrong and this reply didn’t finish.',
  interrupted: 'This reply was interrupted.',
  // The page stopped hearing the reply; the server may still finish it, so claim nothing and offer no Retry.
  lost: 'We lost track of this reply. It may still finish; reload to see it.',
  stopped: 'Stopped.',
  // Says nothing about the provider: neither a Stop acknowledgment nor a local abort proves remote work or charges ended.
  unconfirmed: 'We couldn’t confirm the reply stopped.',
  // The reply ended, but the server never acknowledged this Stop: same honest copy, and Retry is safe.
  unacknowledged: 'We couldn’t confirm the reply stopped.',
} as const;

/** Decorative: the composer's Working… status already announces that the reply is running. */
const pendingDot = <span className="wp-pending-dot" aria-hidden="true" />;
/** The reply is running but has nothing to show yet: no parts, or only a finished tool line last. */
const waiting = (turn: LiveTurn) => {
  const last = turn.parts.at(-1);
  return turn.state === 'streaming' && (!last || last.kind === 'activity' && last.activity.state !== 'running');
};

/** Turns sent from this page, after the saved history: the reply streams in, then ends with its state. */
export function LiveTurns({ turns, canRetry, onRetry }: { turns: readonly LiveTurn[]; canRetry: boolean; onRetry(key: number): void }) {
  if (!turns.length) return null;
  return <ol className="wp-saved-messages" aria-label="New messages">{turns.flatMap(turn => {
    const notice = turn.state === 'streaming' || turn.state === 'completed' ? null : turn.state === 'interrupted' && turn.stop && turn.stop !== 'stopping' ? notices[turn.stop] : notices[turn.state];
    // A reply that may still be running offers no Retry: it could be duplicated.
    const retry = turn.state !== 'lost' && turn.stop !== 'unconfirmed' && !turn.retried, pending = waiting(turn);
    return [
      <li key={`${turn.key}-user`} className="wp-saved-user" aria-label="Your message"><span>{turn.text}</span></li>,
      ...(turn.parts.length || notice ? [<li key={`${turn.key}-reply`} className="wp-saved-assistant" aria-label="Assistant message" aria-busy={turn.state === 'streaming'}>
        {turn.parts.map((part, index) => part.kind === 'text' ? <p key={index}>{part.text}</p> : <ActivityLine key={part.activity.toolCallId} activity={part.activity} {...(part.startedAt !== undefined ? { startedAt: part.startedAt } : {})} />)}
        {pending && pendingDot}
        {notice && <div className="wp-turn-notice"><p role="status">{notice}</p>{retry && <Button variant="secondary" isDisabled={!canRetry} onPress={() => onRetry(turn.key)}>Retry</Button>}</div>}
      </li>] : pending ? [<li key={`${turn.key}-pending`} className="wp-reply-pending" aria-hidden="true">{pendingDot}</li>] : []),
    ];
  })}</ol>;
}
