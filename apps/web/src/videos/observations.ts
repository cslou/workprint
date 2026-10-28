import { sameRequest, type GenerationRequest } from './reads.js';

const statusOrder = (request: GenerationRequest) => {
  switch (request.status) {
    case 'queued': return 0;
    case 'submitting': return 1;
    case 'running': return 2;
    default: return 3;
  }
};
/** Public requests have no revision: accept forward states, never rank terminal outcomes. */
export function newerRequest(known: GenerationRequest, observed: GenerationRequest) {
  return sameRequest(known, observed) && statusOrder(observed) > statusOrder(known) ? observed : known;
}
export function requestIdentity(request: GenerationRequest) {
  return JSON.stringify([request.id, request.batchId, request.proposalId, request.purpose, request.target]);
}
/** Scope-owned observation union. Missing rows are not deletion authority. */
export function mergeRequestObservations(known: GenerationRequest[], ...sources: readonly (readonly GenerationRequest[])[]) {
  const merged = new Map(known.map(request => [requestIdentity(request), request]));
  let changed = false;
  for (const source of sources) for (const observed of source) {
    const key = requestIdentity(observed), previous = merged.get(key);
    const next = previous ? newerRequest(previous, observed) : observed;
    if (previous !== next) { merged.set(key, next); changed = true; }
  }
  return changed ? [...merged.values()] : known;
}
