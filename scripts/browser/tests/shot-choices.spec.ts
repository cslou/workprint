import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '../material-network.js';
import { startReadBackend } from '../qualified-saved-backend.js';
import type { prepareShotChoiceWork as Prepare, ShotChoiceWork } from '../../../apps/api/test/shot-choice-work.js';
import type { query as Query } from '../../../apps/api/test/postgres.js';
import type { OperationResponse } from '../../../packages/contracts/src/index.js';

test('a persisted plan keeps stable Shot/Panel identities through edits and one exact Shot-video choice through change and reload', async ({ page, context, materialNetwork }) => {
  test.setTimeout(180000);
  const { prepareShotChoiceWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/shot-choice-work.js')).href) as { prepareShotChoiceWork: typeof Prepare };
  const { query } = await import(pathToFileURL(resolve('apps/api/.test-build/test/postgres.js')).href) as { query: typeof Query };
  let work: ShotChoiceWork | undefined;
  const backend = await startReadBackend(async setup => work = await prepareShotChoiceWork(setup), async url => {
    if (!work) throw new Error('Shot-choice prerequisites missing');
    const [first, second] = work.candidates;
    // One current choice: the later explicit use, never the displayed candidates or the earlier choice.
    assert.deepEqual((await query(url, "SELECT version_id,state FROM artifacts.conversation_uses WHERE purpose='shot_video' ORDER BY state")).rows, [{ version_id: first.id, state: 'approved' }, { version_id: second.id, state: 'draft' }]);
    // Two choice changes advance the revision; description-only planning edits and rejected stale saves do not.
    assert.deepEqual((await query(url, 'SELECT revision::int FROM artifacts.selection_revisions')).rows, [{ revision: 2 }]);
    assert.deepEqual((await query(url, "SELECT revision,content->'shots' AS shots FROM artifacts.versions WHERE kind='storyboard' ORDER BY revision DESC LIMIT 1")).rows.map(row => ({ revision: row.revision, ids: (row.shots as { shotId: string; panels: { panelId: string; description: string }[] }[]).map(shot => [shot.shotId, shot.panels.map(panel => [panel.panelId, panel.description])]) })),
      [{ revision: 2, ids: [['platform-shot', [['clock-panel', 'Ada beneath the station clock.'], ['track-panel', 'Ada watches the signal turn green.']]], ['arrival-shot', [['train-panel', 'The train reaches the platform.']]]] }]);
  });
  try {
    const { target, saved } = backend.data;
    const [first, second] = saved.candidates;
    const allow = (method: string, path: string, count = 1, purpose?: 'shot_video') => materialNetwork.expectOperations({ origin: target.origin, method, path, query: {}, count, ...(purpose ? { purpose } : {}) });
    // Each mount reads the workspace once and each exact candidate twice: for the Videos rows and the chosen-source summary.
    const reads = () => {
      allow('GET', `/v1/conversations/${saved.conversationId}/workspace`); allow('GET', `/v1/conversations/${saved.conversationId}/generation-requests`); allow('GET', `/v1/versions/${saved.script.id}`);
      for (const version of [first, second]) allow('GET', `/v1/versions/${version.id}`, 2);
    };
    const mount = async (on = page) => {
      await on.goto('/saved-work.html'); await on.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
      await on.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountId, conversationId: saved.conversationId });
    };
    const videos = async (on = page) => {
      await on.getByRole('tab', { name: 'Videos', exact: true }).click();
      await expect(on.locator('.wp-video-row[data-shot-id="platform-shot"]')).toHaveCount(2);
    };
    const row = (version: { revision: number }, on = page) => on.locator('.wp-video-row[data-shot-id="platform-shot"]').filter({ hasText: `Version ${version.revision}` });
    const chosen = (on = page) => on.locator('.wp-video-row').filter({ has: on.getByText('Chosen', { exact: true }) });

    reads(); await mount(); await videos();
    // Displayed uploads are candidates only.
    await expect(chosen()).toHaveCount(0);
    allow('POST', `/v1/conversations/${saved.conversationId}/uses`, 1, 'shot_video');
    await row(second).getByRole('button', { name: 'Use this version', exact: true }).click();
    await expect(row(second).getByRole('status')).toHaveText('This exact version is now used in this conversation.');
    await expect(chosen()).toHaveCount(1); await expect(chosen()).toContainText('Version 2');

    reads(); await page.reload(); await mount(); await videos();
    await expect(chosen()).toHaveCount(1);
    expect(await chosen().getAttribute('data-shot-id')).toBe('platform-shot');
    const workspace = async (token: string) => { const response = await fetch(`${target.origin}/v1/conversations/${saved.conversationId}/workspace`, { headers: { Authorization: `Bearer ${token}` } }); return { status: response.status, body: await response.json() as OperationResponse<'workspace'> }; };
    const persisted = await workspace(target.accessTokens[0]!);
    expect(persisted.body.storyboard.shots.map(shot => [shot.shotId, shot.chosenVideoVersionId])).toEqual([['platform-shot', second.id], ['arrival-shot', null]]);

    allow('POST', `/v1/conversations/${saved.conversationId}/uses`, 1, 'shot_video');
    await row(first).getByRole('button', { name: 'Use this version', exact: true }).click();
    await expect(row(first).getByRole('status')).toHaveText('This exact version is now used in this conversation.');
    expect((await workspace(target.accessTokens[0]!)).body.storyboard.shots[0]?.chosenVideoVersionId).toBe(first.id);

    // Another account can neither read nor choose in this conversation.
    expect((await workspace(target.accessTokens[1]!)).status).toBe(404);
    const foreign = await fetch(`${target.origin}/v1/conversations/${saved.conversationId}/uses`, { method: 'POST', headers: { Authorization: `Bearer ${target.accessTokens[1]!}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: crypto.randomUUID(), versionId: second.id, purpose: 'shot_video', shotId: 'platform-shot' }) });
    expect(foreign.status).toBe(404); await foreign.body?.cancel();

    // Planning edit on the second Panel of a multi-Panel Shot; a stale second editor keeps its text.
    const other = await context.newPage();
    reads(); await mount(other);
    for (const on of [page, other]) {
      await on.getByRole('tab', { name: 'Storyboard', exact: true }).click();
      await on.getByRole('button', { name: 'View storyboard', exact: true }).click();
    }
    const editor = (on = page) => on.getByRole('dialog');
    await editor(other).getByRole('button', { name: 'Edit Panel description', exact: true }).nth(1).click();
    await editor(other).getByRole('textbox', { name: 'Panel description', exact: true }).fill('Keep my stale planning text.');
    await editor().getByRole('button', { name: 'Edit Panel description', exact: true }).nth(1).click();
    await editor().getByRole('textbox', { name: 'Panel description', exact: true }).fill('Ada watches the signal turn green.');
    allow('POST', `/v1/conversations/${saved.conversationId}/versions`, 2);
    await editor().getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor().getByRole('textbox')).toHaveCount(0);
    await expect(editor()).toContainText('Ada watches the signal turn green.');
    await editor(other).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor(other).getByRole('status')).toContainText('A newer version was saved.');
    await expect(editor(other).getByRole('textbox', { name: 'Panel description', exact: true })).toHaveValue('Keep my stale planning text.');
    await other.close();

    reads(); await page.reload(); await mount();
    await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
    await page.getByRole('button', { name: 'View storyboard', exact: true }).click();
    await expect(editor()).toContainText('Ada beneath the station clock.'); await expect(editor()).toContainText('Ada watches the signal turn green.');
    const reloaded = (await workspace(target.accessTokens[0]!)).body;
    expect(reloaded.storyboard.shots.map(shot => [shot.shotId, shot.order, shot.panels.map(panel => [panel.panelId, panel.order]), shot.chosenVideoVersionId])).toEqual([
      ['platform-shot', 0, [['clock-panel', 0], ['track-panel', 1]], first.id], ['arrival-shot', 1, [['train-panel', 0]], null]]);
    expect(reloaded.selectionRevision).toBe(2);
  } finally { await backend.close(); }
});
