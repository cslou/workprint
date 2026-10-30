import { browserOrigin } from '../origin.js';
import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';

test('isolated workspace and Library retain real admission and local native fallbacks', async ({ page }) => {
  test.setTimeout(120000);
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      const requests: string[] = [];
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (![browserOrigin, origin].includes(url.origin)) throw new Error('Unauthorized shell egress');
        if (url.origin === origin) requests.push(`${route.request().method()} ${url.pathname}`);
        await route.continue();
      });
      await page.goto('/shell.html');
      await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
      const workspaceResponse = page.waitForResponse((response) => response.url() === `${origin}/v1/conversations/read-only-conversation/workspace`);
      await page.evaluate((value) => (window as unknown as { shellTest: { configure(value: unknown): void } }).shellTest.configure(value), { apiOrigin: origin, token: accessTokens[0], session: { accountId: 'admission-account-a', name: 'Creator A' }, conversationId: 'read-only-conversation' });
      expect((await workspaceResponse).status()).toBe(501);
      await expect(page.getByRole('tabpanel')).toHaveText('Loading this video is not available yet.');
      await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
      await expect(page.getByRole('main')).not.toContainText('Conversation loading is not available yet.');
      expect(requests).toEqual(['GET /v1/conversations/read-only-conversation/workspace']);
      for (const name of ['New video', 'Recents']) {
        await page.getByRole('button', { name, exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByRole('main', { includeHidden: true })).not.toContainText('Conversation loading is not available yet.');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
      }
      expect(requests).toHaveLength(1);
      expect(await page.evaluate(() => (window as unknown as { shellTest: { tokenCalls(): number } }).shellTest.tokenCalls())).toBe(1);
      await page.getByRole('button', { name: 'Library', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toContainText('Library not available yet');
      expect(requests).toEqual(['GET /v1/conversations/read-only-conversation/workspace', 'GET /v1/library']);
      await page.keyboard.press('Escape');
      const deniedResponse = page.waitForResponse((response) => response.url() === `${origin}/v1/conversations/read-only-conversation/workspace`);
      await page.evaluate(() => (window as unknown as { shellTest: { configure(value: unknown): void } }).shellTest.configure({ token: null, session: { accountId: 'admission-no-token', name: 'Creator B' }, conversationId: 'read-only-conversation' }));
      expect((await deniedResponse).status()).toBe(401);
      await expect(page.getByRole('tabpanel')).toHaveText('Sign-in required to load this video.');
      expect(requests).toEqual(['GET /v1/conversations/read-only-conversation/workspace', 'GET /v1/library', 'GET /v1/conversations/read-only-conversation/workspace']);
      for (const token of accessTokens) expect((await page.content()).includes(token)).toBe(false);
    }, { browserOrigin });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
});
