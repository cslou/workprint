import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '../material-network.js';
import { browserOrigin } from '../origin.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission } from '../../../apps/api/test/auth-built-fixture.js';
import type { prepareManualSavedWork as PrepareManualSavedWork, publishManualScriptDraft as PublishManualScriptDraft, ManualSavedWork } from '../../../apps/api/test/manual-saved-work.js';
import type { query as Query } from '../../../apps/api/test/postgres.js';

for (const width of [1440, 390]) test(`manual Script edit saves and reloads exact persisted content at ${width}`, async ({ page, context, materialNetwork }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const { prepareManualSavedWork, publishManualScriptDraft } = await import(pathToFileURL(resolve('apps/api/.test-build/test/manual-saved-work.js')).href) as { prepareManualSavedWork: typeof PrepareManualSavedWork; publishManualScriptDraft: typeof PublishManualScriptDraft };
  const { query } = await import(pathToFileURL(resolve('apps/api/.test-build/test/postgres.js')).href) as { query: typeof Query };
  const cleanup: (() => void | Promise<void>)[] = [];
  let saved: ManualSavedWork | undefined;
  let setupUrl = ''; let servingUrl = '';
  try {
    await verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async target => {
      if (!saved) throw new Error('Existing manual-save prerequisites missing');
      const configure = { apiOrigin: target.origin, token: target.accessTokens[0]!, accountId: saved.accountId, conversationId: saved.conversationId, panelOnly: true };
      const allow = (method: string, path: string, count = 1) => materialNetwork.expectOperations({ origin: target.origin, method, path, query: {}, count });
      allow('GET', `/v1/conversations/${saved.conversationId}/workspace`); allow('GET', `/v1/versions/${saved.script.id}`);
      await page.goto('/saved-work.html'); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
      const mount = async () => page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), configure);
      await mount();
      await expect(page.getByRole('tabpanel')).toContainText('Ada waits beside the station clock.');
      await expect(page.getByRole('button', { name: 'Edit What happens', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Edit What happens', exact: true }).click();
      const text = 'Ada pauses beneath the station clock, then turns toward the platform.';
      await expect(page.getByRole('textbox', { name: 'What happens' })).toBeFocused();
      await page.getByRole('textbox', { name: 'What happens' }).fill(text);
      allow('POST', `/v1/conversations/${saved.conversationId}/versions`);
      const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname.endsWith('/versions'));
      await page.getByRole('button', { name: 'Save', exact: true }).press('Enter');
      const result = await (await response).json() as { version: { id: string; revision: number }; use: { state: string } };
      expect(result.version.revision).toBe(2); expect(result.use.state).toBe('approved');
      await expect(page.getByRole('textbox', { name: 'What happens' })).toHaveCount(0);
      await expect(page.getByRole('tabpanel')).toContainText(text);
      await expect(page.getByRole('button', { name: 'Edit What happens', exact: true })).toBeFocused();
      allow('GET', `/v1/conversations/${saved.conversationId}/workspace`); allow('GET', `/v1/versions/${result.version.id}`);
      await page.reload(); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest); await mount();
      await expect(page.getByRole('tabpanel')).toContainText(text);
      allow('GET', `/v1/artifacts/${saved.script.artifactId}/versions`);
      await page.locator('.wp-version-history summary').click();
      await expect(page.getByRole('button', { name: 'View version 1', exact: true })).toBeVisible();
      const editor = page.getByRole('textbox', { name: 'What happens' });
      const savePath = `/v1/conversations/${saved.conversationId}/versions`;
      const historyPath = `/v1/artifacts/${saved.script.artifactId}/versions`;
      const retained = 'My retained edit survives a concurrent save.';
      await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await editor.fill(retained);
      const other = await context.newPage();
      allow('GET', `/v1/conversations/${saved.conversationId}/workspace`); allow('GET', `/v1/versions/${result.version.id}`);
      await other.goto('/saved-work.html'); await other.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
      await other.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), configure);
      await other.getByRole('button', { name: 'Edit What happens', exact: true }).click();
      await other.getByRole('textbox', { name: 'What happens' }).fill('A concurrent human edit.');
      allow('POST', savePath);
      await other.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(other.getByRole('tabpanel')).toContainText('A concurrent human edit.');
      await expect(other.getByRole('textbox')).toHaveCount(0); await other.close();
      allow('POST', savePath);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('A newer version was saved.');
      await expect(editor).toHaveValue(retained); await expect(editor).toHaveJSProperty('readOnly', false);
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
      materialNetwork.expectOperations({ origin: target.origin, method: 'GET', path: historyPath, query: { limit: '1' }, count: 2 });
      await page.route(url => url.pathname === historyPath && url.searchParams.get('limit') === '1', async route => { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }, { times: 1 });
      await page.getByRole('button', { name: 'Review latest version', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText('The latest version could not be loaded. Your unsaved text is retained.');
      await expect(editor).toHaveValue(retained); await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Retry latest read', exact: true }).click();
      await expect(page.getByText('Latest saved version · Version 3', { exact: true })).toBeVisible();
      await expect(page.locator('.wp-manual-latest')).toContainText('A concurrent human edit.');
      const beforeContinue = materialNetwork.entries.filter(entry => entry.method === 'POST').length;
      await page.getByRole('button', { name: 'Continue with my text', exact: true }).click();
      await expect(editor).toHaveValue(retained); await expect(editor).toBeFocused(); await expect(page.getByRole('status')).toHaveText('Editing from version 3. Your text is not saved yet.');
      expect(materialNetwork.entries.filter(entry => entry.method === 'POST').length).toBe(beforeContinue);
      allow('POST', savePath); allow('GET', historyPath);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(editor).toHaveCount(0); await expect(page.getByRole('tabpanel')).toContainText(retained);

      // Drop only the response after the real backend has committed; no fabricated success.
      const lostText = 'A save whose response is lost after commit.';
      await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await editor.fill(lostText);
      let lostBody: unknown, lossDone!: () => void;
      const lossFinished = new Promise<void>(done => { lossDone = done; });
      await page.route(url => url.pathname === savePath, async route => {
        lostBody = route.request().postDataJSON();
        const response = await route.fetch(); expect(response.status()).toBe(200);
        await route.abort('failed'); lossDone();
      }, { times: 1 });
      allow('POST', savePath);
      await page.getByRole('button', { name: 'Save', exact: true }).click(); await lossFinished;
      await expect(page.getByRole('status')).toContainText('Save could not be confirmed.');
      await expect(editor).toHaveValue(lostText); await expect(editor).toHaveJSProperty('readOnly', true);
      await editor.press('ControlOrMeta+A');
      expect(await editor.evaluate(node => ({ start: (node as HTMLTextAreaElement).selectionStart, end: (node as HTMLTextAreaElement).selectionEnd }))).toEqual({ start: 0, end: lostText.length });
      allow('POST', savePath); allow('GET', historyPath);
      const retry = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === savePath);
      await page.getByRole('button', { name: 'Retry save', exact: true }).click();
      expect((await retry).postDataJSON()).toEqual(lostBody);
      await expect(editor).toHaveCount(0); await expect(page.getByRole('tabpanel')).toContainText(lostText);

      // A real SQL failure after the version/use/result writes rolls every effect back.
      await query(setupUrl, "CREATE FUNCTION artifacts.browser_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned browser rollback control'; END $$; CREATE TRIGGER browser_rollback AFTER INSERT ON artifacts.manual_changes FOR EACH ROW EXECUTE FUNCTION artifacts.browser_rollback()");
      await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await editor.fill('Retained after the transaction rolled back.');
      allow('POST', savePath);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Save could not be confirmed.');
      await expect(editor).toHaveValue('Retained after the transaction rolled back.');
      expect((await query(setupUrl, 'SELECT count(*)::int AS count FROM artifacts.versions')).rows).toEqual([{ count: 7 }]);
      await query(setupUrl, 'DROP TRIGGER browser_rollback ON artifacts.manual_changes; DROP FUNCTION artifacts.browser_rollback()');
      allow('POST', savePath); allow('GET', historyPath);
      await page.getByRole('button', { name: 'Retry save', exact: true }).click();
      await expect(editor).toHaveCount(0); await expect(page.getByRole('tabpanel')).toContainText('Retained after the transaction rolled back.');

      // Cancel closes an unknown-outcome observer; it cannot roll back its committed command.
      await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await editor.fill('Committed before an unknown-outcome Cancel.');
      await page.route(url => url.pathname === savePath, async route => { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }, { times: 1 });
      allow('POST', savePath);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(editor).toHaveCount(0);
      const loadCurrent = async (id: string) => {
        allow('GET', `/v1/conversations/${saved!.conversationId}/workspace`); allow('GET', `/v1/versions/${id}`);
        await page.reload(); await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest); await mount();
      };
      const currentVersion = async () => {
        const response = await fetch(`${target.origin}/v1/conversations/${saved!.conversationId}/workspace`, { headers: { Authorization: `Bearer ${target.accessTokens[0]}` } });
        expect(response.status).toBe(200);
        return (await response.json() as { script: { version: import('../../../packages/contracts/src/index.js').Version } }).script.version;
      };
      const cancelled = await currentVersion(); expect(cancelled.revision).toBe(7); await loadCurrent(cancelled.id);
      await expect(page.getByRole('tabpanel')).toContainText('Committed before an unknown-outcome Cancel.');

      // Prove each scope boundary independently against a committed, delayed real response.
      for (const [index, dimension] of ['conversation', 'account'].entries()) {
        const text = `Committed while the original ${dimension} closes.`;
        await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await editor.fill(text);
        let release!: () => void, held!: () => void, settled!: () => void;
        const gate = new Promise<void>(done => { release = done; }), reached = new Promise<void>(done => { held = done; }), completed = new Promise<void>(done => { settled = done; });
        await page.route(url => url.pathname === savePath, async route => { const response = await route.fetch(); expect(response.status()).toBe(200); held(); await gate; await route.fulfill({ response }); settled(); }, { times: 1 });
        allow('POST', savePath);
        await page.getByRole('button', { name: 'Save', exact: true }).click(); await reached;
        await expect(editor).toHaveJSProperty('readOnly', true);
        const next = dimension === 'conversation' ? { ...configure, conversationId: saved.otherConversationId } : { ...configure, accountId: saved.foreignAccountId, token: target.accessTokens[1]! };
        allow('GET', `/v1/conversations/${next.conversationId}/workspace`);
        await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), next);
        if (dimension === 'conversation') await expect(page.getByRole('tabpanel')).toContainText('Your script will appear here');
        else await expect(page.getByRole('tabpanel').getByRole('status')).toBeVisible();
        release(); await completed; await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
        await expect(page.getByRole('textbox')).toHaveCount(0); await expect(page.getByText(text, { exact: true })).toHaveCount(0);
        const late = await currentVersion(); expect(late.revision).toBe(8 + index); await loadCurrent(late.id);
      }

      await publishManualScriptDraft(servingUrl, saved, await currentVersion());
      await page.getByRole('button', { name: 'Edit What happens', exact: true }).click(); await editor.fill('Never flatten my retained input.');
      allow('POST', savePath); await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('A newer version was saved.');
      materialNetwork.expectOperations({ origin: target.origin, method: 'GET', path: historyPath, query: { limit: '1' }, count: 1 });
      await page.getByRole('button', { name: 'Review latest version', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText('The saved structure changed. Your text is retained, but it cannot be applied to this version automatically.');
      await expect(page.getByRole('button', { name: 'Continue with my text', exact: true })).toHaveCount(0); await expect(editor).toHaveValue('Never flatten my retained input.');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByRole('tab', { name: 'Assets', exact: true }).click();
      allow('GET', `/v1/versions/${saved.reference.id}`);
      await page.getByRole('button', { name: /Ada reference/ }).click();
      await page.getByRole('button', { name: 'Edit Description', exact: true }).click();
      await page.getByRole('textbox', { name: 'Description', exact: true }).fill('A traveller carrying a small case.');
      allow('POST', savePath);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('A traveller carrying a small case.');
      await expect(page.getByRole('textbox')).toHaveCount(0);
      await expect(page.getByRole('dialog').getByText('Ready', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('tab', { name: 'Storyboard', exact: true }).click();
      await page.getByRole('button', { name: 'View storyboard', exact: true }).click();
      await page.getByRole('button', { name: 'Edit Panel description', exact: true }).click();
      await page.getByRole('textbox', { name: 'Panel description', exact: true }).fill('Ada keeps the station clock above her shoulder.');
      allow('POST', savePath);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('textbox')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toContainText('Ada keeps the station clock above her shoulder.');
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      materialNetwork.assertSafe();
    }, {
      browserOrigin, prepareSavedWork: async setup => { if (!setup.setupUrl) throw new Error('Owned rollback setup is required'); setupUrl = setup.setupUrl; servingUrl = setup.servingUrl; saved = await prepareManualSavedWork(setup); },
      verifySavedEffects: async servingUrl => {
        expect((await query(servingUrl, 'SELECT (SELECT count(*)::int FROM artifacts.versions) AS versions,(SELECT count(*)::int FROM artifacts.commands) AS commands,(SELECT count(*)::int FROM artifacts.manual_changes) AS changes')).rows).toEqual([{ versions: 14, commands: 11, changes: 10 }]);
        expect((await query(servingUrl, 'SELECT v.kind,v.revision,u.state FROM artifacts.conversation_uses u JOIN artifacts.versions v ON v.owner_id=u.owner_id AND v.version_id=u.version_id ORDER BY v.kind')).rows).toEqual([{ kind: 'reference', revision: 2, state: 'approved' }, { kind: 'script', revision: 9, state: 'approved' }, { kind: 'storyboard', revision: 2, state: 'approved' }]);
      },
    });
  } finally { for (const fn of cleanup.reverse()) await fn(); }
});
