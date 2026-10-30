import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserOrigin } from './origin.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission, BuiltAdmissionTarget, SavedWorkSetup } from '../../apps/api/test/auth-built-fixture.js';

/** Share qualification/lifetime mechanics only. Each caller owns its own identities/data. */
export async function startReadBackend<T>(prepare: (setup: SavedWorkSetup) => Promise<T>) {
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  let release!: () => void, ready!: (value: { target: BuiltAdmissionTarget; saved: T }) => void, reject!: (error: unknown) => void, saved: T;
  const gate = new Promise<void>(done => { release = done; });
  const available = new Promise<{ target: BuiltAdmissionTarget; saved: T }>((done, fail) => { ready = done; reject = fail; });
  const backend = verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async target => { ready({ target, saved }); await gate; }, { browserOrigin, prepareSavedWork: async setup => { saved = await prepare(setup); } });
  void backend.catch(reject);
  const close = async () => { release(); try { await backend; } finally { for (const fn of cleanup.reverse()) await fn(); } };
  try { return { data: await available, close }; } catch (error) { await close(); throw error; }
}
