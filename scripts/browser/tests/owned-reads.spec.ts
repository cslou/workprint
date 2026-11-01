import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { test, expect } from '../material-network.js';
import { browserOrigin } from '../origin.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import type { prepareOwnedSavedWork as PrepareOwnedSavedWork, OwnedSavedWork } from '../../../apps/api/test/saved-work.js';

test('the real shell restores stored Script and text-only references without fixture projections', async ({ page, materialNetwork }) => {
  test.setTimeout(120000);
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const { prepareOwnedSavedWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/saved-work.js')).href) as { prepareOwnedSavedWork: typeof PrepareOwnedSavedWork };
  let saved: OwnedSavedWork | undefined;
  let accountId = '';
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async target => {
      if (!saved) throw new Error('Required stored prerequisites are missing');
      materialNetwork.expectOperations(
        { origin: target.origin, method: 'GET', path: `/v1/conversations/${saved.conversationA}/workspace`, query: {}, count: 1 },
        { origin: target.origin, method: 'GET', path: `/v1/versions/${saved.scriptVersions[0]!.id}`, query: {}, count: 1 },
        { origin: target.origin, method: 'GET', path: `/v1/conversations/${saved.conversationA}/generation-requests`, query: {}, count: 1 },
      );
      await page.goto('/saved-work.html');
      await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
      await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId, conversationId: saved.conversationA });
      await expect(page.getByRole('tabpanel')).toContainText('Ada waits beside the station clock.');
      await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
      materialNetwork.expectOperations({ origin: target.origin, method: 'GET', path: `/v1/artifacts/${saved.scriptVersions[0]!.artifactId}/versions`, query: {}, count: 1 });
      await page.locator('.wp-version-history summary').click();
      await expect(page.locator('.wp-version-history summary')).toHaveText('Version history');
      materialNetwork.expectOperations({ origin: target.origin, method: 'GET', path: `/v1/versions/${saved.scriptVersions[2]!.id}`, query: {}, count: 1 });
      await page.getByRole('button', { name: 'View version 3', exact: true }).click();
      await expect(page.getByRole('tabpanel')).toContainText('Ada folds her ticket and watches the empty platform.');
      materialNetwork.expectOperations({ origin: target.origin, method: 'GET', path: `/v1/versions/${saved.scriptVersions[0]!.id}`, query: {}, count: 1 });
      await page.getByRole('button', { name: 'Back to current version', exact: true }).click();
      await expect(page.getByRole('tabpanel')).toContainText('Ada waits beside the station clock.');
      await page.getByRole('tab', { name: 'Assets', exact: true }).click();
      await expect(page.getByRole('button', { name: /Ada reference/ })).toContainText('Draft');
      await expect(page.getByText('No image', { exact: true })).toBeVisible();
      materialNetwork.assertSafe();
    }, { browserOrigin, prepareSavedWork: async setup => { accountId = setup.accountIds[0]!; saved = await prepareOwnedSavedWork(setup); } });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
});
