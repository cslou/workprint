import type { Page } from '@playwright/test';
import { test, expect } from '../material-network.js';
import { account, fixture, privateForward, privateFulfill, signIn } from '../account-fixture.js';
import { allowHistory, allowList, allowSignIn, enter, navigationSettled, observeNavigation, settledFrames } from '../navigation-fixture.js';

async function holdRealResponse(page: Page, pattern: string) {
  let release!: () => void, observed!: (status: number) => void, finished!: () => void;
  let held = false, released = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const seen = new Promise<number>(resolve => { observed = resolve; });
  const done = new Promise<void>(resolve => { finished = resolve; });
  await page.route(pattern, async route => {
    try {
      const response = await privateForward(route); await response.body();
      held = true; observed(response.status()); await gate;
      await privateFulfill(route, { response });
    } finally { held = false; finished(); }
  });
  return { seen, done, held: () => held && !released, release() { released = true; release(); } };
}

test('a real late committed create cannot steal a newer conversation or its draft', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true); let held: Awaited<ReturnType<typeof holdRealResponse>> | undefined;
  try {
    const user = await f.auth.createAccount(); const saved = await f.application!.saveNative(user.id, [{ role: 'user', text: 'Existing saved history' }], 'Existing conversation');
    await observeNavigation(page); await enter(page, materialNetwork, f, user);
    held = await holdRealResponse(page, '**/memory/threads');
    materialNetwork.expectOperations({ origin: f.application!.apiOrigin, method: 'POST', path: '/memory/threads', query: {}, count: 1 });
    await page.getByRole('button', { name: 'New video', exact: true }).click(); expect(await held.seen).toBe(200);
    await expect(page.getByRole('dialog')).toContainText('Creating a new video…');
    const snapshot = await f.application!.snapshot();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    allowList(materialNetwork, f.application!.apiOrigin, user.id); await page.getByRole('button', { name: 'Recents', exact: true }).click();
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id); await page.getByRole('dialog').getByRole('button', { name: saved.title!, exact: true }).click();
    await expect(page.getByRole('heading', { name: saved.title!, exact: true })).toBeFocused();
    const draft = page.getByRole('textbox', { name: 'Message', exact: true }); await draft.fill('Newer conversation draft');
    expect(held.held()).toBe(true); await expect(draft).toHaveValue('Newer conversation draft'); expect(new URL(page.url()).searchParams.get('conversation')).toBe(saved.id);
    held.release(); await held.done; await expect.poll(() => navigationSettled(page, 'createConversation')).toBe(1); await settledFrames(page);
    await expect(page.getByRole('heading', { name: saved.title!, exact: true })).toBeVisible(); await expect(draft).toHaveValue('Newer conversation draft');
    expect(await f.application!.snapshot()).toBe(snapshot); expect(new URL(page.url()).searchParams.get('conversation')).toBe(saved.id);
  } finally { held?.release(); await f.close(); }
});

for (const operation of ['create', 'list', 'history'] as const) test(`a held real owned ${operation} cannot cross a standard account switch`, async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true); let held: Awaited<ReturnType<typeof holdRealResponse>> | undefined;
  try {
    const first = await f.auth.createAccount(), second = await f.auth.createAccount();
    const old = await f.application!.saveNative(first.id, [{ role: 'user', text: 'Old account private text' }], 'Old account private title');
    await observeNavigation(page);
    held = await holdRealResponse(page, operation === 'create' ? '**/memory/threads' : operation === 'list' ? '**/memory/threads?*' : `**/memory/threads/${old.id}/messages?*`);
    if (operation === 'history') allowHistory(materialNetwork, f.application!.apiOrigin, first.id, old.id, 1, false);
    await enter(page, materialNetwork, f, first, operation === 'history' ? old.id : undefined);
    if (operation === 'create') materialNetwork.expectOperations({ origin: f.application!.apiOrigin, method: 'POST', path: '/memory/threads', query: {}, count: 1 });
    if (operation === 'list') allowList(materialNetwork, f.application!.apiOrigin, first.id);
    if (operation !== 'history') await page.getByRole('button', { name: operation === 'create' ? 'New video' : 'Recents', exact: true }).click();
    expect(await held.seen).toBe(200); const saved = await f.application!.snapshot();
    if (operation !== 'history') await page.getByRole('button', { name: 'Close', exact: true }).click();
    await account(page, first.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Switch account', exact: true }).click(); allowSignIn(materialNetwork, f.auth.url); await signIn(page, second.email, second.password);
    await expect(page.getByRole('dialog')).not.toBeVisible(); const draft = page.getByRole('textbox', { name: 'Message', exact: true }); await draft.fill('New account draft');
    expect(held.held()).toBe(true); await expect(page.getByRole('button', { name: second.email, exact: true })).toBeVisible(); await expect(page.getByText('Old account private title', { exact: true })).not.toBeVisible();
    held.release(); await held.done; await expect.poll(() => navigationSettled(page, operation === 'create' ? 'createConversation' : operation === 'list' ? 'listConversations' : 'loadMessages')).toBe(1); await settledFrames(page);
    await expect(draft).toHaveValue('New account draft'); await expect(page.getByText('Old account private title', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Old account private text', { exact: true })).not.toBeVisible();
    expect(await f.application!.snapshot()).toBe(saved);
    expect(new URL(page.url()).searchParams.get('conversation')).toBeNull();
  } finally { held?.release(); await f.close(); }
});

for (const outcome of ['success', 'foreign-failure'] as const) test(`late real history ${outcome} cannot overwrite newer selected native history`, async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true); let held: Awaited<ReturnType<typeof holdRealResponse>> | undefined;
  try {
    const user = await f.auth.createAccount(), other = await f.auth.createAccount();
    const old = await f.application!.saveNative(outcome === 'success' ? user.id : other.id, [{ role: 'assistant', text: 'Old response must not return' }], 'Old history');
    const newer = await f.application!.saveNative(user.id, [{ role: 'user', text: 'Newer native text is exact' }], 'Newer history');
    await observeNavigation(page); held = await holdRealResponse(page, `**/memory/threads/${old.id}/messages?*`);
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, old.id, 1, false); await enter(page, materialNetwork, f, user, old.id);
    expect(await held.seen).toBe(outcome === 'success' ? 200 : 404);
    allowList(materialNetwork, f.application!.apiOrigin, user.id); await page.getByRole('button', { name: 'Recents', exact: true }).click();
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, newer.id); await page.getByRole('dialog').getByRole('button', { name: newer.title!, exact: true }).click();
    await expect(page.getByRole('heading', { name: newer.title!, exact: true })).toBeFocused();
    const draft = page.getByRole('textbox', { name: 'Message', exact: true }); await draft.fill('Keep newer selected draft');
    const snapshot = await f.application!.snapshot(); expect(held.held()).toBe(true); await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Newer native text is exact');
    held.release(); await held.done; await expect.poll(() => navigationSettled(page, 'loadMessages')).toBe(2); await settledFrames(page);
    await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Newer native text is exact'); await expect(draft).toHaveValue('Keep newer selected draft');
    await expect(page.getByText('Old response must not return', { exact: true })).not.toBeVisible(); expect(await f.application!.snapshot()).toBe(snapshot);
    expect(new URL(page.url()).searchParams.get('conversation')).toBe(newer.id);
  } finally { held?.release(); await f.close(); }
});
