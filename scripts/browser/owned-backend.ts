import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test as observedTest, expect } from './material-network.js';
import { browserOrigin } from './origin.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission, BuiltAdmissionTarget } from '../../apps/api/test/auth-built-fixture.js';
import type { preparePagedSavedWork as PreparePagedSavedWork, PagedSavedWork } from '../../apps/api/test/paged-saved-work.js';

type OwnedBackend = { target: BuiltAdmissionTarget; saved: PagedSavedWork };
async function startOwnedBackend() {
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const { preparePagedSavedWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/paged-saved-work.js')).href) as { preparePagedSavedWork: typeof PreparePagedSavedWork };
  const cleanup: (() => void | Promise<void>)[] = [];
  let release!: () => void; let ready!: (value: OwnedBackend) => void; let reject!: (error: unknown) => void; let saved: PagedSavedWork;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const available = new Promise<OwnedBackend>((resolve, fail) => { ready = resolve; reject = fail; });
  const backend = verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async target => { ready({ target, saved }); await gate; }, { browserOrigin, prepareSavedWork: async setup => { saved = await preparePagedSavedWork(setup); } });
  void backend.catch(reject);
  const close = async () => { release(); try { await backend; } finally { for (const fn of cleanup.reverse()) await fn(); } };
  try { return { data: await available, close }; } catch (error) { await close(); throw error; }
}
/** Share lifetime mechanics, not cross-file identities or qualification state. */
export const test = observedTest.extend<{ ownedSavedWork: OwnedBackend }, { ownedBackendFor: (file: string) => Promise<OwnedBackend> }>({
  ownedBackendFor: [async ({ browser }, use) => {
    if (!browser.isConnected()) throw new Error('Owned-read browser is not connected');
    let active: Awaited<ReturnType<typeof startOwnedBackend>> | undefined; let currentFile: string | undefined;
    try {
      await use(async file => {
        if (currentFile !== file) { await active?.close(); active = undefined; currentFile = file; active = await startOwnedBackend(); }
        if (!active) throw new Error('Owned backend unavailable');
        return active.data;
      });
    } finally { await active?.close(); }
  }, { scope: 'worker', timeout: 120000 }],
  ownedSavedWork: [async ({ ownedBackendFor }, use, info) => { await use(await ownedBackendFor(info.file)); }, { timeout: 120000 }],
});
export { expect };
