import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ApiClient } from '@workprint/api-client';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { initiateUpload, uploadFeedback } from '../uploads/uploads.js';
import './composer.css';

export type ComposerDraft = { value: string; onChange(value: string): void };

/** Only explicit presses call the supported unavailable-native boundary. */
export function Composer({ native, working = false, docked = false, placeholder = 'Describe your video…', draft, connection, scope }: { native: ApiClient['native']; working?: boolean; docked?: boolean; placeholder?: string; draft?: ComposerDraft; connection?: BrowserClient; scope?: ReadScope | null }) {
  const [localText, setLocalText] = useState('');
  const text = draft?.value ?? localText;
  const setText = draft?.onChange ?? setLocalText;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  useEffect(() => () => { active.current = false; }, []);
  const send = async () => {
    if (pending || !text.trim()) return;
    setPending(true);
    try { await native.sendText(); if (active.current) setFeedback('Sending messages is not available yet. Your message is kept.'); }
    finally { if (active.current) setPending(false); }
  };
  const stop = async () => { await native.stop(); if (active.current) setFeedback('Stopping is not available yet.'); };
  // There is no transfer step in this milestone: an initiation is never presented as a saved file.
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file || uploading) return;
    setUploading(true); setFeedback(null);
    try {
      const outcome = await initiateUpload(connection ?? { kind: 'missing' }, scope?.conversationId, file);
      if (!active.current) return;
      // A successful initiation still has no transfer or confirmation in this build.
      setFeedback(outcome.kind === 'initiated' ? uploadFeedback.unavailable : outcome.feedback);
    } finally { if (active.current) setUploading(false); }
  };
  return <>
    <form className={`wp-opening-composer${docked ? ' wp-chat-docked' : ''}`} onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <textarea className="wp-opening-field wp-chat-input" aria-label="Message" placeholder={placeholder} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="wp-opening-bar"><button type="button" className="wp-opening-attach" aria-label="Attach a file" disabled={uploading} onClick={() => fileInput.current?.click()}><span aria-hidden="true">+</span>{docked ? 'Attach' : 'Attach photos'}</button><input ref={fileInput} className="wp-sr-only" type="file" accept="image/*,video/*" aria-label="Choose an image or video" onChange={(event) => void upload(event)} /><div className="wp-chat-actions">{working && <Button variant="secondary" onPress={() => void stop()}>Stop</Button>}<Button type="submit" isDisabled={pending || !text.trim()}>Send</Button></div></div>
    </form>
    {feedback && <p className="wp-chat-feedback" role="status">{feedback}</p>}
  </>;
}
