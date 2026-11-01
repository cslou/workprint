const phases = ['s3.create-bucket', 's3.configure-cors', 's3.readiness-write', 's3.readiness-delete', 'saved-backend.admission', 'saved-backend.prepare', 'media.storage', 'media.sandbox', 'media.synthetic', 'media.poster'] as const;
export type FixturePhase = typeof phases[number];
export type FixtureDiagnostic = (message: string) => void;

/** Fixed metadata only: never serialize exceptions, work results, arguments or private configuration. */
export async function observeFixturePhase<T>(phase: FixturePhase, work: () => Promise<T>, diagnostic?: FixtureDiagnostic): Promise<T> {
  if (!(phases as readonly string[]).includes(phase)) throw new TypeError('Unsupported fixture phase');
  const started = performance.now();
  const emit = (status: 'start' | 'complete' | 'failed', failure?: 'aborted' | 'timeout' | 'error') => diagnostic?.(JSON.stringify({ phase, status, elapsedMs: Math.max(0, Math.round(performance.now() - started)), ...(failure ? { failure } : {}) }));
  emit('start');
  let result: T;
  try { result = await work(); }
  catch (error) {
    const failure = error instanceof Error && error.name === 'AbortError' ? 'aborted' : error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'error';
    try { emit('failed', failure); }
    catch (diagnosticError) { throw new AggregateError([error, diagnosticError], 'Fixture work and diagnostics failed', { cause: diagnosticError }); }
    throw error;
  }
  emit('complete'); return result;
}

/** Correlate existing admission artifacts without forwarding arbitrary Auth diagnostics or local paths. */
export function reportFixtureEvidence(message: string, diagnostic?: FixtureDiagnostic): void {
  const artifact = /^Evidence: .*\/(workprint-foundation-[A-Za-z0-9]{6})$/.exec(message)?.[1];
  if (artifact) diagnostic?.(JSON.stringify({ phase: 'saved-backend.admission', status: 'evidence', artifact }));
}

export async function cleanupFixtureResources(cleanups: readonly (() => void | Promise<void>)[]): Promise<void> {
  const failures: unknown[] = [];
  for (const close of cleanups) { try { await close(); } catch (error) { failures.push(error); } }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Owned fixture cleanup failed', { cause: failures.at(-1) });
}

export async function cleanupFailedFixture(error: unknown, close: () => Promise<void>): Promise<never> {
  try { await close(); }
  catch (cleanupError) { if (cleanupError !== error) throw new AggregateError([error, cleanupError], 'Fixture acquisition and cleanup failed', { cause: cleanupError }); }
  throw error;
}
