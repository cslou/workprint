export const workflowFixtureLimits = Object.freeze({ concurrent: 2, waitMs: 5000, runMs: 10000 });

/** Ephemeral admission permits, never workflow state, identity or ownership authority. */
export function nativeWorkflowBudget() {
  const leases = new Map<string, { release: () => void; suspend: () => void; resume: () => void }>();
  let active = 0, peak = 0, rejected = 0, timers = 0, runExpired = 0, waitExpired = 0, errors = 0;
  const reserve = () => {
    if (active >= workflowFixtureLimits.concurrent) { rejected++; return undefined; }
    active++; peak = Math.max(peak, active);
    let runId: string | undefined, released = false;
    let runTimer: ReturnType<typeof setTimeout> | undefined, waitTimer: ReturnType<typeof setTimeout> | undefined;
    const clearWait = () => { if (waitTimer) { clearTimeout(waitTimer); waitTimer = undefined; timers--; } };
    const release = () => {
      if (released) return;
      released = true; active--; clearWait();
      if (runTimer) { clearTimeout(runTimer); runTimer = undefined; timers--; }
      if (runId) leases.delete(runId);
    };
    return { release, bind(id: string, cancelNative: () => Promise<void>) {
      if (released || runId || leases.has(id)) throw new Error('Native fixture permit bound more than once');
      runId = id;
      const cancel = () => { void cancelNative().then(release, () => {
        errors++; console.error('Native workflow fixture cancellation failed; capacity remains reserved');
      }); };
      timers++; runTimer = setTimeout(() => { runTimer = undefined; timers--; runExpired++; cancel(); }, workflowFixtureLimits.runMs);
      leases.set(id, { release, resume: clearWait, suspend: () => {
        clearWait(); timers++; waitTimer = setTimeout(() => { waitTimer = undefined; timers--; waitExpired++; cancel(); }, workflowFixtureLimits.waitMs);
      } });
    } };
  };
  return { reserve, release: (id: string) => leases.get(id)?.release(), suspend: (id: string) => leases.get(id)?.suspend(), resume: (id: string) => leases.get(id)?.resume(),
    state: () => ({ active, peak, rejected, timers, runExpired, waitExpired, errors }),
  };
}
export type NativeWorkflowBudget = ReturnType<typeof nativeWorkflowBudget>;
