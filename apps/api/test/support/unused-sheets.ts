import type { AssistantSheets } from '../../src/application/index.js';

/** Sheet saves for a tool test that never saves a sheet: any call says saving is unavailable. */
export const unusedSheets: AssistantSheets = { save: async () => ({ kind: 'unavailable' }), useRoom: async () => ({ kind: 'unavailable' }) };
