import { createBackend } from './backend.js';

// The ordinary application deliberately supplies no unqualified model/provider.
export const mastra = await createBackend(process.env);
