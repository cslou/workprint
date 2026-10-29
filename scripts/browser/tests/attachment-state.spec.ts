import { browserOrigin } from '../origin.js';
import { test, expect } from '../material-network.js';
import { existingWorkspace, chosenVideo, approvedImage, reference, materialFacts } from '../attachment-prerequisites.js';

for (const outcome of ['abort', 'acknowledged'] as const) test(`reference attachment preserves existing exact choices and approvals (${outcome})`, async ({ page, materialNetwork }, info) => {
  await info.attach('prerequisite', { body: 'Labelled read-only existing workspace, exact versions and reference presentation. Local workspace/request-list collaborators are observation prerequisites. Controlled approved acknowledgement exercises unreachable attachment reconciliation, not persistence or generation.', contentType: 'text/plain' });
  const origin = browserOrigin;
  materialNetwork.expectOperations(
    { origin, method: 'GET', path: `/v1/versions/${chosenVideo.id}`, count: 2, query: {} },
    { origin, method: 'GET', path: `/v1/versions/${approvedImage.id}`, count: 2, query: {} },
    { origin, method: 'GET', path: `/v1/versions/${reference.id}`, count: 2, query: {} },
    { origin, method: 'GET', path: '/v1/library', count: 1, query: {} },
    { origin, method: 'POST', path: '/v1/conversations/conversation-a/uses', count: 1, query: {} },
  );
  await page.route('**/v1/library*', route => route.fulfill({ json: { items: [{ id: 'new-reference', kind: 'reference', builtIn: false, latestVersion: { ...reference, id: 'attachment-candidate-v4', artifactId: 'attachment-candidate' } }], nextCursor: null } }));
  const commands: unknown[] = [];
  await page.route('**/v1/conversations/*/uses', async route => {
    const body = route.request().postDataJSON() as { purpose: string; versionId: string };
    commands.push(body); expect(body.purpose).toBe('reference');
    if (outcome === 'abort') await route.abort('failed');
    else await route.fulfill({ json: { use: { id: 'isolated-attachment-ack', versionId: body.versionId, binding: { purpose: 'reference' }, state: 'approved' }, selectionRevision: 10 } });
  });
  await page.goto('/shell.html'); await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
  const input: unknown = { session: { accountId: 'read-only-account', name: 'Read-only existing state' }, conversationId: 'conversation-a', apiOrigin: browserOrigin, token: null, readOnlyWorkspace: existingWorkspace, materialPrerequisites: materialFacts, videoPrerequisites: { versions: [chosenVideo] } };
  await page.evaluate(input => (window as unknown as { shellTest: { configure(input: unknown): void } }).shellTest.configure(input), input);
  const assertExisting = async () => {
    await page.getByRole('tab', { name: 'Videos', exact: true }).click();
    const row = page.locator('.wp-video-row[data-shot-id="existing-shot"]');
    await expect(row.locator('.wp-status')).toHaveText('Chosen');
    await expect(row.locator('.wp-version-use')).toHaveAttribute('data-current-version-id', chosenVideo.id);
    await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
    await page.getByRole('button', { name: 'View Panel 1.1 version 4', exact: true }).click();
    await expect(page.locator('.wp-panel-version')).toHaveAttribute('data-displayed-version-id', approvedImage.id);
    await expect(page.getByRole('dialog').locator('.wp-version-use')).toHaveAttribute('data-current-version-id', approvedImage.id);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('tab', { name: 'Assets', exact: true }).click();
    await expect(page.locator('.wp-asset-row')).toHaveCount(1);
    await expect(page.locator('.wp-asset-row .wp-status')).toHaveText('Ready');
    await page.locator('.wp-asset-row').click();
    await expect(page.getByRole('dialog').locator('.wp-version-review')).toHaveAttribute('data-displayed-version-id', reference.id);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  };
  await assertExisting();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.locator('.wp-picker-tile').click();
  await page.getByRole('button', { name: 'Attach (1)', exact: true }).click();
  if (outcome === 'abort') {
    await expect(page.locator('.wp-picker-feedback')).toHaveText('Nothing was attached. Your existing attachments are unchanged.');
    await expect(page.locator('.wp-picker-tile')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.wp-picker-count')).toHaveText('1 selected');
  } else await expect(page.locator('.wp-picker-count')).toHaveText('Nothing selected yet');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await assertExisting();
  expect(commands).toHaveLength(1); expect(commands[0]).toMatchObject({ purpose: 'reference', versionId: 'attachment-candidate-v4' });
  materialNetwork.assertSafe();
  await page.evaluate(() => (window as unknown as { shellTest: { unmount(): void } }).shellTest.unmount());
});
