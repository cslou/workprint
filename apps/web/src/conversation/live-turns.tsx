import { Button } from '../ui/controls.js';
import type { LiveTurn } from './chat-session.js';
import './live-turns.css';

const notices = {
  failed: 'Something went wrong and this reply didn’t finish.',
  interrupted: 'This reply was interrupted.',
} as const;

/** Turns sent from this page, after the saved history: the reply streams in, then ends with its state. */
export function LiveTurns({ turns, canRetry, onRetry }: { turns: readonly LiveTurn[]; canRetry: boolean; onRetry(key: number): void }) {
  if (!turns.length) return null;
  return <ol className="wp-saved-messages" aria-label="New messages">{turns.flatMap(turn => {
    const notice = turn.state === 'failed' || turn.state === 'interrupted' ? notices[turn.state] : null;
    return [
      <li key={`${turn.key}-user`} className="wp-saved-user" aria-label="Your message"><span>{turn.text}</span></li>,
      ...(turn.reply || notice ? [<li key={`${turn.key}-reply`} className="wp-saved-assistant" aria-label="Assistant message" aria-busy={turn.state === 'streaming'}>
        {turn.reply && <p>{turn.reply}</p>}
        {notice && <div className="wp-turn-notice"><p role="status">{notice}</p>{!turn.retried && <Button variant="secondary" isDisabled={!canRetry} onPress={() => onRetry(turn.key)}>Retry</Button>}</div>}
      </li>] : []),
    ];
  })}</ol>;
}
