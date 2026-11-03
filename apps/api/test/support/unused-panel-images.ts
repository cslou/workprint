import type { AssistantPanelImages } from '../../src/application/index.js';

/** Panel image saves for a tool test that never makes a panel: any call says it is unavailable. */
export const unusedPanelImages: AssistantPanelImages = { hasRoom: async () => ({ kind: 'unavailable' }), save: async () => ({ kind: 'unavailable' }) };
