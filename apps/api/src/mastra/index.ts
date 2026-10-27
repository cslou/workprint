import { createBackend } from './backend.js';

// No Agent, provider, workflow, test probe or telemetry exporter is enabled.
export const mastra = await createBackend();
