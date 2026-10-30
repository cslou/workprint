import type { Page, Locator } from '@playwright/test';
import { expect } from './material-network.js';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type * as Auth from '../../apps/api/test/isolated-auth.js';
import type * as Processes from '../../apps/api/test/process.js';
import type * as AccountFixture from '../../apps/api/test/account-browser-fixture.js';

export async function privateNavigate(page: Page, url: string) {
  try {
    await page.goto(url);
    await page.waitForFunction(() => location.pathname === '/auth/callback' && !location.search && !location.hash, null, { timeout: 10000 });
  } catch {
    // A failed navigation must not leave a raw reset URL in Playwright error context.
    await page.goto('about:blank');
    throw new Error('Private recovery navigation did not complete');
  }
}

export async function privateFill(field: Locator, value: string) {
  try { await field.fill(value); } catch { throw new Error('Private account field could not be filled'); }
}
export const origin = 'http://127.0.0.1:4180';
export async function fixture(page: Page, backend = false, options: Parameters<typeof Auth.isolatedAuth>[0] = {}, mode: 'development' | 'built' = 'development') {
  const authModule = await import(pathToFileURL(resolve('apps/api/.test-build/test/isolated-auth.js')).href) as typeof Auth;
  const processes = await import(pathToFileURL(resolve('apps/api/.test-build/test/process.js')).href) as typeof Processes;
  const application = backend ? await (await import(pathToFileURL(resolve('apps/api/.test-build/test/account-browser-fixture.js')).href) as typeof AccountFixture).accountBrowserFixture(options) : undefined;
  const auth = application?.auth ?? await authModule.isolatedAuth(options);
  let frontend: Awaited<ReturnType<typeof processes.start>> | undefined;
  let buildDirectory: string | undefined;
  try {
    const logs = await mkdtemp(join(tmpdir(), 'workprint-account-browser-'));
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, WORKPRINT_PUBLIC_SUPABASE_URL: auth.url, WORKPRINT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: auth.anonKey, ...(application ? { WORKPRINT_PUBLIC_API_ORIGIN: application.apiOrigin } : {}) };
    if (mode === 'built') {
      // Public build values are confined to this private temporary app, never attached as evidence.
      buildDirectory = join(logs, 'private-frontend');
      await processes.command('pnpm', ['--filter', '@workprint/web', 'exec', 'vite', 'build', '--config', 'vite.config.ts', '--outDir', buildDirectory], { cwd: process.cwd(), env, log: join(logs, 'frontend-build.log') });
    }
    frontend = await processes.start('pnpm', ['--filter', '@workprint/web', 'exec', 'vite', ...(mode === 'built' ? ['preview', '--outDir', buildDirectory!] : []), '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', '4180', '--strictPort'], {
      cwd: process.cwd(), env, log: join(logs, 'frontend.log'),
    });
    await frontend.response(origin);
    return { auth, application, close: async () => { try { await page.context().close(); await frontend?.stop(); if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true }); } finally { await (application?.close() ?? auth.close()); } } };
  } catch (error) { try { await frontend?.stop(); if (buildDirectory) await rm(buildDirectory, { recursive: true, force: true }); } finally { await (application?.close() ?? auth.close()); } throw error; }
}
export async function account(page: Page, name = 'Account') {
  if (page.viewportSize()!.width <= 820) await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}
export async function signIn(page: Page, email: string, password: string) {
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await privateFill(page.getByLabel('Email', { exact: true }), email);
  await privateFill(page.getByLabel('Password', { exact: true }), password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

