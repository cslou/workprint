import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '../material-network.js';
import { browserOrigin } from '../origin.js';
import type { OperationResponse } from '../../../packages/contracts/src/index.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import type { isolatedObjectStorage as IsolatedObjectStorage } from '../../../apps/api/test/object-storage.js';
import type { createNativeConversation as CreateNativeConversation } from '../../../apps/api/test/native-conversations.js';
import type { query as Query } from '../../../apps/api/test/postgres.js';

type Outcome<T> = { ok: true; value: T } | { ok: false; error: { code: string } };
type Harness = { uploadsTest: { configure(input: unknown): void; authorize(file: { name: string; type: string; bytes: number[] }): Promise<Outcome<OperationResponse<'requestUpload'>>>; transfer(): Promise<Outcome<{ acknowledged: true }>>; confirmPrepared(): Promise<Outcome<OperationResponse<'confirmUpload'>>> } };
test.use({ trace: 'off', video: 'off' });

test('real browser sends private bytes without API credentials and cannot publish without a verifier', async ({ page, context, materialNetwork }) => {
  test.setTimeout(180000);
  const { isolatedObjectStorage } = await import(pathToFileURL(resolve('apps/api/.test-build/test/object-storage.js')).href) as { isolatedObjectStorage: typeof IsolatedObjectStorage };
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const { createNativeConversation } = await import(pathToFileURL(resolve('apps/api/.test-build/test/native-conversations.js')).href) as { createNativeConversation: typeof CreateNativeConversation };
  const { query } = await import(pathToFileURL(resolve('apps/api/.test-build/test/postgres.js')).href) as { query: typeof Query };
  const cleanup: (() => void | Promise<void>)[] = [];
  const storage = await isolatedObjectStorage(); let account = '', conversation = '', otherAccount = '', otherConversation = '';
  try {
    await verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async target => {
      materialNetwork.expectOperations({ origin: target.origin, method: 'POST', path: `/v1/conversations/${conversation}/uploads`, query: {}, count: 1 });
      await page.goto('/uploads.html'); await page.waitForFunction(() => !!(window as unknown as Harness).uploadsTest);
      await page.evaluate(input => (window as unknown as Harness).uploadsTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: account, conversationId: conversation });
      const grant = await page.evaluate(() => (window as unknown as Harness).uploadsTest.authorize({ name: 'unverified.png', type: 'image/png', bytes: [137, 80, 78, 71, 13, 10, 26, 10] }));
      expect(grant.ok).toBe(true); if (!grant.ok) throw new Error('Owned browser grant missing');
      materialNetwork.expectObjectTransfer(grant.value.url);
      const observed: { bearer: boolean; cookie: boolean; method: string }[] = [];
      const headers: Promise<void>[] = [];
      context.on('request', request => { if (new URL(request.url()).origin === storage.endpoint) headers.push(request.allHeaders().then(value => { observed.push({ bearer: Object.hasOwn(value, 'authorization'), cookie: Object.hasOwn(value, 'cookie'), method: request.method() }); })); });
      const transferred = await page.evaluate(() => (window as unknown as Harness).uploadsTest.transfer()); expect(transferred.ok).toBe(true);
      materialNetwork.expectOperations({ origin: target.origin, method: 'POST', path: `/v1/uploads/${grant.value.uploadId}/confirm`, query: {}, count: 2 });
      for (let attempt = 0; attempt < 2; attempt++) { const result = await page.evaluate(() => (window as unknown as Harness).uploadsTest.confirmPrepared()); expect(result.ok).toBe(false); if (!result.ok) expect(result.error.code).toBe('not_implemented'); }
      materialNetwork.expectOperations({ origin: target.origin, method: 'POST', path: `/v1/conversations/${conversation}/uploads`, query: {}, count: 1 });
      const old = await page.evaluate(() => (window as unknown as Harness).uploadsTest.authorize({ name: 'late.png', type: 'image/png', bytes: [137, 80, 78, 71, 13, 10, 26, 10] }));
      expect(old.ok).toBe(true); if (!old.ok) throw new Error('Second owned grant missing');
      materialNetwork.expectObjectTransfer(old.value.url);
      let held!: () => void, release!: () => void;
      const reached = new Promise<void>(done => { held = done; }), gate = new Promise<void>(done => { release = done; });
      await page.route(value => value.origin === storage.endpoint && value.pathname === new URL(old.value.url).pathname, async route => { const response = await route.fetch(); expect(response.status()).toBe(200); held(); await gate; try { await route.fulfill({ response }); } catch (error) { if (!route.request().failure()) throw error; } }, { times: 1 });
      const pending = page.evaluate(() => (window as unknown as Harness).uploadsTest.transfer()); await reached;
      await page.evaluate(input => (window as unknown as Harness).uploadsTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[1]!, accountId: otherAccount, conversationId: otherConversation });
      const cancelled = await pending; expect(cancelled.ok).toBe(false); if (!cancelled.ok) expect(cancelled.error.code).toBe('cancelled'); release();
      const cleared = await page.evaluate(() => (window as unknown as Harness).uploadsTest.transfer()); expect(cleared.ok).toBe(false);
      await Promise.all(headers); expect(observed).toEqual([{ bearer: false, cookie: false, method: 'PUT' }, { bearer: false, cookie: false, method: 'PUT' }]);
      expect(materialNetwork.entries.filter(entry => entry.url.origin === storage.endpoint).every(entry => [...entry.url.searchParams].every(([key, value]) => !/^x-amz-/i.test(key) || value === '[redacted]'))).toBe(true);
      await expect(page.locator('[data-confirm]')).toHaveText(''); materialNetwork.assertSafe();
    }, { browserOrigin, storage: { endpoint: storage.endpoint, bucket: storage.bucket, region: 'us-east-1', credentials: storage.credentials },
      prepareSavedWork: async setup => { account = setup.accountIds[0]!; otherAccount = setup.accountIds[1]!; conversation = (await createNativeConversation(setup.native, account)).id; otherConversation = (await createNativeConversation(setup.native, otherAccount)).id; },
      verifySavedEffects: async url => { expect((await query(url, 'SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses,(SELECT count(*)::int FROM artifacts.uploads) AS uploads')).rows).toEqual([{ versions: 0, uses: 0, uploads: 2 }]); },
    });
  } finally { for (const fn of cleanup.reverse()) await fn(); await storage.close(); }
});
