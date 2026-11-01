import { AsyncLocalStorage } from 'node:async_hooks';

export type AcquisitionPhase = 'postgres-acquisition' | 'auth-acquisition' | 'auth-storage' | 'auth-mail-readiness' | 'storage-prepare' | 'storage-init' | 'storage-grants' | 'backend-startup';
export type FixtureResource = { owner: string; containerId: string };
export type SafeFixtureFailure = { phase: AcquisitionPhase; subtype: string; kind: string; code: string | number | null };
export type FixtureObserver = { operationTimeoutMs?: number; beforeCleanup(failure: SafeFixtureFailure, resources: readonly FixtureResource[], signal: AbortSignal): Promise<void>; stop(signal: AbortSignal): Promise<void> };
const observers = new AsyncLocalStorage<{ observer: FixtureObserver; observed?: Promise<unknown[]>; consumed?: boolean }>();

/** Opt-in test-process scope; no public fixture signature or normal caller behavior changes. */
export function withFixtureDiagnostics<T>(observer: FixtureObserver, action: () => Promise<T>): Promise<T> {
  return observers.run({ observer }, action);
}

export function describeFixtureFailure(error: unknown, phase: AcquisitionPhase): SafeFixtureFailure {
  const seen = new Set<unknown>();
  const classify = (value: unknown, depth = 0): string | undefined => {
    if (!(value instanceof Error) || seen.has(value) || depth > 8) return;
    seen.add(value);
    if (/^Isolated Auth\/mail startup deadline exceeded \(owned auth [a-f0-9]{64}\)$/.test(value.message)) return 'auth-mail-readiness';
    if (value.message === 'Postgres startup deadline exceeded') return 'postgres-startup';
    const account = /^Isolated account creation failed \((\d{3})\)$/.exec(value.message);
    if (account) return `auth-http-${account[1]}`;
    if (value.message === 'Serving storage unavailable or privileged; prepare storage separately and use restricted DATABASE_URL') return 'storage-serving-guard';
    // Existing acquisition helpers put the primary error first; cause can be a cleanup error.
    if (value instanceof AggregateError) for (const child of value.errors) { const result = classify(child, depth + 1); if (result) return result; }
    return classify(value.cause, depth + 1);
  };
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return {
    phase,
    subtype: classify(error) ?? (['storage-prepare', 'storage-init', 'storage-grants', 'auth-storage'].includes(phase) ? 'storage' : 'unknown'),
    kind: error instanceof AggregateError ? 'AggregateError' : 'Error',
    code: typeof code === 'number' && Number.isInteger(code) ? code : typeof code === 'string' && /^(?:[0-9A-Z]{5}|E[A-Z_]{2,30})$/.test(code) ? code : null,
  };
}

async function boundedObservation<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 5000): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('Invalid diagnostic operation bound');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error('Fixture diagnostic operation deadline exceeded'), { code: 'ETIMEDOUT' });
      controller.abort(error); reject(error);
    }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), deadline]); }
  finally { clearTimeout(timer); }
}

/** Observe and stop instrumentation before owned cleanup. Never serialize the private exception. */
export async function failFixtureAcquisition(error: unknown, phase: AcquisitionPhase, resources: readonly FixtureResource[], cleanup: () => Promise<unknown>): Promise<never> {
  const secondary: unknown[] = [];
  const scope = observers.getStore();
  if (scope) {
    scope.observed ??= (async () => {
      const errors: unknown[] = [];
      try {
        if (resources.some(resource => !/^[a-f0-9-]{36}$/.test(resource.owner) || !/^[a-f0-9]{64}$/.test(resource.containerId))) throw new Error('Invalid diagnostic ownership reference');
        await boundedObservation(signal => scope.observer.beforeCleanup(describeFixtureFailure(error, phase), resources.map(resource => ({ ...resource })), signal), scope.observer.operationTimeoutMs);
      } catch (observationError) { errors.push(observationError); }
      try { await boundedObservation(signal => scope.observer.stop(signal), scope.observer.operationTimeoutMs); } catch (stopError) { errors.push(stopError); }
      return errors;
    })();
    const errors = await scope.observed;
    if (!scope.consumed) { scope.consumed = true; secondary.push(...errors); }
  }
  try { await cleanup(); } catch (cleanupError) { secondary.push(cleanupError); }
  if (secondary.length) throw new AggregateError([error, ...secondary], 'Fixture acquisition or diagnostic cleanup failed', { cause: error });
  throw error;
}
