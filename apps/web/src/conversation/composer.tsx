import { useState } from 'react';
import type { ApiClient } from '@workprint/api-client';
import { Button } from '../ui/controls.js';
import './composer.css';

/** Only explicit presses call the supported unavailable-native boundary. */
export function Composer({ native, working = false, docked = false, placeholder = 'Describe your video…' }: { native: ApiClient['native']; working?: boolean; docked?: boolean; placeholder?: string }) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<'send' | 'stop' | null>(null);
  const [pending, setPending] = useState(false);
  const send = async () => {
    if (pending || !text.trim()) return;
    setPending(true);
    try { await native.sendText(); setFeedback('send'); }
    finally { setPending(false); }
  };
  const stop = async () => { await native.stop(); setFeedback('stop'); };
  return <>
    <form className={`wp-opening-composer${docked ? ' wp-chat-docked' : ''}`} onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <textarea className="wp-opening-field wp-chat-input" aria-label="Message" placeholder={placeholder} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="wp-opening-bar"><span className="wp-opening-attach"><span>+</span>{docked ? 'Attach' : 'Attach photos'}</span><div className="wp-chat-actions">{working && <Button variant="secondary" onPress={() => void stop()}>Stop</Button>}<Button type="submit" isDisabled={pending || !text.trim()}>Send</Button></div></div>
    </form>
    {feedback && <p className="wp-chat-feedback" role="status">{feedback === 'send' ? 'Sending messages is not available yet. Your message is kept.' : 'Stopping is not available yet.'}</p>}
  </>;
}
