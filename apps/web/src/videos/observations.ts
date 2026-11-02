import { requestIdentity, sameRequest, type GenerationRequest } from './reads.js';

const statusOrder = (request: GenerationRequest) => {
  switch (request.status) {
    case 'queued': return 0;
    case 'submitting': return 1;
    case 'running': return 2;
    case 'interrupted': return 3;
    default: return 4;
  }
};
/**
 * A saved video job carries its revision, so the later read wins, including a move back from `interrupted`
 * to `running` on resume. Other requests have none: accept forward states, never rank terminal outcomes. Without a
 * revision a Stop is shown but a resume isn't; only video jobs resume, and they carry one.
 */
export function newerRequest(known: GenerationRequest, observed: GenerationRequest) {
  if (!sameRequest(known, observed)) return known;
  if (known.purpose === 'video' && observed.purpose === 'video') return observed.revision > known.revision ? observed : known;
  return statusOrder(observed) > statusOrder(known) ? observed : known;
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
