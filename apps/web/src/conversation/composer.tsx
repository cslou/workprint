import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ApiClient, UploadSession } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { confirmFeedback, uploadFeedback } from '../uploads/uploads.js';
import { useUpload } from '../uploads/use-upload.js';
import { UploadStatus } from '../uploads/status.js';
import './composer.css';

export type ComposerDraft = { value: string; onChange(value: string): void };

/** Only explicit presses call the supported unavailable-native boundary. */
export function Composer({ native, working = false, docked = false, placeholder = 'Describe your video…', draft, connection, scope, uploadSession, onUploaded }: { uploadSession?: UploadSession; onUploaded?(result: OperationResponse<'confirmUpload'>): void; native: ApiClient['native']; working?: boolean; docked?: boolean; placeholder?: string; draft?: ComposerDraft; connection?: BrowserClient; scope?: ReadScope | null }) {
  const [localText, setLocalText] = useState('');
  const text = draft?.value ?? localText;
  const setText = draft?.onChange ?? setLocalText;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const uploadState = useUpload(connection, scope, uploadSession);
  const uploading = ['authorizing', 'uploading', 'verifying'].includes(uploadState.state.phase);
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
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget, file = input.files?.[0]; input.value = '';
    if (!file || uploading) return; setFeedback(null);
    const saved = await uploadState.session.select(file);
    if (saved) onUploaded?.(saved);
  };
  const closeUpload = () => { uploadState.session.close(); fileInput.current?.parentElement?.querySelector('button')?.focus(); };
  const blockedCopy = uploadState.state.confirmationStarted ? confirmFeedback : uploadFeedback;
  const blocked = uploadState.state.phase === 'blocked' ? uploadState.state.failure === 'unauthenticated' ? blockedCopy.unauthenticated : uploadState.state.failure === 'not_implemented' ? blockedCopy.unavailable : blockedCopy.error : null;
  return <>
    <form className={`wp-opening-composer${docked ? ' wp-chat-docked' : ''}`} onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <textarea className="wp-opening-field wp-chat-input" aria-label="Message" placeholder={placeholder} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="wp-opening-bar"><button type="button" className="wp-opening-attach" aria-label="Attach a file" disabled={uploading} onClick={() => fileInput.current?.click()}><span aria-hidden="true">+</span>{docked ? 'Attach' : 'Attach photos'}</button><input ref={fileInput} className="wp-sr-only" type="file" accept="image/png,image/jpeg" aria-label="Choose a JPEG or PNG image" onChange={(event) => void upload(event)} /><div className="wp-chat-actions">{working && <Button variant="secondary" onPress={() => void stop()}>Stop</Button>}<Button type="submit" isDisabled={pending || !text.trim()}>Send</Button></div></div>
    </form>
    <p className="wp-upload-guidance">JPEG or PNG only · Up to 10 MiB · 4096 × 4096 pixels. Video uploads are temporarily unavailable.</p>
    <UploadStatus state={uploadState.state} session={uploadState.session} connection={connection} choose={() => fileInput.current?.click()} close={closeUpload} {...(onUploaded ? { onSaved: onUploaded } : {})} />
    {(feedback || blocked) && <p className="wp-chat-feedback" role="status">{feedback ?? blocked}</p>}
  </>;
}
