import { browserTestSettings } from '../origin.js';
import { expect, test } from '../material-network.js';
import { createHash } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as Processes from '../../../apps/api/test/process.js';
import type * as Environment from '../../../apps/api/test/environment.js';
import { parsePublicApiOrigin } from '../../../apps/web/src/api/public-config.js';

test('browser ports and public API configuration are explicit and reject malformed settings', () => {
  expect(browserTestSettings({})).toEqual({ browserPort: 4179, browserOrigin: 'http://127.0.0.1:4179', previewPort: 4180, previewOrigin: 'http://127.0.0.1:4180' });
  expect(browserTestSettings({ WORKPRINT_BROWSER_PORT: '4279', WORKPRINT_PREVIEW_PORT: '4280' })).toEqual({ browserPort: 4279, browserOrigin: 'http://127.0.0.1:4279', previewPort: 4280, previewOrigin: 'http://127.0.0.1:4280' });
  const canonicalHttpOrigin = new URL('http://127.0.0.1:80').origin;
  expect(canonicalHttpOrigin).toBe('http://127.0.0.1');
  expect(browserTestSettings({ WORKPRINT_BROWSER_PORT: '80', WORKPRINT_PREVIEW_PORT: '80' })).toEqual({ browserPort: 80, browserOrigin: canonicalHttpOrigin, previewPort: 80, previewOrigin: canonicalHttpOrigin });
  for (const setting of ['WORKPRINT_BROWSER_PORT', 'WORKPRINT_PREVIEW_PORT']) {
    for (const value of ['', '0', '-1', '65536', '1.5', ' 4279', '4279/path', 'secret']) {
      expect(() => browserTestSettings({ [setting]: value })).toThrow(`Invalid ${setting}: expected a TCP port`);
    }
  }
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
  const inputsFile = join(fixture.logs, 'build-inputs.json');
  // Recording only: use the default production config without changing resolution or output.
  await processes.command(process.execPath, ['--input-type=module', '-e', `
    import { build } from 'vite';
    import { writeFileSync } from 'node:fs';
    import { resolve } from 'node:path';
    let inlineLimit = null, root;
    await build({ build: ${JSON.stringify({ outDir: output, sourcemap: true })}, plugins: [{
      name: 'record-production-inputs',
      configResolved(config) { root = config.root; if (typeof config.build.assetsInlineLimit === 'number') inlineLimit = config.build.assetsInlineLimit; },
      generateBundle(_options, bundle) {
        const inputs = new Set(this.getModuleIds());
        for (const asset of Object.values(bundle)) if (asset.type === 'asset') {
          for (const source of asset.originalFileNames) inputs.add(resolve(root, source));
        }
        writeFileSync(${JSON.stringify(inputsFile)}, JSON.stringify({ inputs: [...inputs], inlineLimit }));
      }
    }] });
  `], { cwd: web, env, log: join(fixture.logs, 'web-build.log') });
  const testRoot = await realpath(join(web, 'test'));
  const serverHelpers = await Promise.all(['native-conversations.ts', 'built-server.ts', 'server-entry.test.ts', 'auth-built-fixture.ts', 'auth-server.ts', 'request-intake.test.ts', 'isolated-auth.ts', 'auth-fixture-resources.ts', 'auth-mail.ts', 'isolated-auth.security.test.ts', 'account-browser-fixture.ts'].map(file => realpath(resolve('apps/api/test', file))));
  const graph = JSON.parse(await readFile(inputsFile, 'utf8')) as { inputs: string[]; inlineLimit: number | null };
  expect(graph.inputs.length).toBeGreaterThan(0);
  for (const input of new Set(graph.inputs)) {
    if (input.includes('\0') || !isAbsolute(input)) continue;
    const path = await realpath(input.split('?')[0]!);
    expect.soft(path === testRoot || path.startsWith(testRoot + sep) || serverHelpers.includes(path), `Test build input: ${path}`).toBe(false);
  }
  const entries = await readdir(testRoot, { recursive: true, withFileTypes: true });
  const files = entries.filter(entry => entry.isFile()).map(entry => relative(testRoot, join(entry.parentPath, entry.name)));
  const artifacts = (await readdir(output, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name));
  const emitted = await Promise.all(artifacts.map(async file => ({ file, bytes: await readFile(file) })));
  const bytes = emitted.map(asset => asset.bytes);
  const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  const hashes = new Set(bytes.map(digest));
  const textAssets = emitted.filter(asset => /\.(html|js|css|map|json|svg|txt)$/.test(asset.file));
  const sources = [...files.map(file => ({ file, path: join(testRoot, file) })), ...serverHelpers.map(path => ({ file: path.split('/').at(-1)!, path }))];
  for (const { file, path } of sources) {
    const source = await readFile(path);
    expect.soft(hashes.has(digest(source)), `Test file SHA256 emitted: ${file}`).toBe(false);
    expect.soft(bytes.some(asset => asset.includes(source)), `Raw test bytes bundled: ${file}`).toBe(false);
    // A base64 payload also detects data URLs of any MIME type, including forced ?inline assets.
    // Scan one fixture at a time at every size; shorter artifacts cannot contain its encoded bytes.
    const forms = [{ encoding: 'base64/data URL', value: source.toString('base64') }];
    if (/\.(html|tsx?|js|css|json|svg|txt|md)$/.test(file)) forms.push(
      { encoding: 'URI data URL', value: encodeURIComponent(source.toString('utf8')) },
      { encoding: 'JSON string', value: JSON.stringify(source.toString('utf8')).slice(1, -1) },
    );
    for (const form of forms) {
      const encoded = Buffer.from(form.value);
      expect.soft(textAssets.some(asset => asset.bytes.length >= encoded.length && asset.bytes.includes(encoded)), `Inlined test fixture (${form.encoding}): ${file}`).toBe(false);
    }
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
      for (const path of serverHelpers.flatMap(helper => [`/apps/api/test/${helper.split('/').at(-1)!}`, `/@fs/${helper}`])) {
        const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(3000) });
        const body = await response.text();
        exposure.push({ mode, path, status: response.status, disposition: 'Native fixture helper denied or ordinary application fallback' });
        expect(response.status === 403 || response.status === 404 || (response.status === 200 && body === html), path).toBe(true);
        expect(body).not.toMatch(/createNativeConversation|buildServerComposition|startAuthServer|Synthetic startup recovery failure/);
      }
      for (const suffix of ['', '?context=viewer&reference=proposal&fixture=1&__qualification=1']) {
        await page.goto(origin + suffix);
        await expect(page.getByRole('button', { name: 'New video', exact: true })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Script', exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tabpanel')).toHaveText('Your script will appear here once you describe your video.');
        expect(await page.evaluate(() => Object.keys(window).filter(key => /Test$/.test(key)))).toEqual([]);
        await page.getByRole('button', { name: 'Account', exact: true }).press('Enter');
        await expect(page.getByRole('dialog')).toContainText('Sign-in is not configured for this build.');
        await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
        await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
        await page.keyboard.press('Escape');
      }
    } finally { try { await page.goto('about:blank'); } finally { await server.stop(); } }
  }
  expect(exposure.some(row => row.mode === 'dev' && row.path === '/test/shell.html' && row.status === 200)).toBe(true);
  await fixture.noNetwork();
  await info.attach('dev-versus-production-exposure', { body: JSON.stringify({ logs: fixture.logs, exposure }), contentType: 'application/json' });
});
