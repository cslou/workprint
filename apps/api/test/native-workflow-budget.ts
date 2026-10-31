export const workflowFixtureLimits = Object.freeze({ concurrent: 2, waitMs: 5000, runMs: 10000 });

/** Ephemeral admission permits, never workflow state, identity or ownership authority. */
export function nativeWorkflowBudget() {
  const leases = new Map<string, { release: () => void; suspend: (remainingMs?: number) => void; resume: () => void }>();
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
    return { release, bind(id: string, cancelNative: () => Promise<void>, remainingRunMs: number = workflowFixtureLimits.runMs) {
      if (!Number.isFinite(remainingRunMs) || remainingRunMs < 0 || remainingRunMs > workflowFixtureLimits.runMs) throw new RangeError('Invalid remaining native run budget');
      if (released || runId || leases.has(id)) throw new Error('Native fixture permit bound more than once');
      runId = id;
      const cancel = () => { void cancelNative().then(release, () => {
        errors++; console.error('Native workflow fixture cancellation failed; capacity remains reserved');
      }); };
      timers++; runTimer = setTimeout(() => { runTimer = undefined; timers--; runExpired++; cancel(); }, remainingRunMs);
      leases.set(id, { release, resume: clearWait, suspend: (remainingWaitMs = workflowFixtureLimits.waitMs) => {
        if (!Number.isFinite(remainingWaitMs) || remainingWaitMs < 0 || remainingWaitMs > workflowFixtureLimits.waitMs) throw new RangeError('Invalid remaining native wait budget');
        clearWait(); timers++; waitTimer = setTimeout(() => { waitTimer = undefined; timers--; waitExpired++; cancel(); }, remainingWaitMs);
      } });
    } };
  };
  return { reserve, release: (id: string) => leases.get(id)?.release(), suspend: (id: string, remainingMs?: number) => leases.get(id)?.suspend(remainingMs), resume: (id: string) => leases.get(id)?.resume(),
    state: () => ({ active, peak, rejected, timers, runExpired, waitExpired, errors }),
  };
}
export type NativeWorkflowBudget = ReturnType<typeof nativeWorkflowBudget>;
