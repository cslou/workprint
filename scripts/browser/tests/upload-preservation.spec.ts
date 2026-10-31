import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '../material-network.js';
import { browserOrigin } from '../origin.js';
import type { OperationResponse, OperationRequest } from '../../../packages/contracts/src/index.js';
import type { verifyBuiltAdmission as Verify } from '../../../apps/api/test/auth-built-fixture.js';
import type { isolatedObjectStorage as Storage } from '../../../apps/api/test/object-storage.js';
import type { qualifiedMediaFixtures as Fixtures } from '../../../apps/api/test/media-fixtures.js';
import type { createMediaSandbox as Sandbox } from '../../../apps/api/src/storage/index.js';
import type { prepareManualSavedWork as Prepare, ManualSavedWork } from '../../../apps/api/test/manual-saved-work.js';
import type { query as Query } from '../../../apps/api/test/postgres.js';

test.use({ trace: 'off', video: 'off' });
for (const phase of ['unsaved', 'conflict', 'unknown', 'question'] as const) test(`image completion preserves ${phase} work without replay`, async ({ page, materialNetwork }, info) => {
  test.setTimeout(180000);
  const load = (path: string) => import(pathToFileURL(resolve(`apps/api/.test-build/${path}.js`)).href);
  const { verifyBuiltAdmission } = await load('test/auth-built-fixture') as { verifyBuiltAdmission: typeof Verify };
  const { isolatedObjectStorage } = await load('test/object-storage') as { isolatedObjectStorage: typeof Storage };
  const { qualifiedMediaFixtures } = await load('test/media-fixtures') as { qualifiedMediaFixtures: typeof Fixtures };
  const { createMediaSandbox } = await load('src/storage/index') as { createMediaSandbox: typeof Sandbox };
  const { prepareManualSavedWork } = await load('test/manual-saved-work') as { prepareManualSavedWork: typeof Prepare };
  const { query } = await load('test/postgres') as { query: typeof Query };
  const service = await isolatedObjectStorage([browserOrigin]);
  const cleanup: (() => void | Promise<void>)[] = [];
  const media = { toolchainDirectory: resolve('outputs/toolchains/ffmpeg-6a601112e0d032676f2048205fabe998900d44bac2a57f7ca35619c705326002'), dockerPath: await realpath('/usr/local/bin/docker') };
  let release = () => {}, saved: ManualSavedWork | undefined, servingUrl = '';
  try {
    const sandbox = await createMediaSandbox(media);
    let fixtures: Awaited<ReturnType<typeof qualifiedMediaFixtures>>;
    try { fixtures = await qualifiedMediaFixtures(sandbox, media.dockerPath); } finally { await sandbox.close(); }
    await verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async target => {
      if (!saved) throw new Error('Owned manual work missing');
      const work = saved;
      const allow = (method: string, path: string, count = 1, query = {}) => materialNetwork.expectOperations({ origin: target.origin, method, path, count, query });
      const workspacePath = `/v1/conversations/${work.conversationId}/workspace`, savePath = `/v1/conversations/${work.conversationId}/versions`;
      const question = { id: 'upload-preservation-question', revision: 7, status: 'pending', scope: {}, prompt: 'Keep this pending question', options: [{ id: 'wait', label: 'Keep waiting' }] };
      if (phase === 'question') {
        await info.attach('question-prerequisite', { body: 'Labelled read-only pendingQuestion projection over the real owned workspace. No question save or successful answer is fabricated; question GET/answer remain real 501.', contentType: 'text/plain' });
        await page.route(url => url.origin === target.origin && url.pathname === workspacePath, async route => {
          const response = await route.fetch();
          if (response.status() !== 200) { await route.fulfill({ response }); return; }
          await route.fulfill({ response, json: { ...await response.json() as OperationResponse<'workspace'>, pendingQuestion: question } });
        });
        allow('GET', `/v1/questions/${question.id}`);
      }
      allow('GET', workspacePath); allow('GET', `/v1/versions/${work.script.id}`); allow('GET', `/v1/conversations/${work.conversationId}/generation-requests`);
      await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest: unknown }).savedWorkTest);
      let tokens = target.accessTokens;
      const configure = { apiOrigin: target.origin, token: tokens[0]!, accountId: work.accountId, conversationId: work.conversationId };
      const mount = async (input: typeof configure) => page.evaluate(value => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(value), input);
      await mount(configure);
      await expect(page.getByRole('button', { name: 'Edit What happens', exact: true })).toBeVisible();
      const editor = page.getByRole('textbox', { name: 'What happens', exact: true });
      const message = page.getByRole('textbox', { name: 'Message', exact: true });
      const draft = `Retain my ${phase} text through image completion.`;
      const messageText = `Unsent ${phase} message.`;
      await message.fill(messageText);
      let baseId = work.script.id, originalCommand: OperationRequest<'saveVersion'>['body'] | undefined;
      if (phase === 'unsaved') {
        await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await editor.fill('A confirmed local save before the next edit.');
        allow('POST', savePath);
        const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === savePath);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        baseId = (await (await response).json() as OperationResponse<'saveVersion'>).version.id;
        await expect(editor).toHaveCount(0);
      }
      if (phase !== 'question') {
        await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await editor.fill(draft);
        if (phase === 'conflict') {
          if (!('content' in work.script)) throw new Error('Script content missing');
          const response = await fetch(`${target.origin}${savePath}`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: randomUUID(), artifactId: work.script.artifactId, baseVersionId: work.script.id, kind: 'script', dependencies: work.script.dependencies, intendedUse: { purpose: 'script' }, content: { schemaVersion: 1, scenes: [{ heading: { setting: 'interior', location: 'Station', time: 'morning' }, characters: ['Ada'], script: [{ action: 'A concurrent human save.' }] }] } }) });
          expect(response.status).toBe(200);
          allow('POST', savePath);
          const request = page.waitForRequest(value => value.method() === 'POST' && new URL(value.url()).pathname === savePath);
          await page.getByRole('button', { name: 'Save', exact: true }).click(); originalCommand = (await request).postDataJSON() as typeof originalCommand;
          await expect(page.locator('.wp-manual-editor')).toContainText('A newer version was saved.');
        } else if (phase === 'unknown') {
          await page.route(url => url.origin === target.origin && url.pathname === savePath, async route => {
            originalCommand = route.request().postDataJSON() as typeof originalCommand;
            const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed');
          }, { times: 1 });
          allow('POST', savePath); await page.getByRole('button', { name: 'Save', exact: true }).click();
          await expect(page.locator('.wp-manual-editor')).toContainText('Save could not be confirmed.');
        }
      } else {
        allow('POST', `/v1/questions/${question.id}/answers`);
        await page.getByRole('button', { name: 'Keep waiting', exact: true }).click();
        await expect(page.locator('.wp-question-feedback')).toHaveText('Answering is not available yet. The question stays pending.');
        await page.getByRole('button', { name: 'Fold the question', exact: true }).click();
      }
      tokens = await target.refreshAccessTokens(); await page.evaluate(token => (window as unknown as { savedWorkTest: { rotateToken(token: string): void } }).savedWorkTest.rotateToken(token), tokens[0]!);
      const effects = async () => (await query(servingUrl, "SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands) AS commands,(SELECT count(*)::int FROM artifacts.manual_changes) AS changes,(SELECT count(*)::int FROM artifacts.media_objects) AS media,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses")).rows[0] as { versions: number; commands: number; changes: number; media: number; uses: number };
      const before = await effects();
      const mutations = () => materialNetwork.entries.filter(entry => entry.method !== 'GET' && entry.url.origin === target.origin).length;
      const beforeMutations = mutations();
      let reached!: () => void, completed!: () => void, imageId = '';
      const held = new Promise<void>(done => { reached = done; }), gate = new Promise<void>(done => { release = done; }), finished = new Promise<void>(done => { completed = done; });
      await page.route(url => url.origin === target.origin && url.pathname.endsWith('/uploads'), async route => {
        const response = await route.fetch(); expect(response.status()).toBe(201);
        const grant = await response.json() as OperationResponse<'requestUpload'>;
        materialNetwork.expectObjectTransfer(grant.url);
        allow('POST', `/v1/uploads/${grant.uploadId}/confirm`);
        await route.fulfill({ response });
      });
      await page.route(url => url.origin === target.origin && url.pathname.endsWith('/confirm'), async route => {
        const response = await route.fetch(); expect(response.status()).toBe(200);
        const receipt = await response.json() as OperationResponse<'confirmUpload'>;
        expect(receipt.version.kind).toBe('image'); expect(receipt.use).toMatchObject({ versionId: receipt.version.id, state: 'draft', binding: { purpose: 'reference' } });
        imageId = receipt.version.id; reached(); await gate;
        allow('GET', `/v1/versions/${imageId}/media`);
        await route.fulfill({ response }); completed();
      }, { times: 1 });
      await page.route(url => url.origin === target.origin && url.pathname.endsWith('/media'), async route => {
        const response = await route.fetch(); expect(response.status()).toBe(200);
        const access = await response.json() as OperationResponse<'media'>;
        materialNetwork.expectObjectTransfer(access.url, 1, 'GET'); await route.fulfill({ response });
      });
      allow('POST', `/v1/conversations/${work.conversationId}/uploads`);
      await page.getByLabel('Choose a JPEG or PNG image').setInputFiles({ name: 'preservation.png', mimeType: 'image/png', buffer: fixtures.png }); await held;
      const focused = phase === 'question' ? message : editor;
      await focused.focus(); const node = await focused.elementHandle(), messageNode = await message.elementHandle();
      const base = phase === 'question' ? null : await page.locator('.wp-manual-editor .wp-version-editor').getAttribute('data-version-id');
      if (phase !== 'question') expect(base).toBe(baseId);
      release(); await finished;
      await expect(page.getByRole('heading', { name: 'Image saved · Version 1', exact: true })).toBeVisible();
      await expect(page.getByRole('img', { name: 'Saved image', exact: true })).toBeVisible();
      expect(await node!.evaluate(element => element.isConnected && element === document.activeElement)).toBe(true);
      expect(await messageNode!.evaluate(element => element.isConnected)).toBe(true);
      await expect(message).toHaveValue(messageText);
      if (phase === 'question') {
        await expect(page.getByRole('button', { name: 'Show', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Show', exact: true }).click();
        await expect(page.locator('.wp-question-feedback')).toHaveText('Answering is not available yet. The question stays pending.');
      } else {
        await expect(editor).toHaveValue(draft);
        await expect(page.locator('.wp-manual-editor .wp-version-editor')).toHaveAttribute('data-version-id', baseId);
        await expect(editor).toHaveJSProperty('readOnly', phase === 'unknown');
        if (phase === 'conflict') { await expect(page.locator('.wp-manual-editor')).toContainText('A newer version was saved.'); await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled(); }
        if (phase === 'unknown') await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
      }
      expect(await effects()).toEqual({ ...before, versions: before.versions + 1, media: before.media + 1, uses: before.uses + 1 });
      expect(mutations()).toBe(beforeMutations + 2);
      expect(materialNetwork.entries.filter(entry => entry.url.pathname === workspacePath)).toHaveLength(1);
      // Switching panels must not discard the still-mounted manual recovery either.
      await page.getByRole('tab', { name: 'Assets', exact: true }).click();
      const imageRow = page.locator(`.wp-asset-row[data-media-version-id="${imageId}"]`);
      await expect(imageRow).toHaveCount(1); await expect(imageRow).toBeVisible(); await expect(imageRow).toContainText('Draft');
      await page.getByRole('tab', { name: 'Script', exact: true }).click();
      if (phase === 'unsaved' || phase === 'unknown') {
        allow('POST', savePath);
        const retry = page.waitForRequest(value => value.method() === 'POST' && new URL(value.url()).pathname === savePath);
        await page.getByRole('button', { name: phase === 'unknown' ? 'Retry save' : 'Save', exact: true }).click();
        const command = (await retry).postDataJSON() as OperationRequest<'saveVersion'>['body'];
        expect(command.baseVersionId).toBe(baseId);
        if (phase === 'unknown') expect(command).toEqual(originalCommand);
        await expect(editor).toHaveCount(0); await expect(page.getByRole('tabpanel', { name: 'Script' })).toContainText(draft);
      }
      // Exercise conversation and account teardown independently; no local receipt/draft may cross either boundary.
      if (phase === 'conflict' || phase === 'question') {
        const next = phase === 'conflict' ? { ...configure, token: tokens[0]!, conversationId: work.otherConversationId } : { ...configure, accountId: work.foreignAccountId, token: tokens[1]! };
        const nextPath = `/v1/conversations/${next.conversationId}/workspace`;
        allow('GET', nextPath);
        await mount(next);
        await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('');
        await expect(editor).toHaveCount(0); await expect(page.getByText(draft, { exact: true })).toHaveCount(0);
        await expect(page.locator(`[data-media-version-id="${imageId}"]`)).toHaveCount(0);
        await expect(page.getByRole('region', { name: 'Question' })).toHaveCount(0);
      }
      materialNetwork.assertSafe();
    }, { media, browserOrigin, storage: { endpoint: service.endpoint, bucket: service.bucket, region: 'us-east-1', credentials: service.credentials }, prepareSavedWork: async setup => { servingUrl = setup.servingUrl; saved = await prepareManualSavedWork(setup); }, verifySavedEffects: async url => {
      const changes = phase === 'unsaved' ? 2 : phase === 'question' ? 0 : 1;
      expect((await query(url, 'SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands) AS commands,(SELECT count(*)::int FROM artifacts.manual_changes) AS changes,(SELECT count(*)::int FROM artifacts.media_objects) AS media,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses')).rows).toEqual([{ versions: 4 + changes, commands: changes, changes, media: 1, uses: 4 }]);
    } });
  } finally { release(); for (const close of cleanup.reverse()) await close(); await service.close(); }
});
