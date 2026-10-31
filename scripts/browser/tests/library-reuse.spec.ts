import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '../material-network.js';
import { startReadBackend } from '../qualified-saved-backend.js';
import type { prepareManualSavedWork as Prepare, publishManualScriptDraft as Publish } from '../../../apps/api/test/manual-saved-work.js';
import type { prepareLibraryReuseWork as PrepareLibrary } from '../../../apps/api/test/library-reuse-work.js';
import type { query as Query } from '../../../apps/api/test/postgres.js';
import type { OperationRequest, OperationResponse } from '../../../packages/contracts/src/index.js';

test('lost exact-use response reconciles the original command without losing an active manual draft', async ({ page, materialNetwork }) => {
  test.setTimeout(150000);
  const module = await import(pathToFileURL(resolve('apps/api/.test-build/test/manual-saved-work.js')).href) as { prepareManualSavedWork: typeof Prepare; publishManualScriptDraft: typeof Publish };
  const { query } = await import(pathToFileURL(resolve('apps/api/.test-build/test/postgres.js')).href) as { query: typeof Query };
  const backend = await startReadBackend(async setup => {
    const work = await module.prepareManualSavedWork(setup);
    const later = (await module.publishManualScriptDraft(setup.servingUrl, work, work.script)).version;
    return { ...work, later };
  }, async url => {
    assert.deepEqual((await query(url, "SELECT (SELECT count(*)::int FROM artifacts.commands WHERE command_kind='use_version') AS uses,(SELECT count(*)::int FROM artifacts.commands WHERE command_kind='manual_save') AS saves,(SELECT count(*)::int FROM artifacts.versions) AS versions")).rows, [{ uses: 1, saves: 0, versions: 4 }], 'Reconciliation commits one exact use without replaying a manual mutation or copying content');
  });
  try {
    const { target, saved } = backend.data;
    const allow = (method: string, path: string, count = 1, purpose?: 'script') => materialNetwork.expectOperations({ origin: target.origin, method, path, query: {}, count, ...(purpose ? { purpose } : {}) });
    allow('GET', `/v1/conversations/${saved.conversationId}/workspace`); allow('GET', `/v1/conversations/${saved.conversationId}/generation-requests`); allow('GET', `/v1/versions/${saved.script.id}`);
    await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
    await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountId, conversationId: saved.conversationId });
    await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
    const text = page.getByRole('textbox', { name: 'What happens', exact: true }); await text.fill('Preserve this original base and text through exact reuse.');
    const original = await text.elementHandle(); expect(original).not.toBeNull();
    allow('GET', `/v1/artifacts/${saved.script.artifactId}/versions`);
    await page.locator('.wp-version-history summary').click();
    const commands: OperationRequest<'useVersion'>['body'][] = [];
    const usePath = `/v1/conversations/${saved.conversationId}/uses`;
    await page.route(url => url.origin === target.origin && url.pathname === usePath, async route => {
      commands.push(route.request().postDataJSON() as OperationRequest<'useVersion'>['body']);
      const response = await route.fetch(); expect(response.status()).toBe(200);
      if (commands.length === 1) await route.abort('failed'); else await route.fulfill({ response });
    });
    allow('POST', usePath, 1, 'script');
    await page.getByRole('button', { name: 'Use this version', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('This use could not be confirmed.');
    expect(commands).toHaveLength(1); expect(commands[0]?.versionId).toBe(saved.later.id);
    expect(await original!.evaluate(node => node.isConnected)).toBe(true); await expect(text).toHaveValue('Preserve this original base and text through exact reuse.');
    allow('POST', usePath, 1, 'script');
    await page.getByRole('button', { name: 'Retry use', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('This exact version is now used in this conversation.');
    expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]);
    expect(await original!.evaluate(node => node.isConnected)).toBe(true); await expect(text).toHaveValue('Preserve this original base and text through exact reuse.');
    const writes = materialNetwork.entries.filter(entry => entry.method === 'POST'); expect(writes.map(entry => entry.url.pathname)).toEqual([usePath, usePath]);
  } finally { await backend.close(); }
});

test('server-derived builtIn keeps a reused source read-only after workspace reload', async ({ page, materialNetwork }) => {
  test.setTimeout(150000);
  const { prepareLibraryReuseWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/library-reuse-work.js')).href) as { prepareLibraryReuseWork: typeof PrepareLibrary };
  const { query } = await import(pathToFileURL(resolve('apps/api/.test-build/test/postgres.js')).href) as { query: typeof Query };
  const backend = await startReadBackend(prepareLibraryReuseWork, async url => {
    assert.deepEqual((await query(url, "SELECT (SELECT count(*)::int FROM artifacts.commands WHERE command_kind='use_version') AS commands,(SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands WHERE command_kind='manual_save') AS saves")).rows, [{ commands: 1, versions: 5, saves: 0 }]);
  });
  try {
    const { target, saved } = backend.data;
    // Explicit human reuse through the real API is setup, never approval from inspection.
    const used = await fetch(`${target.origin}/v1/conversations/${saved.conversationId}/uses`, { method: 'POST', headers: { Authorization: `Bearer ${target.accessTokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: randomUUID(), versionId: saved.builtin.id, purpose: 'script' }) });
    expect(used.status).toBe(200); await used.body?.cancel();
    for (let load = 0; load < 2; load++) {
      materialNetwork.expectOperations(...[`/v1/conversations/${saved.conversationId}/workspace`, `/v1/conversations/${saved.conversationId}/generation-requests`, `/v1/versions/${saved.builtin.id}`].map(path => ({ origin: target.origin, method: 'GET', path, query: {}, count: 1 })));
      await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
      await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountId, conversationId: saved.conversationId });
      await expect(page.getByRole('tabpanel')).toContainText('An independently authored immutable fixture.');
      await expect(page.getByRole('button', { name: 'Edit What happens', exact: true })).toHaveCount(0);
    }
  } finally { await backend.close(); }
});

test('Library use preserves a mounted unknown save and its original payload; its replay cannot repin the later use', async ({ page, materialNetwork }) => {
  test.setTimeout(150000);
  const { prepareLibraryReuseWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/library-reuse-work.js')).href) as { prepareLibraryReuseWork: typeof PrepareLibrary };
  const { query } = await import(pathToFileURL(resolve('apps/api/.test-build/test/postgres.js')).href) as { query: typeof Query };
  const backend = await startReadBackend(prepareLibraryReuseWork, async url => {
    assert.deepEqual((await query(url, "SELECT (SELECT count(*)::int FROM artifacts.commands WHERE command_kind='manual_save') AS saves,(SELECT count(*)::int FROM artifacts.commands WHERE command_kind='use_version') AS uses,(SELECT count(*)::int FROM artifacts.versions) AS versions")).rows, [{ saves: 1, uses: 1, versions: 6 }]);
  });
  try {
    const { target, saved } = backend.data;
    const allow = (method: string, path: string, count = 1) => materialNetwork.expectOperations({ origin: target.origin, method, path, query: {}, count });
    allow('GET', `/v1/conversations/${saved.conversationId}/workspace`); allow('GET', `/v1/conversations/${saved.conversationId}/generation-requests`); allow('GET', `/v1/versions/${saved.script.id}`);
    await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
    await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountId, conversationId: saved.conversationId });
    await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
    const text = page.getByRole('textbox', { name: 'What happens', exact: true }); await text.fill('Retain my unknown save across reuse.');
    const field = await text.elementHandle(); expect(field).not.toBeNull();
    const commands: OperationRequest<'saveVersion'>['body'][] = [], path = `/v1/conversations/${saved.conversationId}/versions`;
    await page.route(url => url.origin === target.origin && url.pathname === path, async route => {
      commands.push(route.request().postDataJSON() as OperationRequest<'saveVersion'>['body']); const response = await route.fetch(); expect(response.status()).toBe(200);
      if (commands.length === 1) await route.abort('failed'); else await route.fulfill({ response });
    });
    allow('POST', path); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Save could not be confirmed.');
    allow('GET', '/v1/library'); await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.locator(`[data-page-id="${saved.builtin.artifactId}"]`).click();
    materialNetwork.expectOperations({ origin: target.origin, method: 'POST', path: `/v1/conversations/${saved.conversationId}/uses`, query: {}, count: 1, purpose: 'script' }); await page.getByRole('button', { name: 'Attach (1)', exact: true }).click();
    await expect(page.locator('.wp-picker-count')).toHaveText('Nothing selected yet'); await page.getByRole('button', { name: 'Close', exact: true }).click();
    expect(await field!.evaluate(node => node.isConnected)).toBe(true); await expect(text).toHaveValue('Retain my unknown save across reuse.'); await expect(text).toHaveAttribute('readonly', '');
    expect(commands[0]?.baseVersionId).toBe(saved.script.id);
    allow('POST', path); allow('GET', `/v1/versions/${saved.builtin.id}`); await page.getByRole('button', { name: 'Retry save', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText('An independently authored immutable fixture.');
    expect(commands[1]).toEqual(commands[0]);
    const current = await fetch(`${target.origin}/v1/conversations/${saved.conversationId}/workspace`, { headers: { Authorization: `Bearer ${target.accessTokens[0]}` } });
    expect(current.status).toBe(200); expect((await current.json() as OperationResponse<'workspace'>).script?.version.id).toBe(saved.builtin.id);
  } finally { await backend.close(); }
});

test('typed Library separates selection and inspection, labels bounded search and preserves focus and exact choices', async ({ page, materialNetwork }) => {
  test.setTimeout(150000);
  const { prepareLibraryReuseWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/library-reuse-work.js')).href) as { prepareLibraryReuseWork: typeof PrepareLibrary };
  const backend = await startReadBackend(prepareLibraryReuseWork);
  try {
    const { target, saved } = backend.data;
    const allow = (path: string, query: Record<string, string> = {}) => materialNetwork.expectOperations({ origin: target.origin, method: 'GET', path, query, count: 1 });
    allow(`/v1/conversations/${saved.conversationId}/workspace`); allow(`/v1/conversations/${saved.conversationId}/generation-requests`); allow(`/v1/versions/${saved.script.id}`); allow('/v1/library');
    await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
    await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountId, conversationId: saved.conversationId });
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.getByText('Search only looks at loaded names.', { exact: true })).toBeVisible();
    const tile = page.locator('.wp-picker-item').filter({ has: page.locator(`[data-page-id="${saved.secondReference.artifactId}"]`) });
    await expect(tile).toContainText('Station reference'); await expect(tile).not.toContainText(/Draft|Ready/);
    await tile.locator('.wp-picker-tile').click();
    allow(`/v1/versions/${saved.secondReference.id}`);
    await tile.getByRole('button', { name: 'Inspect Station reference', exact: true }).click();
    await expect(page.getByText('Required views and inherited coverage are not declared.', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Reference role', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tile.getByRole('button', { name: 'Inspect Station reference', exact: true })).toBeFocused();
    await expect(page.locator('.wp-picker-count')).toHaveText('1 selected');
    allow('/v1/library', { kind: 'script' }); await page.getByRole('button', { name: 'Scripts', exact: true }).click();
    await expect(page.locator('.wp-picker-tile')).toHaveCount(2);
    await expect(page.locator('.wp-picker-count')).toHaveText('1 selected');
    expect(materialNetwork.entries.filter(entry => entry.method === 'POST')).toHaveLength(0);
  } finally { await backend.close(); }
});

test('partial attachment preserves known successes and the unknown exact choice across Close and explicit Retry', async ({ page, materialNetwork }) => {
  test.setTimeout(150000);
  const { prepareLibraryReuseWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/library-reuse-work.js')).href) as { prepareLibraryReuseWork: typeof PrepareLibrary };
  const { query } = await import(pathToFileURL(resolve('apps/api/.test-build/test/postgres.js')).href) as { query: typeof Query };
  const backend = await startReadBackend(prepareLibraryReuseWork, async url => {
    assert.deepEqual((await query(url, "SELECT (SELECT count(*)::int FROM artifacts.commands WHERE command_kind='use_version') AS commands,(SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.conversation_uses) AS uses")).rows, [{ commands: 2, versions: 5, uses: 5 }], 'Only two exact uses commit; reconciliation neither copies content nor repeats a known success');
  });
  try {
    const { target, saved } = backend.data;
    const allow = (method: string, path: string, count = 1) => materialNetwork.expectOperations({ origin: target.origin, method, path, query: {}, count });
    allow('GET', `/v1/conversations/${saved.conversationId}/workspace`); allow('GET', `/v1/conversations/${saved.conversationId}/generation-requests`); allow('GET', `/v1/versions/${saved.script.id}`); allow('GET', '/v1/library');
    await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
    await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountId, conversationId: saved.conversationId });
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.locator(`[data-page-id="${saved.reference.artifactId}"]`).click(); await page.locator(`[data-page-id="${saved.secondReference.artifactId}"]`).click();
    const commands: OperationRequest<'useVersion'>['body'][] = [], path = `/v1/conversations/${saved.conversationId}/uses`;
    await page.route(url => url.origin === target.origin && url.pathname === path, async route => {
      commands.push(route.request().postDataJSON() as OperationRequest<'useVersion'>['body']); const response = await route.fetch(); expect(response.status()).toBe(200);
      if (commands.length === 2) await route.abort('failed'); else await route.fulfill({ response });
    });
    allow('POST', path, 2); await page.getByRole('button', { name: 'Attach (2)', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('could not be confirmed'); expect(commands).toHaveLength(2);
    await expect(page.locator('.wp-picker-count')).toHaveText('1 selected');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Library', exact: true })).toBeFocused();
    allow('GET', '/v1/library'); await page.getByRole('button', { name: 'Library', exact: true }).click();
    await expect(page.locator('.wp-picker-count')).toHaveText('1 selected'); expect(commands).toHaveLength(2);
    allow('POST', path); await page.getByRole('button', { name: 'Retry attach', exact: true }).click();
    await expect(page.locator('.wp-picker-count')).toHaveText('Nothing selected yet'); expect(commands).toHaveLength(3); expect(commands[2]).toEqual(commands[1]);
  } finally { await backend.close(); }
});
