import { useEffect, useRef, useState } from 'react';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { EmptyState, PanelSection } from '../ui/panel.js';
import { Feedback, StatusPill } from '../ui/status.js';
import { orderedStoryboard } from '../workspace/projection.js';
import { sameRequest, unfinished, useGenerationRequest, useGenerationRequests, type GenerationRequest } from './reads.js';
import './requests.css';

type Props = { connection: BrowserClient; scope: ReadScope | null; workspace: OperationResponse<'workspace'> };
const readCopy = (surface: 'list' | 'details', code: string) => surface === 'list' ? code === 'unauthenticated' ? 'Sign-in required to load generation requests.' : code === 'not_implemented' ? 'Generation requests are not available yet.' : 'Generation requests could not be loaded.' : code === 'unauthenticated' ? 'Sign-in required to load request details.' : code === 'not_implemented' ? 'Request details are not available yet.' : 'Request details could not be loaded.';
const cancelCopy = (code: string) => code === 'unauthenticated' ? 'Sign-in required to cancel this request. The last known state is still shown.' : code === 'not_implemented' ? 'Cancelling this request is not available yet. The last known state is still shown.' : 'Request cancellation was not confirmed. The last known state is still shown.';
function targetDisplay(request: GenerationRequest, workspace: Props['workspace']) {
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
  const supplied = read.kind === 'settled' && read.result.ok ? read.result.value.map(observed => { const known = workspace.videos.find(request => sameRequest(request, observed)); return known && !unfinished(known) ? known : observed; }) : workspace.videos;
  const valid = new Set(supplied.map(request => request.id)).size === supplied.length && supplied.every(request => targetDisplay(request, workspace));
  const requests = valid ? supplied : [];
  const error = !valid ? 'invalid_response' : read.kind === 'settled' && !read.result.ok ? read.result.error.code : null;
  return <PanelSection title="Generation requests"><div className="wp-generation-requests">
    {requests.map(request => <RequestCard key={JSON.stringify([request.id, request.purpose, request.target])} connection={connection} scope={scope} request={request} display={targetDisplay(request, workspace)!} />)}
    {error ? <EmptyState><Feedback>{readCopy('list', error)}</Feedback></EmptyState> : read.kind === 'loading' ? <EmptyState>Loading generation requests…</EmptyState> : !requests.length ? <EmptyState>No generation requests yet.</EmptyState> : null}
    <p className="wp-request-disclaimer">Request status does not confirm that remote work or charges have stopped.</p>
  </div></PanelSection>;
}
function RequestCard({ connection, scope, request, display }: Pick<Props, 'connection' | 'scope'> & { request: GenerationRequest; display: { title: string; detail: string } }) {
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<GenerationRequest | null>(null);
  const active = useRef(true), busy = useRef(false), latest = useRef(request); latest.current = request;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const read = useGenerationRequest(connection.kind === 'configured' ? connection.client : null, scope, request.id, open);
  const observed = read.kind === 'settled' && read.result.ok && sameRequest(request, read.result.value) ? read.result.value : null;
  // Requests have no revision field: never rank or invent revisions for terminal snapshots.
  const current = !unfinished(request) ? request : cancelled && sameRequest(request, cancelled) ? cancelled : observed ?? request;
  const cancel = async () => {
    if (connection.kind !== 'configured' || !scope?.conversationId || busy.current || !unfinished(current)) return;
    busy.current = true; setPending(true); setFeedback(null);
    try {
      const result = await connection.client.cancelGeneration({ params: { id: current.id }, query: {}, body: { operationId: crypto.randomUUID() } });
      if (!active.current) return;
      if (!result.ok) { setFeedback(cancelCopy(result.error.code)); return; }
      if (!sameRequest(current, result.value.request)) { setFeedback(cancelCopy('invalid_response')); return; }
      if (!unfinished(latest.current)) return;
      setCancelled(result.value.request);
    } catch { if (active.current) setFeedback(cancelCopy('transport_failure')); }
    finally { busy.current = false; if (active.current) setPending(false); }
  };
  return <div className="wp-request-card" data-request-id={request.id}>
    <b>{display.title}</b><StatusPill state={current.status} />
    <details className="wp-request-details" onToggle={event => setOpen(event.currentTarget.open)}><summary>Request details</summary>{read.kind === 'settled' && (!read.result.ok || !observed) ? <EmptyState><Feedback>{readCopy('details', read.result.ok ? 'invalid_response' : read.result.error.code)}</Feedback></EmptyState> : <p>{display.detail}</p>}</details>
    {unfinished(current) && <div className="wp-request-action"><Button variant="secondary" isDisabled={pending || connection.kind !== 'configured' || !scope?.conversationId} onPress={() => void cancel()}>Cancel request</Button></div>}
    {feedback && <Feedback>{feedback}</Feedback>}
  </div>;
}
