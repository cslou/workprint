import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test as observedTest, expect } from './material-network.js';
import { startReadBackend } from './qualified-saved-backend.js';
import type { BuiltAdmissionTarget } from '../../apps/api/test/auth-built-fixture.js';
import type { preparePagedSavedWork as PreparePagedSavedWork, PagedSavedWork } from '../../apps/api/test/paged-saved-work.js';

type OwnedBackend = { target: BuiltAdmissionTarget; saved: PagedSavedWork };
async function startOwnedBackend() {
  const { preparePagedSavedWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/paged-saved-work.js')).href) as { preparePagedSavedWork: typeof PreparePagedSavedWork };
  return startReadBackend(preparePagedSavedWork);
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
