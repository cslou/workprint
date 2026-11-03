import type { AssistantSheets } from '../../src/application/index.js';

/** Sheet saves for a tool test that never saves or reads a sheet: any call says it is unavailable. */
export const unusedSheets: AssistantSheets = { save: async () => ({ kind: 'unavailable' }), useRoom: async () => ({ kind: 'unavailable' }), readView: async () => ({ kind: 'unavailable' }) };
