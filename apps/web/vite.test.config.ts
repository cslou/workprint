import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { defineConfig } from 'vite';
import { parsePublicApiOrigin } from './src/api/public-config.js';

const web = fileURLToPath(new URL('./', import.meta.url));
const design = resolve(fileURLToPath(new URL('../../docs/design/', import.meta.url)));
const publicConfig = parsePublicApiOrigin(process.env.WORKPRINT_PUBLIC_API_ORIGIN);
if (publicConfig.kind === 'invalid') throw new Error('Invalid public API origin');
// Dedicated test composition. Production Vite never loads this plugin or test root.
export default defineConfig({
  root: resolve(web, 'test'),
  envDir: false,
  envPrefix: [],
  define: { __WORKPRINT_PUBLIC_API_ORIGIN__: JSON.stringify(publicConfig.kind === 'configured' ? publicConfig.apiOrigin : null) },
  // Eagerly prepare both fixture entrypoints; late dependency discovery reloads
  // would otherwise replace an in-flight scoped consumer during verification.
  optimizeDeps: { force: true, noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-aria-components', '@workprint/api-client', '@workprint/contracts'] },
  build: { rollupOptions: { input: fileURLToPath(new URL('./test/library.html', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 4179, strictPort: true, fs: { strict: true, allow: [web, fileURLToPath(new URL('../../packages/api-client/dist/', import.meta.url)), fileURLToPath(new URL('../../packages/contracts/dist/', import.meta.url)), fileURLToPath(new URL('../../node_modules/', import.meta.url))] } },
  plugins: [{ name: 'tracked-design-references', configureServer(server) {
    server.middlewares.use('/references', async (req, res, next) => {
      try {
        const path = await realpath(resolve(design, `.${decodeURIComponent((req.url ?? '').split('?')[0] ?? '')}`));
        const type = new Map([['.html', 'text/html'], ['.css', 'text/css'], ['.svg', 'image/svg+xml']]).get(extname(path));
        if (!path.startsWith(design + sep) || !type) { res.statusCode = 403; res.end(); return; }
        res.setHeader('Content-Type', type);
        res.end(await readFile(path));
      } catch (error) { next(error); }
    });
  } }],
});
