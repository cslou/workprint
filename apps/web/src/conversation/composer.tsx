import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { ApiClient, UploadSession } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { confirmFeedback, uploadFeedback } from '../uploads/uploads.js';
import { useUpload } from '../uploads/use-upload.js';
import { UploadStatus } from '../uploads/status.js';
import { sendsOnEnter, tooLong, type ChatSession } from './chat-session.js';
import { useChatSnapshot } from './use-chat.js';
import './composer.css';

export type ComposerDraft = { value: string; onChange(value: string): void };
const chatCopy = {
  busy: 'The agent is still working on the last message.',
  not_sent: 'Your message wasn’t sent. It’s still here, so you can try again.',
  too_long: 'Messages can be up to 32 KB. Shorten this one to send it.',
} as const;

/** With a chat session, sends and shows its state; without one, explicit presses reach the unavailable-native boundary. */
export function Composer({ native, chat, sendBlocked = false, docked = false, placeholder = 'Describe your video…', draft, connection, scope, uploadSession, onUploaded }: { uploadSession?: UploadSession; onUploaded?(result: OperationResponse<'confirmUpload'>): void; native: ApiClient['native']; chat?: ChatSession | null; sendBlocked?: boolean; docked?: boolean; placeholder?: string; draft?: ComposerDraft; connection?: BrowserClient; scope?: ReadScope | null }) {
  const [localText, setLocalText] = useState('');
  const text = draft?.value ?? localText;
  const setText = draft?.onChange ?? setLocalText;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const chatState = useChatSnapshot(chat);
  const { phase } = chatState;
  const over = tooLong(text);
  // The draft is locked while its send is in flight or its outcome is unknown.
  const locked = phase === 'sending' || phase === 'checking' || phase === 'unconfirmed';
  const uploadState = useUpload(connection, scope, uploadSession);
  const uploading = ['authorizing', 'uploading', 'verifying'].includes(uploadState.state.phase);
  const fileInput = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  useEffect(() => () => { active.current = false; }, []);
  const canSend = phase === 'idle' && !sendBlocked && !pending && !over && !!text.trim();
  const send = async () => {
    if (!canSend) return;
    if (chat) { setFeedback(null); await chat.send(text); return; }
    setPending(true);
    try { await native.sendText(); if (active.current) setFeedback('Sending messages is not available yet. Your message is kept.'); }
    finally { if (active.current) setPending(false); }
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!sendsOnEnter({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.keyCode })) return;
    event.preventDefault(); void send();
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget, file = input.files?.[0]; input.value = '';
    if (!file || uploading) return; setFeedback(null);
    const saved = await uploadState.session.select(file);
    if (saved) onUploaded?.(saved);
  };
  const closeUpload = () => { uploadState.session.close(); fileInput.current?.parentElement?.querySelector('button')?.focus(); };
  const blockedCopy = uploadState.state.confirmationStarted ? confirmFeedback : uploadFeedback;
  const blocked = uploadState.state.phase === 'blocked' ? uploadState.state.failure === 'unauthenticated' ? blockedCopy.unauthenticated : uploadState.state.failure === 'not_implemented' ? blockedCopy.unavailable : blockedCopy.error : null;
  const chatFeedback = over ? chatCopy.too_long : chatState.notice ? chatCopy[chatState.notice] : null;
  const unconfirmed = phase === 'unconfirmed' || phase === 'checking';
  return <>
    {chat && unconfirmed && <div className="wp-chat-unconfirmed"><p role="status">{phase === 'checking' ? 'Checking whether your message was sent…' : 'We couldn’t confirm your message was sent.'}</p><div className="wp-native-actions"><Button variant="secondary" isDisabled={phase === 'checking'} onPress={() => void chat.checkAgain()}>Check again</Button><Button variant="secondary" isDisabled={phase === 'checking'} onPress={() => void chat.sendAnyway()}>Send anyway</Button></div></div>}
    <form className={`wp-opening-composer${docked ? ' wp-chat-docked' : ''}`} onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <textarea className="wp-opening-field wp-chat-input" aria-label="Message" placeholder={placeholder} value={text} readOnly={locked} onKeyDown={keyDown} onChange={(event) => { setText(event.target.value); chat?.edited(); }} />
      <div className="wp-opening-bar"><button type="button" className="wp-opening-attach" aria-label="Attach a file" disabled={uploading} onClick={() => fileInput.current?.click()}><span aria-hidden="true">+</span>{docked ? 'Attach' : 'Attach photos'}</button><input ref={fileInput} className="wp-sr-only" type="file" accept="image/png,image/jpeg" aria-label="Choose a JPEG or PNG image" onChange={(event) => void upload(event)} /><div className="wp-chat-actions">{phase === 'working' && <span className="wp-working-label" role="status"><i aria-hidden="true" />Working…</span>}<Button type="submit" isDisabled={!canSend}>Send</Button></div></div>
    </form>
    <p className="wp-upload-guidance">JPEG or PNG only · Up to 10 MiB · 4096 × 4096 pixels. Video uploads are temporarily unavailable.</p>
    <UploadStatus state={uploadState.state} session={uploadState.session} connection={connection} choose={() => fileInput.current?.click()} close={closeUpload} {...(onUploaded ? { onSaved: onUploaded } : {})} />
    {(feedback || chatFeedback || blocked) && <p className="wp-chat-feedback" role="status">{feedback ?? chatFeedback ?? blocked}</p>}
  </>;
}
