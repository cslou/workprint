import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { defineConfig } from 'vite';

const web = fileURLToPath(new URL('./', import.meta.url));
const design = resolve(fileURLToPath(new URL('../../docs/design/', import.meta.url)));
// Dedicated test composition. Production Vite never loads this plugin or test root.
export default defineConfig({
  root: resolve(web, 'test'),
  envDir: false,
  server: { host: '127.0.0.1', port: 4179, strictPort: true, fs: { strict: true, allow: [web, fileURLToPath(new URL('../../node_modules/', import.meta.url))] } },
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
