import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';

type Harness = { storyboardTest: { configure(input: unknown): void; unmount(): void } };
const initial = 'Second Panel description.';

test('planning uses typed text only and viewing, Cancel and unmount never mutate', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Isolated read-only public Storyboard projection; no persisted product work or successful backend fixture.', contentType: 'text/plain' });
  await page.goto('/storyboard.html'); await page.waitForFunction(() => !!(window as unknown as Harness).storyboardTest);
  const requests: string[] = [];
  await page.route('**/v1/**', async route => { requests.push(route.request().method()); await route.abort('failed'); });
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.configure({ apiOrigin: 'http://127.0.0.1:4179' }));
  await expect(page.getByText(initial, { exact: true })).toBeVisible();
  await expect(page.getByText('Opaque camera must not render.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Panel description', exact: true }).click();
  await page.getByRole('textbox', { name: 'Panel description', exact: true }).fill('Unsaved\nexact planning text.');
  expect(await page.locator('.wp-version-edit-actions button').allTextContents()).toEqual(['Cancel', 'Save']);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText(initial, { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.unmount());
  expect(requests).toEqual([]);
});

for (const shot of [false, true]) test(`planning ${shot ? 'Shot intent' : 'Panel description'} binds exact base and identities on real 401/501`, async ({ page }, info) => {
  test.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Read-only public planning projection; PATCH reaches the built loopback backend and receives real admission/unavailable responses.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status, feedback] of [[accessTokens[0], 501, 'Saving is not available yet. Your unsaved text is retained.'], [null, 401, 'Sign-in required to save. Your unsaved text is retained.']] as const) {
        await page.goto('/storyboard.html'); await page.waitForFunction(() => !!(window as unknown as Harness).storyboardTest);
        const sent: unknown[] = [];
        await page.route('**/v1/**', async route => { expect(new URL(route.request().url()).origin).toBe(origin); expect(route.request().method()).toBe('PATCH'); sent.push(route.request().postDataJSON()); await route.continue(); });
        await page.evaluate(input => (window as unknown as Harness).storyboardTest.configure(input), { apiOrigin: origin, token, shot });
        const label = shot ? 'Shot intent' : 'Panel description';
        await page.getByRole('button', { name: `Edit ${label}`, exact: true }).click();
        await page.getByRole('textbox', { name: label, exact: true }).fill('Exact draft\nwith a second line.');
        const response = page.waitForResponse(value => value.url() === `${origin}/v1/conversations/read-only-conversation/storyboard`);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        expect((await response).status()).toBe(status);
        await expect(page.getByRole('status')).toHaveText(feedback);
        await expect(page.getByRole('textbox')).toHaveValue('Exact draft\nwith a second line.');
        expect(sent).toHaveLength(1);
        const body = sent[0] as { baseVersionId: string; operationId: string; shots: { shotId: string; order: number; intent: string; panels: { panelId: string; order: number; description: string; references: string[] }[] }[] };
        expect(body.baseVersionId).toBe('board-v7'); expect(body.operationId).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.shots.map(value => [value.shotId, value.order])).toEqual([['shot-b', 20], ['shot-a', 10]]);
        expect(body.shots[0]).toEqual({ shotId: 'shot-b', order: 20, intent: 'Second Shot', panels: [] });
        expect(body.shots[1]?.intent).toBe(shot ? 'Exact draft\nwith a second line.' : 'First Shot');
        expect(body.shots[1]?.panels).toEqual([{ panelId: 'panel-b', order: 8, description: shot ? initial : 'Exact draft\nwith a second line.', references: ['reference-v2'] }, { panelId: 'panel-a', order: 3, description: 'First Panel description.', references: [] }]);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.getByText(shot ? 'First Shot' : initial, { exact: true })).toBeVisible();
        await page.unroute('**/v1/**');
      }
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});
