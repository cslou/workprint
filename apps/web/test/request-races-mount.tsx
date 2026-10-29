import { createRoot } from 'react-dom/client';
import type { ApiClient, ClientResult } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import { createBrowserClient } from '../src/api/client.js';
import { GenerationRequests } from '../src/videos/requests.js';
import { workspace, requests } from './storyboard-fixtures.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

// Controlled read-only observation completions, not a persisted product lifecycle/backend.
const base = createBrowserClient(window.location.origin, async () => null);
if (base.kind !== 'configured') throw new Error('Missing loopback client');
const lists: ((result: ClientResult<OperationResponse<'generationRequests'>>) => void)[] = [];
const details: ((result: ClientResult<OperationResponse<'generationRequest'>>) => void)[] = [];
let commands = 0;
const client: ApiClient = { ...base.client,
  generationRequests: () => new Promise(resolve => lists.push(resolve)),
  generationRequest: () => new Promise(resolve => details.push(resolve)),
  cancelGeneration: async () => { commands++; throw new Error('Observation must not cancel'); },
  native: { ...base.client.native, stop: async () => { commands++; throw new Error('Observation must not Stop'); } },
};
let projection = workspace, accountId = 'read-only-account';
const node = document.getElementById('root'); if (!node) throw new Error('Missing request race root');
const root = createRoot(node);
const render = () => root.render(<div className="wp-panel-body" style={{ width: 380 }}><GenerationRequests connection={{ kind: 'configured', client }} scope={{ accountId, conversationId: 'read-only-conversation' }} workspace={projection} /></div>);
(window as unknown as { requestRace: unknown }).requestRace = {
  start: render,
  terminal() { projection = { ...workspace, videos: requests.map(request => request.id === 'request-running' ? { ...request, status: 'succeeded' } : request) }; render(); },
  switchScope() { accountId = 'other-read-only-account'; projection = { ...workspace, videos: [] }; render(); },
  addRequest() { projection = { ...projection, videos: [...projection.videos, { ...requests[2]!, id: 'new-workspace-request' }] }; render(); },
  releaseTerminalDetail() { const resolve = details.shift(), original = requests.find(request => request.id === 'request-running'); if (!resolve || !original) throw new Error('Missing controlled terminal detail'); resolve({ ok: true, value: { ...original, status: 'succeeded' } }); },
  pending() { return { lists: lists.length, details: details.length }; },
  releaseList() { const resolve = lists.shift(); if (!resolve) throw new Error('Missing controlled list'); resolve({ ok: true, value: { items: requests, nextCursor: null } }); },
  releaseDetail() { const resolve = details.shift(), original = requests.find(request => request.id === 'request-running'); if (!resolve || !original) throw new Error('Missing controlled detail'); resolve({ ok: true, value: { ...original, status: 'queued' } }); },
  commands() { return commands; },
};
