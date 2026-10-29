import { expect, test } from '../material-network.js';
import { globSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as Processes from '../../../apps/api/test/process.js';
import type * as Environment from '../../../apps/api/test/environment.js';
import { parsePublicApiOrigin } from '../../../apps/web/src/api/public-config.js';

test('public API configuration is explicit, origin-only and never reflects invalid secrets', () => {
  for (const value of [undefined, null, '']) expect(parsePublicApiOrigin(value)).toEqual({ kind: 'missing' });
  for (const value of ['https://api.example.invalid', 'http://127.0.0.1:4111', 'http://localhost:4111', 'http://[::1]:4111']) expect(parsePublicApiOrigin(value)).toEqual({ kind: 'configured', apiOrigin: value });
  for (const value of ['http://remote.invalid', '/v1', 'https://user:secret@example.invalid', 'https://example.invalid/path', 'https://example.invalid/?secret=value', 'https://example.invalid/#token', ' https://example.invalid', 42, {}]) expect(parsePublicApiOrigin(value)).toEqual({ kind: 'invalid' });
});

test('default dev and production build expose no interchangeable test compositions', async ({ page }, info) => {
  test.setTimeout(120000);
  const processes = await import(pathToFileURL(resolve('apps/api/.test-build/test/process.js')).href) as typeof Processes;
  const { environment } = await import(pathToFileURL(resolve('apps/api/.test-build/test/environment.js')).href) as typeof Environment;
  const fixture = await environment();
  const web = resolve('apps/web');
  const output = join(fixture.logs, 'browser-dist');
  const env = { ...fixture.env, WORKPRINT_AUTH_PROBE: '1', WORKPRINT_QUALIFICATION: '1' };
  await processes.command('pnpm', ['--filter', '@workprint/web', 'exec', 'vite', 'build', '--sourcemap', '--outDir', output], { cwd: process.cwd(), env, log: join(fixture.logs, 'web-build.log') });
  const entries = await readdir(join(web, 'test'), { recursive: true, withFileTypes: true });
  const files = entries.filter(entry => entry.isFile()).map(entry => relative(join(web, 'test'), join(entry.parentPath, entry.name)));
  const artifacts = globSync(`${output}/**/*`);
  const bytes = await Promise.all(artifacts.filter(file => /\.(html|js|css|map)$/.test(file)).map(file => readFile(file)));
  const maps = artifacts.filter(file => file.endsWith('.js.map'));
  expect(maps.length).toBeGreaterThan(0);
  for (const file of maps) {
    const map = JSON.parse(await readFile(file, 'utf8')) as { sources: string[] };
    expect(map.sources.length).toBeGreaterThan(0);
    for (const source of map.sources) expect(resolve(dirname(file), source).startsWith(join(web, 'test') + sep), `Test module entered build graph: ${source}`).toBe(false);
  }
  for (const file of files) {
    const source = await readFile(join(web, 'test', file));
    expect(bytes.some(asset => asset.includes(source)), `Test file bundled: ${file}`).toBe(false);
    expect(artifacts.some(asset => asset.endsWith(`/test/${file}`)), `Test artifact emitted: ${file}`).toBe(false);
  }
  for (const privateFile of [process.env.WORKPRINT_AUTH_FIXTURE, process.env.WORKPRINT_AUTH_SIGNING_FIXTURE]) {
    expect(privateFile, 'Required private fixture is available for exclusion verification').toBeTruthy();
    const secret = await readFile(privateFile!);
    expect(bytes.some(asset => asset.includes(secret)), 'Private fixture entered production output').toBe(false);
  }
  const exposure: { mode: string; path: string; status: number; disposition: string }[] = [];
  for (const mode of ['dev', 'built'] as const) {
    const port = await processes.unusedPort();
    const origin = `http://127.0.0.1:${port}`;
    // Load the default config, isolating only Vite's optimizer cache from the concurrent test server.
    const server = mode === 'dev'
      ? await processes.start(process.execPath, ['--input-type=module', '-e', `import { createServer } from 'vite'; const server = await createServer(${JSON.stringify({ cacheDir: join(fixture.logs, 'vite-cache'), server: { host: '127.0.0.1', port, strictPort: true } })}); await server.listen();`], { cwd: web, env, log: join(fixture.logs, 'dev.log') })
      : await processes.start('pnpm', ['--filter', '@workprint/web', 'exec', 'vite', 'preview', '--outDir', output, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: process.cwd(), env: { ...env, NODE_ENV: 'production' }, log: join(fixture.logs, 'built.log') });
    try {
      const html = await (await server.response(origin)).text();
      for (const path of files.flatMap(file => [`/test/${file}`, `/${file}`])) {
        const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(3000) });
        const body = Buffer.from(await response.arrayBuffer());
        exposure.push({ mode, path, status: response.status, disposition: response.status === 404 ? 'Not found' : body.toString() === html ? 'Ordinary application fallback' : 'Development-only source/test exposure; absent from production output' });
        if (mode === 'built') {
          expect(response.status === 404 || (response.status === 200 && body.toString() === html), path).toBe(true);
        } else if (path.startsWith('/test/') && (path.endsWith('.html') || path.startsWith('/test/fixtures/'))) {
          expect(response.status, `Default dev serves ${path}`).toBe(200);
        }
      }
      for (const suffix of ['', '?context=viewer&reference=proposal&fixture=1&__qualification=1']) {
        await page.goto(origin + suffix);
        await expect(page.getByRole('button', { name: 'New video', exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Script', exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tabpanel')).toHaveText('Your script will appear here once you describe your video.');
        expect(await page.evaluate(() => Object.keys(window).filter(key => /Test$/.test(key)))).toEqual([]);
        await page.getByRole('button', { name: 'Account', exact: true }).press('Enter');
        await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
        await expect(page.getByRole('dialog')).toContainText('Sign-in is not available yet.');
        await page.keyboard.press('Escape');
      }
    } finally { try { await page.goto('about:blank'); } finally { await server.stop(); } }
  }
  expect(exposure.some(row => row.mode === 'dev' && row.path === '/test/shell.html' && row.status === 200)).toBe(true);
  await fixture.noNetwork();
  await info.attach('dev-versus-production-exposure', { body: JSON.stringify({ logs: fixture.logs, exposure }), contentType: 'application/json' });
});
