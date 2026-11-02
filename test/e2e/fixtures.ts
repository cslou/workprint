import { test as base, expect, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { previewOrigin, previewPort } from './origin.js';
import type * as AppFixture from '../../apps/api/test/support/account-browser-fixture.js';
import type * as MediaWork from '../../apps/api/test/support/library-media-work.js';
import type * as Processes from '../../apps/api/test/support/process.js';
import type * as Provider from '../../apps/api/test/support/scripted-provider.js';
import type * as Chat from '../../apps/api/test/support/chat-composition.js';
import type * as MetaImages from '../../apps/api/test/support/meta-image-fake.js';
import type * as MiniMaxVideos from '../../apps/api/test/support/minimax-video-fake.js';
import type { SavedWorkSetup } from '../../apps/api/test/support/auth-built-fixture.js';

// Fixtures are compiled by `node scripts/test.mjs compile`; Playwright loads the emitted modules.
export const loadSupport = <T>(module: string) => import(pathToFileURL(resolve(`apps/api/.test-build/test/support/${module}.js`)).href) as Promise<T>;
/** The whole suite shares one backend, bounded to 15 minutes inside the 30-minute test stack lifetime. */
const suiteLifetimeMs = 900_000;
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);

export type Account = { id: string; email: string; password: string; nextPassword: string };

/**
 * One backend for the worker on the shared test stack (Postgres, Auth, object storage, media): API and the built web app.
 * Muse Spark is routed to one scripted provider, which chat journeys script per test; Meta images and MiniMax videos go
 * to loopback fakes. MiniMax serves the MiniMax-shaped test clip and is polled every 50 ms.
 */
async function startBackend() {
  const { accountBrowserFixture } = await loadSupport<typeof AppFixture>('account-browser-fixture');
  const { createLibraryMediaFixture } = await loadSupport<typeof MediaWork>('library-media-work');
  const { command, start } = await loadSupport<typeof Processes>('process');
  const { scriptedProvider } = await loadSupport<typeof Provider>('scripted-provider');
  const { chatComposition } = await loadSupport<typeof Chat>('chat-composition');
  const { metaImageFake } = await loadSupport<typeof MetaImages>('meta-image-fake');
  const { generatedClip, miniMaxVideoFake } = await loadSupport<typeof MiniMaxVideos>('minimax-video-fake');
  const cleanups: (() => unknown)[] = [];
  const close = async () => {
    const errors: unknown[] = [];
    for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch (error) { errors.push(error); } }
    if (errors.length) throw new AggregateError(errors, 'End-to-end backend cleanup failed');
  };
  try {
    const provider = await scriptedProvider(); cleanups.push(provider.close);
    const meta = await metaImageFake(); cleanups.push(meta.close);
    const minimax = await miniMaxVideoFake({ clip: await generatedClip() }); cleanups.push(minimax.close);
    const media = await createLibraryMediaFixture(); cleanups.push(media.close);
    const app = await accountBrowserFixture({ artifacts: true, storage: media.configuration, media: media.media, serverLifetimeMs: suiteLifetimeMs, composition: chatComposition(provider, {}, { url: meta.url }, {}, { url: minimax.url, timing: { pollIntervalMs: 50, pollDeadlineMs: 60_000 } }) }, previewOrigin);
    cleanups.push(app.close);
    const logs = await mkdtemp(join(tmpdir(), 'workprint-e2e-')); cleanups.push(() => rm(logs, { recursive: true, force: true }));
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, WORKPRINT_PUBLIC_SUPABASE_URL: app.auth.url, WORKPRINT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: app.auth.anonKey, WORKPRINT_PUBLIC_API_ORIGIN: app.apiOrigin };
    const dist = join(logs, 'web');
    await command('pnpm', ['--filter', '@workprint/web', 'exec', 'vite', 'build', '--outDir', dist], { cwd: process.cwd(), env, log: join(logs, 'web-build.log') });
    const web = await start('pnpm', ['--filter', '@workprint/web', 'exec', 'vite', 'preview', '--outDir', dist, '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'], { cwd: process.cwd(), env, log: join(logs, 'web.log'), lifetimeMs: suiteLifetimeMs });
    cleanups.push(web.stop);
    await web.response(previewOrigin);
    return {
      app, media, provider, meta, minimax, close,
      accounts: (count: number) => Promise.all(Array.from({ length: count }, () => app.auth.createAccount())) as Promise<Account[]>,
      setup: (accounts: readonly Account[]): SavedWorkSetup => ({ accountIds: accounts.map(account => account.id), native: app.native, servingUrl: app.servingUrl, setupUrl: app.setupUrl }),
      /** Read an owned API operation as the account, for asserting persisted state. */
      read: async <T>(account: Account, path: string) => {
        const response = await fetch(app.apiOrigin + path, { headers: { Authorization: `Bearer ${await app.accessToken(account)}` } });
        if (!response.ok) throw new Error(`API read failed (${response.status})`);
        return await response.json() as T;
      },
    };
  } catch (error) {
    try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'End-to-end backend startup and cleanup failed', { cause: cleanupError }); }
    throw error;
  }
}

export const test = base.extend<{ loopbackOnly: void }, { backend: Awaited<ReturnType<typeof startBackend>> }>({
  // Playwright requires an object pattern for fixture dependencies, even when there are none.
  // eslint-disable-next-line no-empty-pattern
  backend: [async ({}, use) => {
    const backend = await startBackend();
    try { await use(backend); } finally { await backend.close(); }
  }, { scope: 'worker', timeout: 300_000 }],
  // The product talks only to its configured local services; anything else is blocked and fails the test.
  loopbackOnly: [async ({ context }, use) => {
    const blocked: string[] = [];
    await context.route(url => !loopback.has(url.hostname), route => { blocked.push(new URL(route.request().url()).origin); return route.abort('blockedbyclient'); });
    await use();
    expect(blocked, 'Requests left the local stack').toEqual([]);
  }, { auto: true }],
});
export { expect };

/** Enter through the real sign-in page; a protected target returns there after sign-in. */
export async function signIn(page: Page, account: Account, target = '/app') {
  await page.goto(target);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(previewOrigin + target);
}

/**
 * One scripted turn in which the agent makes a video with the MiniMax fake, sent from the open video's chat box.
 * Resolves with the turn's reply once its line reads `Saved Video N · Version 1`.
 */
export async function makeVideo(page: Page, backend: { provider: { script(...steps: unknown[]): void }; minimax: { reset(): void } }, options: { showInChat?: boolean; text?: string } = {}) {
  backend.minimax.reset();
  const text = options.text ?? 'Here it is.';
  backend.provider.script({ toolCalls: [{ name: 'generate-video', args: { prompt: 'A slow push-in on a quiet gallery bench', showInChat: options.showInChat ?? true } }] }, { text: [text] });
  const box = page.getByRole('textbox', { name: 'Message' });
  // This turn's reply is the one after those already shown, never an earlier reply's line.
  const replies = page.getByRole('list', { name: 'New messages' }).getByRole('listitem', { name: 'Assistant message' });
  const reply = replies.nth(await replies.count());
  await box.fill('Make a short video of the gallery bench');
  await box.press('Enter');
  await expect(reply.getByText(/^Saved Video \d+ · Version 1$/)).toBeVisible({ timeout: 60_000 });
  await expect(reply.getByText(text, { exact: true })).toBeVisible();
  return reply;
}
