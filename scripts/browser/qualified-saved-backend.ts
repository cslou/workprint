import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserOrigin } from './origin.js';
import { cleanupFailedFixture, observeFixturePhase, reportFixtureEvidence, type FixtureDiagnostic } from '../../apps/api/test/fixture-observation.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission, BuiltAdmissionTarget, SavedWorkSetup } from '../../apps/api/test/auth-built-fixture.js';

/** Share qualification/lifetime mechanics only. Each caller owns its own identities/data. */
export async function startReadBackend<T>(prepare: (setup: SavedWorkSetup) => Promise<T>, verifySavedEffects?: (servingUrl: string) => Promise<void>, options: Pick<NonNullable<Parameters<typeof VerifyBuiltAdmission>[2]>, 'media' | 'storage'> & { diagnostic?: FixtureDiagnostic } = {}) {
  const { diagnostic, ...backendOptions } = options;
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  let release!: () => void, ready!: (value: { target: BuiltAdmissionTarget; saved: T }) => void, reject!: (error: unknown) => void, saved: T;
  const gate = new Promise<void>(done => { release = done; });
  const available = new Promise<{ target: BuiltAdmissionTarget; saved: T }>((done, fail) => { ready = done; reject = fail; });
  const backend = observeFixturePhase('saved-backend.admission', () => verifyBuiltAdmission({ diagnostic(message) { reportFixtureEvidence(message, diagnostic); }, after(fn) { cleanup.push(fn); } }, async target => { ready({ target, saved }); await gate; }, { ...backendOptions, browserOrigin, prepareSavedWork: async setup => { saved = await observeFixturePhase('saved-backend.prepare', () => prepare(setup), diagnostic); }, ...(verifySavedEffects ? { verifySavedEffects } : {}) }), diagnostic);
  void backend.catch(reject);
  const close = async () => { release(); try { await backend; } finally { for (const fn of cleanup.reverse()) await fn(); } };
  try { return { data: await available, close }; } catch (error) { return cleanupFailedFixture(error, close); }
}
