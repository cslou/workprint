import { expect, test } from '@playwright/test';
import { test as observedTest } from '../material-network.js';
import { activate } from '../activation.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';

type Harness = { storyboardTest: { configure(input: unknown): void; unmount(): void } };
const initial = 'Second Panel description.';

test('aborted planning PATCH retains the exact base, selection and draft and re-enables controls', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Labelled read-only workspace/version projections; actual planning PATCH is aborted, never replaced by a successful backend response.', contentType: 'text/plain' });
  await page.goto('/storyboard.html'); await page.waitForFunction(() => !!(window as unknown as Harness).storyboardTest);
  const patches: unknown[] = [];
  await page.route('**/v1/**', async route => { if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON()); else expect(route.request().method()).toBe('GET'); await route.abort('failed'); });
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.configure({ composition: true, videos: true, apiOrigin: 'http://127.0.0.1:4179' }));
  await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  const selection = () => page.locator('.wp-video-row [data-current-version-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-current-version-id')));
  await expect.poll(selection).toEqual(['video-v1', 'video-v1']);
  await page.getByRole('button', { name: 'View storyboard', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Panel description', exact: true }).last().click();
  const field = page.getByRole('textbox', { name: 'Panel description', exact: true });
  const draft = 'Exact planning draft.\nThe second line stays.';
  await field.fill(draft); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Changes were not saved. Your unsaved text is retained.');
  await expect(field).toHaveValue(draft);
  await expect(field.locator('..')).toHaveAttribute('data-version-id', 'board-v7');
  await expect(field.locator('..')).toHaveAttribute('data-version-revision', '7');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  expect(await selection()).toEqual(['video-v1', 'video-v1']);
  expect(patches).toHaveLength(1); expect(patches[0]).toMatchObject({ baseVersionId: 'board-v7', shots: expect.arrayContaining([expect.objectContaining({ shotId: 'shot-a', panels: expect.arrayContaining([expect.objectContaining({ panelId: 'panel-b', description: draft })]) })]) });
});

test('production Shell composes ordered typed Storyboard and an exact Panel viewer without mutations', async ({ page }, info) => {
  await info.attach('prerequisite', { body: 'Labelled read-only public workspace delivered to the production Shell; no successful mutation or persisted lifecycle fixture.', contentType: 'text/plain' });
  await page.goto('/storyboard.html'); await page.waitForFunction(() => !!(window as unknown as Harness).storyboardTest);
  const methods: string[] = [];
  await page.route('**/v1/**', async route => { methods.push(route.request().method()); await route.abort('failed'); });
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.configure({ composition: true }));
  await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  await expect(page.locator('.wp-storyboard-shot').first()).toHaveAttribute('data-shot-id', 'shot-a');
  expect(await page.locator('.wp-storyboard-shot').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-shot-id')))).toEqual(['shot-a', 'shot-b']);
  expect(await page.locator('.wp-storyboard-panel').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-panel-id')))).toEqual(['panel-a', 'panel-b']);
  await expect(page.locator('.wp-storyboard').getByText('First Shot', { exact: true })).toBeVisible();
  await expect(page.getByText(initial, { exact: true })).toBeVisible();
  await expect(page.getByText('Opaque camera must not render.', { exact: true })).toHaveCount(0);
  await expect(page.locator('.wp-storyboard img')).toHaveCount(0);
  await page.getByRole('button', { name: 'View Panel 1.2 version 2', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Panel 1.2 · Version 2');
  await expect(page.getByText('Shot 1 · Panel 1.2 · Version 2', { exact: true })).toBeVisible();
  await expect(page.locator('[data-current-version-id]')).toHaveAttribute('data-current-version-id', 'panel-image-v1');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'View storyboard', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Storyboard');
  await expect(page.getByRole('button', { name: 'Edit Shot intent', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Edit Panel description', exact: true }).last().click();
  await page.getByRole('textbox', { name: 'Panel description', exact: true }).fill('Draft across tabs.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
  await page.getByRole('button', { name: 'View storyboard', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Panel description', exact: true })).toHaveValue('Draft across tabs.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => (window as unknown as Harness).storyboardTest.unmount());
  expect(methods.every(method => method === 'GET')).toBe(true);
});

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

observedTest('Panel choice sends exact version and Shot/Panel binding to real 401/501 without changing approval', async ({ page, materialNetwork }, info) => {
  observedTest.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Labelled read-only Panel candidates and approval projection; actual Use and version reads reach the built loopback backend.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status, copy] of [[accessTokens[0], 501, 'Using this version is not available yet. The current selection is unchanged.'], [null, 401, 'Sign-in required to use this version. The current selection is unchanged.']] as const) {
        await page.goto('/storyboard.html'); await page.waitForFunction(() => !!(window as unknown as Harness).storyboardTest);
        materialNetwork.expectOperations(
          { origin, method: 'GET', path: '/v1/versions/panel-image-v2', count: 1, query: {} },
          { origin, method: 'GET', path: '/v1/conversations/read-only-conversation/generation-requests', count: 1, query: {} },
          { origin, method: 'POST', path: '/v1/conversations/read-only-conversation/uses', count: 1, query: {}, purpose: 'panel_image' },
        );
        const commands: { path: string; body: unknown }[] = [];
        await page.route('**/v1/**', async route => { expect(new URL(route.request().url()).origin).toBe(origin); if (route.request().method() !== 'GET') commands.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() }); await route.continue(); });
        await page.evaluate(input => (window as unknown as Harness).storyboardTest.configure(input), { composition: true, apiOrigin: origin, token });
        await activate(page.getByRole('tab', { name: 'Storyboard', exact: true }), status === 501);
        await activate(page.getByRole('button', { name: 'View storyboard', exact: true }), status === 501);
        await expect(page.getByRole('dialog')).toHaveAccessibleName('Storyboard');
        await activate(page.getByRole('button', { name: 'Edit Shot intent', exact: true }).first(), status === 501);
        await page.getByRole('textbox', { name: 'Shot intent', exact: true }).fill('Local cancelled planning edit');
        await activate(page.getByRole('button', { name: 'Cancel', exact: true }), status === 501);
        await expect(page.getByRole('textbox', { name: 'Shot intent', exact: true })).toHaveCount(0);
        await activate(page.getByRole('button', { name: 'Close', exact: true }), status === 501);
        await activate(page.getByRole('button', { name: 'View Panel 1.2 version 2', exact: true }), status === 501);
        expect(commands).toEqual([]);
        const response = page.waitForResponse(value => value.url() === `${origin}/v1/conversations/read-only-conversation/uses`);
        await activate(page.getByRole('button', { name: 'Use this version', exact: true }), status === 501);
        expect((await response).status()).toBe(status);
        await expect(page.getByRole('status')).toHaveText(copy);
        await expect(page.locator('[data-current-version-id]')).toHaveAttribute('data-current-version-id', 'panel-image-v1');
        expect(commands).toEqual([{ path: '/v1/conversations/read-only-conversation/uses', body: { purpose: 'panel_image', shotId: 'shot-a', panelId: 'panel-b', versionId: 'panel-image-v2', operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) } }]);
        await activate(page.getByRole('button', { name: 'Close', exact: true }), status === 501);
        await page.evaluate(() => (window as unknown as Harness).storyboardTest.unmount());
        expect(commands).toHaveLength(1);
        await page.unroute('**/v1/**');
      }
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});

for (const shot of [false, true]) observedTest(`planning ${shot ? 'Shot intent' : 'Panel description'} binds exact base and identities on real 401/501`, async ({ page, materialNetwork }, info) => {
  observedTest.setTimeout(120000);
  await info.attach('prerequisite', { body: 'Read-only public planning projection; PATCH reaches the built loopback backend and receives real admission/unavailable responses.', contentType: 'text/plain' });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const cleanup: (() => void | Promise<void>)[] = [];
  try {
    await verifyBuiltAdmission({ diagnostic(message) { console.log(message); }, after(fn) { cleanup.push(fn); } }, async ({ origin, accessTokens }) => {
      for (const [token, status, feedback] of [[accessTokens[0], 501, 'Saving is not available yet. Your unsaved text is retained.'], [null, 401, 'Sign-in required to save. Your unsaved text is retained.']] as const) {
        await page.goto('/storyboard.html'); await page.waitForFunction(() => !!(window as unknown as Harness).storyboardTest);
        materialNetwork.expectOperations({ origin, method: 'PATCH', path: '/v1/conversations/read-only-conversation/storyboard', count: 1, query: {} });
        const sent: unknown[] = [];
        await page.route('**/v1/**', async route => { expect(new URL(route.request().url()).origin).toBe(origin); expect(route.request().method()).toBe('PATCH'); sent.push(route.request().postDataJSON()); await route.continue(); });
        await page.evaluate(input => (window as unknown as Harness).storyboardTest.configure(input), { apiOrigin: origin, token, shot });
        const label = shot ? 'Shot intent' : 'Panel description';
        await activate(page.getByRole('button', { name: `Edit ${label}`, exact: true }), status === 501);
        await page.getByRole('textbox', { name: label, exact: true }).fill('Exact draft\nwith a second line.');
        const response = page.waitForResponse(value => value.url() === `${origin}/v1/conversations/read-only-conversation/storyboard`);
        await activate(page.getByRole('button', { name: 'Save', exact: true }), status === 501);
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
        await activate(page.getByRole('button', { name: 'Cancel', exact: true }), status === 501);
        await expect(page.getByText(shot ? 'First Shot' : initial, { exact: true })).toBeVisible();
        await page.unroute('**/v1/**');
      }
    }, { browserOrigin: 'http://127.0.0.1:4179' });
  } finally { for (const finish of cleanup.reverse()) await finish(); }
});
