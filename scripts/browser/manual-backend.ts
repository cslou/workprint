import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test as observedTest, expect } from './material-network.js';
import { startReadBackend } from './qualified-saved-backend.js';
import type { BuiltAdmissionTarget } from '../../apps/api/test/auth-built-fixture.js';
import type { prepareManualVisualWork as Prepare } from '../../apps/api/test/manual-saved-work.js';

type ManualBackend = { target: BuiltAdmissionTarget; saved: Awaited<ReturnType<typeof Prepare>> };
export const test = observedTest.extend<{ manualSavedWork: ManualBackend }, { manualVisualBackend: ManualBackend }>({
  manualVisualBackend: [async ({ browser }, use) => {
    if (!browser.isConnected()) throw new Error('Manual visual browser is not connected');
    const { prepareManualVisualWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/manual-saved-work.js')).href) as { prepareManualVisualWork: typeof Prepare };
    const backend = await startReadBackend(prepareManualVisualWork);
    try { await use(backend.data); } finally { await backend.close(); }
  }, { scope: 'worker', timeout: 120000 }],
  manualSavedWork: async ({ manualVisualBackend }, use) => { await use(manualVisualBackend); },
});
export { expect };
