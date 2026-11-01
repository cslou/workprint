import { Button } from '../ui/controls.js';
import type { LiveTurn } from './chat-session.js';
import './live-turns.css';

const notices = {
  failed: 'Something went wrong and this reply didn’t finish.',
  interrupted: 'This reply was interrupted.',
  // The page stopped hearing the reply; the server may still finish it, so claim nothing and offer no Retry.
  lost: 'We lost track of this reply. It may still finish; reload to see it.',
} as const;

/** Turns sent from this page, after the saved history: the reply streams in, then ends with its state. */
export function LiveTurns({ turns, canRetry, onRetry }: { turns: readonly LiveTurn[]; canRetry: boolean; onRetry(key: number): void }) {
  if (!turns.length) return null;
  return <ol className="wp-saved-messages" aria-label="New messages">{turns.flatMap(turn => {
    const notice = turn.state === 'streaming' || turn.state === 'completed' ? null : notices[turn.state];
    const retry = turn.state !== 'lost' && !turn.retried;
    return [
      <li key={`${turn.key}-user`} className="wp-saved-user" aria-label="Your message"><span>{turn.text}</span></li>,
      ...(turn.reply || notice ? [<li key={`${turn.key}-reply`} className="wp-saved-assistant" aria-label="Assistant message" aria-busy={turn.state === 'streaming'}>
        {turn.reply && <p>{turn.reply}</p>}
        {notice && <div className="wp-turn-notice"><p role="status">{notice}</p>{retry && <Button variant="secondary" isDisabled={!canRetry} onPress={() => onRetry(turn.key)}>Retry</Button>}</div>}
      </li>] : []),
    ];
  })}</ol>;
}
