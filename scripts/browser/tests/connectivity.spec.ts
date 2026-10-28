import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { globSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import type * as Processes from '../../../apps/api/test/process.js';

async function configure(page: Page, input: { apiOrigin?: string; token: string | null; accountId: string; conversationId?: string; timeoutMs?: number }) {
  await page.waitForFunction(() => typeof (window as unknown as { libraryTest?: { configure?: unknown } }).libraryTest?.configure === 'function');
  await page.evaluate((value) => (window as unknown as { libraryTest: { configure(input: unknown): void } }).libraryTest.configure(value), input);
}

for (const mode of ['development', 'built'] as const) test(`${mode} Library consumer qualifies real admission, CORS denial and secret isolation`, async ({ page }, info) => {
  test.setTimeout(120000);
  const fixture = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const processes = await import(pathToFileURL(resolve('apps/api/.test-build/test/process.js')).href) as typeof Processes;
  const cleanup: (() => void | Promise<void>)[] = [];
  const frontend = mode === 'built' ? 'http://127.0.0.1:4180' : 'http://127.0.0.1:4179';
  try {
    await fixture.verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens, logs }) => {
      let webOutput: string | undefined;
      if (mode === 'built') {
        webOutput = join(logs, 'browser-dist');
        const env = { PATH: process.env.PATH, HOME: process.env.HOME, WORKPRINT_PUBLIC_API_ORIGIN: origin };
        await processes.command('pnpm', ['--filter', '@workprint/web', 'exec', 'vite', 'build', '--config', 'vite.test.config.ts', '--outDir', webOutput], { cwd: process.cwd(), env, log: join(logs, 'browser-build.log') });
        const preview = await processes.start('pnpm', ['--filter', '@workprint/web', 'exec', 'vite', 'preview', '--config', 'vite.test.config.ts', '--outDir', webOutput, '--host', '127.0.0.1', '--port', '4180', '--strictPort'], { cwd: process.cwd(), env, log: join(logs, 'browser-preview.log') });
        cleanup.push(preview.stop);
        await preview.response(`${frontend}/library.html`);
      }
      const preflight = (path: string, requestOrigin = frontend, method = 'GET', headers = 'authorization') => fetch(`${origin}${path}`, { method: 'OPTIONS', headers: { Origin: requestOrigin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': headers } });
      const accepted = await preflight('/v1/library');
      expect(accepted.status).toBe(204);
      expect(accepted.headers.get('access-control-allow-origin')).toBe(frontend);
      expect(accepted.headers.get('access-control-allow-methods')).toBe('GET,POST,PATCH');
      expect(accepted.headers.get('access-control-allow-headers')).toBe('Authorization,Content-Type');
      expect(accepted.headers.get('access-control-allow-credentials')).toBeNull();
      for (const response of await Promise.all([preflight('/api/agents'), preflight('/v1/library/', frontend), preflight('/v1/library', 'https://unapproved.invalid'), preflight('/v1/library', frontend, 'DELETE'), preflight('/v1/library', frontend, 'GET', 'x-owner-id')])) {
        expect(response.status).toBe(404);
        expect(response.headers.get('access-control-allow-origin')).toBeNull();
        await response.body?.cancel();
      }
      const blocked: string[] = [];
      const consoleText: string[] = [];
      page.on('console', (message) => consoleText.push(message.text()));
      await page.route('**/*', async (route) => {
        const target = new URL(route.request().url());
        if (![frontend, origin].includes(target.origin)) { blocked.push(target.origin); await route.abort('blockedbyclient'); }
        else await route.continue();
      });
      await page.goto(`${frontend}/library.html`);
      expect(await page.evaluate(async () => { try { await fetch('https://example.invalid/egress-control'); return true; } catch { return false; } })).toBe(false);
      expect(blocked).toEqual(['https://example.invalid']);
      const requests: string[] = [];
      const statuses: number[] = [];
      page.on('request', (request) => { if (new URL(request.url()).origin === origin) requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
      page.on('response', (response) => { if (new URL(response.url()).origin === origin) statuses.push(response.status()); });
      const identities = [[accessTokens[0]!, 'Library not available yet'], [accessTokens[1]!, 'Library not available yet'], [null, 'Sign-in required'], ['malformed', 'Sign-in required']] as const;
      for (const [index, [token, title]] of identities.entries()) {
        await configure(page, { ...(mode === 'built' ? {} : { apiOrigin: origin }), token, accountId: `synthetic-scope-${index}` });
        await expect.poll(() => statuses.length).toBe(index + 1);
        await expect(page.getByRole('status')).toContainText(title);
      }
      expect(requests).toEqual(Array(4).fill('GET /v1/library'));
      expect(statuses).toEqual([501, 501, 401, 401]);
      for (const token of accessTokens) {
        expect((await page.content()).includes(token)).toBe(false);
        expect(consoleText.some((line) => line.includes(token))).toBe(false);
        for (const pattern of ['apps/web/dist/**/*', ...(webOutput ? [`${webOutput}/**/*`] : []), `${logs}/*.log`]) {
          for (const path of globSync(pattern)) if ((await stat(path)).isFile()) expect((await readFile(path)).includes(Buffer.from(token)), 'Token escaped into an artifact/log').toBe(false);
        }
      }
      expect(blocked).toEqual(['https://example.invalid']);
      await page.screenshot({ path: info.outputPath(`${mode}-library-unauthenticated.png`), fullPage: true });
      await info.attach('request-methods-paths', { body: JSON.stringify({ requests, statuses }), contentType: 'application/json' });
    }, { browserOrigin: frontend });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
});

for (const change of ['account', 'conversation'] as const) test(`Library ${change} invalidation, unmount and timeout never replay mutations`, async ({ page }) => {
  await page.goto('/library.html');
  let release: (() => void) | undefined;
  let completed = false;
  let requests = 0;
  await page.route('**/v1/library', async (route) => {
    expect(route.request().method()).toBe('GET');
    const index = ++requests;
    if (index === 1) await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ status: index === 1 ? 401 : 501, contentType: 'application/json', body: JSON.stringify({ error: { code: index === 1 ? 'unauthenticated' : 'not_implemented', message: 'Synthetic controlled response' } }) });
    if (index === 1) completed = true;
  });
  await configure(page, { apiOrigin: 'http://127.0.0.1:4179', token: null, accountId: 'account-a', conversationId: 'conversation-a', timeoutMs: 1000 });
  await expect.poll(() => requests).toBe(1);
  await configure(page, { token: null, accountId: change === 'account' ? 'account-b' : 'account-a', conversationId: change === 'conversation' ? 'conversation-b' : 'conversation-a' });
  await expect(page.getByRole('status')).toContainText('Library not available yet');
  release?.();
  await expect.poll(() => completed).toBe(true);
  await expect(page.getByRole('status')).not.toContainText('Sign-in required');
  await page.evaluate(() => (window as unknown as { libraryTest: { unmount(): void } }).libraryTest.unmount());
  await configure(page, { apiOrigin: 'http://127.0.0.1:4179', token: null, accountId: 'account-b', timeoutMs: 1000 });
  await expect(page.getByRole('status')).toContainText('Library not available yet');
  expect(requests).toBe(3);
  await page.unroute('**/v1/library');
  let settle: (() => void) | undefined;
  await page.route('**/v1/library', async (route) => {
    expect(route.request().method()).toBe('GET');
    await new Promise<void>((resolve) => { settle = resolve; });
    await route.abort();
  });
  await configure(page, { apiOrigin: 'http://127.0.0.1:4179', token: null, accountId: 'account-b', timeoutMs: 100 });
  await expect.poll(() => typeof settle).toBe('function');
  await expect(page.getByRole('status')).toContainText('Library could not be loaded');
  settle?.();
});
