import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // No public environment contract exists yet; never load private dotenv files here.
  envDir: false,
  server: {
    fs: {
      strict: true,
      // Do not expose the workspace root (private research, outputs or credentials).
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        realpathSync(fileURLToPath(new URL('../../node_modules/', import.meta.url))),
      ],
    },
  },
});
