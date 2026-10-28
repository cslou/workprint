import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { classifyWorkspaceFailure } from '../../../apps/web/src/shell/workspace.js';

test('workspace failures retain authentication, availability and error classifications', () => {
  expect(classifyWorkspaceFailure('unauthenticated')).toBe('unauthenticated');
  expect(classifyWorkspaceFailure('not_implemented')).toBe('unavailable');
  for (const code of ['timed_out', 'transport_failure', 'cancelled', 'invalid_response', 'forbidden', 'not_found', 'invalid_input', 'stale_revision', 'superseded', 'unsupported', 'integration_failure'] as const) expect(classifyWorkspaceFailure(code)).toBe('error');
});

async function configure(page: Page, value: unknown) {
  await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
  await page.evaluate((input) => (window as unknown as { shellTest: { configure(input: unknown): void } }).shellTest.configure(input), value);
}
for (const width of [1440, 390]) test(`keyboard account actions and navigation at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto('/shell.html');
  await configure(page, { session: { accountId: 'keyboard-account', name: 'Creator A' } });
  if (width === 390) { await page.getByRole('button', { name: 'Menu', exact: true }).focus(); await page.keyboard.press('Enter'); }
  await page.getByRole('button', { name: 'Creator A', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Switch account', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog')).toContainText('Account actions are not available yet. Nothing about your session has changed.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  if (width === 390) { await page.getByRole('button', { name: 'Menu', exact: true }).focus(); await page.keyboard.press('Enter'); }
  await page.getByRole('button', { name: 'Library', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Library connection not configured');
});

for (const width of [1440, 390, 820, 821]) test(`shell navigation, session and native boundaries at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto('/shell.html');
  await configure(page, { session: null });
  const openMenu = async () => { if (width <= 820) await page.getByRole('button', { name: 'Menu', exact: true }).click(); };
  await openMenu();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Not signed inSign-in is not available yet.');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await configure(page, { session: { accountId: 'account-a', name: 'Creator A' } });
  await openMenu();
  await page.getByRole('button', { name: 'Creator A', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Account actions are not available yet. Nothing about your session has changed.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'New video', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('No conversation was created.');
  await page.keyboard.press('Escape');
  await openMenu();
  await page.getByRole('button', { name: 'Recents', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('No conversation list was loaded.');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Script', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Assets', exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const tab of ['Storyboard', 'Videos', 'Script']) await page.getByRole('tab', { name: tab, exact: true }).click();
  await openMenu();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Library connection not configured');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as { shellTest: { tokenCalls(): number } }).shellTest.tokenCalls())).toBe(0);
  await expect(page.locator('body')).not.toContainText('Proposal only');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('opening Send is local, retains the message and never answers a question', async ({ page }) => {
  await page.goto('/shell.html');
  await configure(page, { session: null });
  let requests = 0;
  await page.route('**/v1/**', async (route) => { requests++; await route.abort(); });
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep this unsent message');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Sending messages is not available yet. Your message is kept.');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep this unsent message');
  expect(requests).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { shellTest: { tokenCalls(): number } }).shellTest.tokenCalls())).toBe(0);
});

const emptyWorkspace = (revision: number) => ({ script: null, assets: [], storyboard: { work: null, shots: [] }, videos: [], pendingQuestion: null, activeWork: [], selectionRevision: revision });
const pendingDraftQuestion = { id: 'draft-question', revision: 1, status: 'pending', scope: {}, prompt: 'Keep the current draft?', options: [{ id: 'keep', label: 'Keep it' }] };

test('composer draft survives delayed opening-to-question and question-to-opening transitions', async ({ page }, info) => {
  await info.attach('race', { body: 'Labelled read-only workspace/question projections; controlled read completion tests a same-scope surface race, not persisted product work.', contentType: 'text/plain' });
  await page.goto('/shell.html');
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let workspaceCalls = 0; const requests: string[] = [];
  await page.route('**/v1/**', async (route) => {
    expect(route.request().method()).toBe('GET'); requests.push(new URL(route.request().url()).pathname);
    if (route.request().url().endsWith('/workspace')) { const first = ++workspaceCalls === 1; if (first) await gate; await route.fulfill({ json: { ...emptyWorkspace(workspaceCalls), pendingQuestion: first ? pendingDraftQuestion : null } }); }
    else await route.abort('failed');
  });
  const scope = { session: { accountId: 'draft-account', name: 'Draft account' }, conversationId: 'draft-conversation', apiOrigin: 'http://127.0.0.1:4179' };
  await configure(page, scope); await expect.poll(() => workspaceCalls).toBe(1);
  const message = page.getByRole('textbox', { name: 'Message', exact: true });
  await expect(message).toHaveAttribute('placeholder', 'Describe your video…');
  const draft = 'Exact opening draft.\nDo not discard the second line.';
  await message.fill(draft); expect(requests).toEqual(['/v1/conversations/draft-conversation/workspace']);
  expect(await page.evaluate(() => (window as unknown as { shellTest: { tokenCalls(): number } }).shellTest.tokenCalls())).toBe(1);
  release(); await expect(page.getByRole('region', { name: 'Question', exact: true })).toBeVisible();
  await expect(message).toHaveAttribute('placeholder', 'Pick an option, type your own answer, or ask something else…');
  await expect(message).toHaveValue(draft);
  await expect.poll(() => requests.length).toBe(2);
  const dockedDraft = draft + '\nTyped while docked.'; await message.fill(dockedDraft); expect(requests).toHaveLength(2);
  // Existing harness client replacement supplies a later settled snapshot; its loading presentation is not changed or asserted here.
  await configure(page, scope);
  await expect(message).toHaveAttribute('placeholder', 'Describe your video…');
  await expect(message).toHaveValue(dockedDraft);
  expect(requests).toEqual(['/v1/conversations/draft-conversation/workspace', '/v1/questions/draft-question', '/v1/conversations/draft-conversation/workspace']);
});

for (const axis of ['account', 'conversation']) test(`composer draft clears on ${axis}-only switch`, async ({ page }) => {
  await page.goto('/shell.html'); const requests: string[] = [];
  await page.route('**/v1/**', async (route) => { expect(route.request().method()).toBe('GET'); requests.push(route.request().method()); if (route.request().url().endsWith('/workspace')) await route.fulfill({ json: { ...emptyWorkspace(1), pendingQuestion: pendingDraftQuestion } }); else await route.abort('failed'); });
  const session = { accountId: 'draft-account', name: 'Draft account' };
  await configure(page, { session, conversationId: 'draft-conversation', apiOrigin: 'http://127.0.0.1:4179' });
  await expect(page.getByRole('region', { name: 'Question', exact: true })).toBeVisible();
  const message = page.getByRole('textbox', { name: 'Message', exact: true }); await message.fill('Scope-owned draft');
  const before = requests.length;
  await configure(page, { session: axis === 'account' ? { accountId: 'other-account', name: 'Other account' } : session, conversationId: axis === 'conversation' ? 'other-conversation' : 'draft-conversation' });
  await expect(message).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Question', exact: true })).toBeVisible();
  await expect(message).toHaveValue(''); expect(requests.length).toBeGreaterThanOrEqual(before);
});

const reads = (page: Page) => page.evaluate(() => (window as unknown as { shellTest: { reads(): { call: number; conversationId: string; settled: boolean; code: string | null }[] } }).shellTest.reads());

for (const axis of ['account-only', 'conversation-only'] as const) test(`${axis} switch resets presentation after the old read has settled or cancelled`, async ({ page }) => {
  await page.goto('/shell.html');
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  let finishOldHandler!: () => void;
  const oldHandlerDone = new Promise<void>((resolve) => { finishOldHandler = resolve; });
  let requests = 0;
  await page.route('**/v1/conversations/*/workspace', async (route) => {
    const call = ++requests;
    if (call === 1) {
      await oldGate;
      try { if (!route.request().failure()) await route.fulfill({ json: emptyWorkspace(1) }); }
      finally { finishOldHandler(); }
    } else await route.fulfill({ json: emptyWorkspace(2) });
  });
  const session = { accountId: 'account-a', name: 'Creator A' };
  const next = { session: axis === 'account-only' ? { accountId: 'account-b', name: 'Creator B' } : session, conversationId: axis === 'conversation-only' ? 'conversation-b' : 'conversation-a' };
  await configure(page, { session, conversationId: 'conversation-a', apiOrigin: 'http://127.0.0.1:4179' });
  await expect.poll(() => requests).toBe(1);
  const oldRequest = page.waitForEvent('requestfailed', { predicate: (request) => request.url().includes('/workspace') });
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await page.getByRole('button', { name: 'Creator A', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await configure(page, next);
  await expect.poll(async () => (await reads(page)).filter((read) => read.settled).length).toBe(2);
  await oldRequest;
  releaseOld();
  await oldHandlerDone;
  // Drain the browser's promise handlers and React commits, not just the route gate.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect((await reads(page)).map((read) => read.code)).toEqual(['cancelled', 'ok']);
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Script', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveText('Workspace revision 2');
  await expect(page.getByRole('tabpanel')).not.toContainText('Workspace revision 1');
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await page.getByRole('button', { name: next.session.name, exact: true }).click();
  await configure(page, { session: null });
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('tabpanel')).not.toContainText('Workspace revision');
  await configure(page, next);
  await expect.poll(async () => (await reads(page)).filter((read) => read.settled).length).toBe(3);
  await expect(page.getByRole('tabpanel')).toHaveText('Workspace revision 2');
});

for (const failure of ['unauthenticated', 'not_implemented', 'transport_failure', 'timed_out', 'forbidden'] as const) test(`workspace ${failure} never reuses native-load presentation`, async ({ page }) => {
  await page.goto('/shell.html');
  await page.route('**/v1/conversations/*/workspace', async (route) => {
    if (failure === 'transport_failure') await route.abort();
    else if (failure !== 'timed_out') await route.fulfill({ status: failure === 'unauthenticated' ? 401 : failure === 'forbidden' ? 403 : 501, json: { error: { code: failure, message: 'Controlled workspace read failure' } } });
  });
  await configure(page, { apiOrigin: 'http://127.0.0.1:4179', timeoutMs: 100, session: { accountId: 'account-a', name: 'Creator A' }, conversationId: 'conversation-a' });
  await expect.poll(async () => (await reads(page))[0]?.settled).toBe(true);
  expect((await reads(page))[0]?.code).toBe(failure);
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('main')).not.toContainText('Conversation loading is not available yet.');
  const expected = failure === 'unauthenticated' ? 'Sign-in required to load this video.' : failure === 'not_implemented' ? 'Loading this video is not available yet.' : 'This video could not be loaded. Nothing was changed.';
  await expect(page.getByRole('tabpanel')).toHaveText(expected);
  await expect(page.getByRole('tabpanel').locator('.wp-empty')).toHaveText(expected);
  await page.getByRole('tab', { name: 'Assets', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toHaveText(expected);
});

test('workspace loading uses the approved skeleton until the read settles', async ({ page }) => {
  await page.goto('/shell.html');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = false;
  await page.route('**/v1/conversations/*/workspace', async (route) => { started = true; await gate; await route.fulfill({ json: emptyWorkspace(2) }); });
  await configure(page, { apiOrigin: 'http://127.0.0.1:4179', session: { accountId: 'account-a', name: 'Creator A' }, conversationId: 'conversation-a' });
  await expect.poll(() => started).toBe(true);
  const skeleton = page.getByRole('progressbar', { name: 'Loading video' });
  await expect(skeleton).toBeVisible();
  await expect(skeleton.locator('i')).toHaveCount(7);
  expect(await skeleton.locator('i').first().evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await skeleton.locator('i').first().evaluate((node) => getComputedStyle(node).animationDuration)).toBe('1.2s');
  release();
  await expect.poll(async () => (await reads(page))[0]?.settled).toBe(true);
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByRole('tabpanel')).toHaveText('Workspace revision 2');
});

for (const absent of ['session', 'conversation'] as const) test(`absent ${absent} retains approved empty tabs without a workspace read`, async ({ page }) => {
  await page.goto('/shell.html');
  let requests = 0;
  await page.route('**/v1/**', async (route) => { requests++; await route.abort(); });
  await configure(page, { apiOrigin: 'http://127.0.0.1:4179', ...(absent === 'session' ? { session: null, conversationId: 'conversation-a' } : { session: { accountId: 'account-a', name: 'Creator A' } }) });
  for (const [tab, empty] of [['Script', 'Your script will appear here once you describe your video.'], ['Assets', 'Characters, places and props will appear here.'], ['Storyboard', 'The storyboard is planned once the script is agreed.'], ['Videos', 'No videos yet.']]) {
    await page.getByRole('tab', { name: tab!, exact: true }).click();
    await expect(page.getByRole('tabpanel')).toHaveText(empty!);
  }
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(requests).toBe(0);
  expect(await reads(page)).toHaveLength(0);
  expect(await page.evaluate(() => (window as unknown as { shellTest: { tokenCalls(): number } }).shellTest.tokenCalls())).toBe(0);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});
