import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { parsePublicApiOrigin } from './src/api/public-config.js';

const publicConfig = parsePublicApiOrigin(process.env.WORKPRINT_PUBLIC_API_ORIGIN);
if (publicConfig.kind === 'invalid') throw new Error('Invalid public API origin');

export default defineConfig({
  envDir: false,
  envPrefix: [],
  define: { __WORKPRINT_PUBLIC_API_ORIGIN__: JSON.stringify(publicConfig.kind === 'configured' ? publicConfig.apiOrigin : null) },
  server: {
    fs: {
      strict: true,
      // Do not expose the workspace root (private research, outputs or credentials).
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../../packages/api-client/dist/', import.meta.url)),
        fileURLToPath(new URL('../../packages/contracts/dist/', import.meta.url)),
        realpathSync(fileURLToPath(new URL('../../node_modules/', import.meta.url))),
      ],
    },
  },
});
