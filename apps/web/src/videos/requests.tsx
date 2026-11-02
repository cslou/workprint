import { useCallback, useRef, useState } from 'react';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { EmptyState, PanelSection } from '../ui/panel.js';
import { Feedback, StatusPill } from '../ui/status.js';
import { orderedStoryboard } from '../workspace/projection.js';
import { requestIdentity, sameRequest, useGenerationRequest, useGenerationRequests, type GenerationRequest } from './reads.js';
import { mergeRequestObservations, newerRequest } from './observations.js';
import './requests.css';

type Props = { connection: BrowserClient; scope: ReadScope | null; workspace: OperationResponse<'workspace'> };
const readCopy = (surface: 'list' | 'details', code: string) => surface === 'list' ? code === 'unauthenticated' ? 'Sign-in required to load generation requests.' : code === 'not_implemented' ? 'Generation requests are not available yet.' : 'Generation requests could not be loaded.' : code === 'unauthenticated' ? 'Sign-in required to load request details.' : code === 'not_implemented' ? 'Request details are not available yet.' : 'Request details could not be loaded.';
/** The saved state in words, for the states that need more than their pill. MiniMax copy is for video jobs only. */
function stateCopy(request: GenerationRequest) {
  if (request.status === 'interrupted') return 'Stopped waiting. Ask the agent to resume it.';
  if (request.status !== 'failed' || request.purpose !== 'video') return null;
  switch (request.failureReason) {
    case 'outcome_unknown': return 'MiniMax may have started this video, but its result is unknown.';
    case 'expired': return 'MiniMax no longer keeps this video.';
    case 'check_refused': return 'The video didn’t pass checks.';
    default: return 'MiniMax couldn’t make this video.';
  }
}
function targetDisplay(request: GenerationRequest, workspace: Props['workspace']) {
  if (request.purpose === 'video') return { title: 'Video request', detail: 'Video request' };
  if (request.purpose === 'reference_image') return { title: 'Image request', detail: 'Image request' };
  const shotId = request.target.shotId;
  const shot = orderedStoryboard(workspace.storyboard.shots)?.find(row => row.shot.shotId === shotId);
  if (!shot) return null;
  if (request.purpose === 'shot_video') return { title: `Shot ${shot.number} · Video request`, detail: `Shot video · Shot ${shot.number}` };
  const panelId = request.target.panelId;
  const panel = shot.panels.find(row => row.panel.panelId === panelId);
  return panel ? { title: `Shot ${shot.number} · Panel ${shot.number}.${panel.number} · Image request`, detail: `Panel image · Shot ${shot.number} · Panel ${shot.number}.${panel.number}` } : null;
}
export function GenerationRequests(props: Props) {
  return <ScopedRequests key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId])} {...props} />;
}
function ScopedRequests({ connection, scope, workspace }: Props) {
  const read = useGenerationRequests(connection.kind === 'configured' ? connection.client : null, scope);
  const [known, setKnown] = useState<GenerationRequest[]>([]);
  const supplied = mergeRequestObservations(known, workspace.videos, read.kind === 'settled' && read.result.ok ? read.result.value : []);
  if (supplied !== known) setKnown(supplied);
  const observe = useCallback((request: GenerationRequest) => setKnown(previous => mergeRequestObservations(previous, [request])), []);
  const valid = new Set(supplied.map(request => request.id)).size === supplied.length;
  const requests = valid ? supplied : [];
  const error = !valid ? 'invalid_response' : read.kind === 'settled' && !read.result.ok ? read.result.error.code : null;
  return <PanelSection title="Generation requests"><div className="wp-generation-requests">
    {requests.map(request => {
      const display = targetDisplay(request, workspace);
      // A request whose Shot or Panel isn't in the current storyboard is shown alone as unreadable.
      return display
        ? <RequestCard key={requestIdentity(request)} connection={connection} scope={scope} request={request} onObserved={observe} display={display} />
        : <div key={requestIdentity(request)} className="wp-request-card" data-request-id={request.id}><Feedback>This request can’t be shown</Feedback></div>;
    })}
    {error ? <EmptyState><Feedback>{readCopy('list', error)}</Feedback></EmptyState> : read.kind === 'loading' ? <EmptyState>Loading generation requests…</EmptyState> : !requests.length ? <EmptyState>No generation requests yet.</EmptyState> : null}
    <p className="wp-request-disclaimer">Request status does not confirm that remote work or charges have stopped.</p>
  </div></PanelSection>;
}
function RequestCard({ connection, scope, request, display, onObserved }: Pick<Props, 'connection' | 'scope'> & { request: GenerationRequest; display: { title: string; detail: string }; onObserved(request: GenerationRequest): void }) {
  const [open, setOpen] = useState(false);
  const latest = useRef(request); latest.current = request;
  const retain = useCallback((observed: GenerationRequest) => { if (sameRequest(latest.current, observed)) onObserved(observed); }, [onObserved]);
  const read = useGenerationRequest(connection.kind === 'configured' ? connection.client : null, scope, request.id, open, retain);
  const observed = read.kind === 'settled' && read.result.ok && sameRequest(request, read.result.value) ? read.result.value : null;
  const current = observed ? newerRequest(request, observed) : request;
  const copy = stateCopy(current);
  // No card offers Cancel: cancelling at the provider isn't implemented (B-029).
  return <div className="wp-request-card" data-request-id={request.id}>
    <b>{display.title}</b><StatusPill state={current.status} />
    {copy && <p className="wp-request-state">{copy}</p>}
    <details className="wp-request-details" onToggle={event => setOpen(event.currentTarget.open)}><summary>Request details</summary>{read.kind === 'settled' && (!read.result.ok || !observed) ? <EmptyState><Feedback>{readCopy('details', read.result.ok ? 'invalid_response' : read.result.error.code)}</Feedback></EmptyState> : <p>{display.detail}</p>}</details>
  </div>;
}
