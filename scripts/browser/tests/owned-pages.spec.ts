import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect, type MaterialNetwork } from '../material-network.js';
import { browserOrigin } from '../origin.js';
import type { verifyBuiltAdmission as VerifyBuiltAdmission, BuiltAdmissionTarget } from '../../../apps/api/test/auth-built-fixture.js';
import type { preparePagedSavedWork as PreparePagedSavedWork, PagedSavedWork } from '../../../apps/api/test/paged-saved-work.js';

let target: BuiltAdmissionTarget; let saved: PagedSavedWork;
let release!: () => void; let backend: Promise<void>;
const cleanup: (() => void | Promise<void>)[] = [];
test.beforeAll(async () => {
  test.setTimeout(120000);
  const { verifyBuiltAdmission } = await import(pathToFileURL(resolve('apps/api/.test-build/test/auth-built-fixture.js')).href) as { verifyBuiltAdmission: typeof VerifyBuiltAdmission };
  const { preparePagedSavedWork } = await import(pathToFileURL(resolve('apps/api/.test-build/test/paged-saved-work.js')).href) as { preparePagedSavedWork: typeof PreparePagedSavedWork };
  const gate = new Promise<void>(resolve => { release = resolve; });
  let ready!: () => void; let fail!: (error: unknown) => void;
  const available = new Promise<void>((resolve, reject) => { ready = resolve; fail = reject; });
  backend = verifyBuiltAdmission({ diagnostic() {}, after(fn) { cleanup.push(fn); } }, async value => { target = value; ready(); await gate; }, { browserOrigin, prepareSavedWork: async setup => { saved = await preparePagedSavedWork(setup); } });
  void backend.catch(fail); await available;
});
test.afterAll(async () => { try { release?.(); await backend; } finally { for (const fn of cleanup.reverse()) await fn(); } });
const historyPath = () => `/v1/artifacts/${saved.current.artifactId}/versions`;
function allow(network: MaterialNetwork, path: string, query: Record<string, string> = {}, count = 1) { network.expectOperations({ origin: target.origin, method: 'GET', path, query, count }); }
async function configure(page: Page, network: MaterialNetwork, account: 'a' | 'b' = 'a', empty = false) {
  const conversationId = account === 'b' ? saved.emptyB : empty ? saved.emptyA : saved.conversationA;
  allow(network, `/v1/conversations/${conversationId}/workspace`);
  if (account === 'a' && !empty) {
    allow(network, `/v1/versions/${saved.current.id}`);
    allow(network, `/v1/conversations/${conversationId}/generation-requests`);
  }
  const response = page.waitForResponse(response => new URL(response.url()).pathname === `/v1/conversations/${conversationId}/workspace`);
  await page.evaluate(input => (window as unknown as { savedWorkTest: { configure(input: unknown): void } }).savedWorkTest.configure(input), { apiOrigin: target.origin, token: target.accessTokens[account === 'a' ? 0 : 1]!, accountId: account === 'a' ? saved.accountA : saved.accountB, conversationId });
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
}
async function open(page: Page, network: MaterialNetwork) {
  await page.goto('/saved-work.html');
  await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
  await configure(page, network);
  await expect(page.getByRole('tabpanel')).toContainText('Ada waits beside the station clock.');
}
async function history(page: Page, network: MaterialNetwork) {
  allow(network, historyPath());
  const response = page.waitForResponse(response => new URL(response.url()).pathname === historyPath());
  await page.locator('.wp-version-history summary').click();
  const result = await (await response).json() as { nextCursor: string | null };
  if (!result.nextCursor) throw new Error('Stored history must have a real next page');
  await expect(page.locator('.wp-version-history-row')).toHaveCount(19);
  return result.nextCursor;
}

test('stored history has keyboard next-page access, exact read-only content and terminal focus', async ({ page, materialNetwork }) => {
  await open(page, materialNetwork);
  const cursor = await history(page, materialNetwork);
  await expect(page.getByRole('button', { name: 'View version 1', exact: true })).toHaveCount(0);
  allow(materialNetwork, historyPath(), { cursor });
  await page.getByRole('button', { name: 'Load earlier versions', exact: true }).press('Enter');
  await expect(page.locator('.wp-version-history-row')).toHaveCount(22);
  await expect(page.getByRole('button', { name: 'View version 3', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Load earlier versions', exact: true })).toHaveCount(0);
  allow(materialNetwork, `/v1/versions/${saved.versions[0]!.id}`);
  await page.getByRole('button', { name: 'View version 1', exact: true }).press('Enter');
  await expect(page.getByRole('tabpanel')).toContainText('Earlier Script revision 1.');
  await expect(page.getByText('Viewing version 1', { exact: true })).toBeVisible();
  allow(materialNetwork, `/v1/versions/${saved.current.id}`);
  await page.getByRole('button', { name: 'Back to current version', exact: true }).press('Enter');
  await expect(page.getByRole('tabpanel')).toContainText('Ada waits beside the station clock.');
});

test('Library next-page controls follow the scrolling grid, preserve the tray and focus newly loaded work', async ({ page, materialNetwork }) => {
  await open(page, materialNetwork);
  allow(materialNetwork, '/v1/library');
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/library');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  const first = await (await response).json() as { nextCursor: string | null };
  if (!first.nextCursor) throw new Error('Stored Library must have a real next page');
  await expect(page.locator('.wp-picker-tile')).toHaveCount(20);
  await expect(page.locator('.wp-picker-body').getByRole('button', { name: 'Load more', exact: true })).toBeVisible();
  let rejectPage = true;
  let releaseMore!: () => void; let held!: () => void;
  const gate = new Promise<void>(resolve => { releaseMore = resolve; });
  const available = new Promise<void>(resolve => { held = resolve; });
  await page.route(url => url.pathname === '/v1/library' && url.searchParams.has('cursor'), async route => {
    if (!rejectPage) { await route.continue(); return; }
    rejectPage = false; held(); await gate; await route.abort('failed');
  });
  allow(materialNetwork, '/v1/library', { cursor: first.nextCursor }, 2);
  try {
    await page.getByRole('button', { name: 'Load more', exact: true }).press('Enter');
    await available;
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('Loading more Library items…');
    await expect(page.locator('.wp-picker-tile')).toHaveCount(20);
  } finally { releaseMore(); }
  await expect(page.getByRole('status')).toHaveText('More Library items could not be loaded. The items already shown are unchanged.');
  await expect(page.locator('.wp-picker-tile')).toHaveCount(20);
  const nextResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/library' && new URL(response.url()).searchParams.has('cursor'));
  await page.getByRole('button', { name: 'Load more', exact: true }).press('Enter');
  const next = await (await nextResponse).json() as { items: { id: string }[] };
  await expect(page.locator('.wp-picker-tile')).toHaveCount(24);
  await expect(page.locator(`.wp-picker-tile[data-page-id="${next.items[0]!.id}"]`)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
  await expect(page.locator('.wp-picker-tray')).toContainText('Nothing selected yet');
  expect((await page.locator('.wp-picker-tile').allTextContents()).every(text => !/\b(Ready|Draft)\b/.test(text))).toBe(true);
});

test('initial history failures settle with explicit retry rather than empty history', async ({ page, materialNetwork }) => {
  await open(page, materialNetwork);
  let first = true;
  await page.route(url => url.pathname === historyPath(), async route => { if (first) { first = false; await route.abort('failed'); } else await route.continue(); });
  allow(materialNetwork, historyPath(), {}, 2);
  await page.locator('.wp-version-history summary').click();
  await expect(page.getByRole('status')).toHaveText('Version history could not be loaded.');
  await page.getByRole('button', { name: 'Load version history', exact: true }).press('Enter');
  await expect(page.locator('.wp-version-history-row')).toHaveCount(19);
  await expect(page.getByRole('tabpanel')).toContainText('Ada waits beside the station clock.');
});

test('next history failure keeps loaded rows and permits exactly one explicit retry', async ({ page, materialNetwork }) => {
  await open(page, materialNetwork);
  const cursor = await history(page, materialNetwork);
  let first = true;
  await page.route(url => url.pathname === historyPath() && url.searchParams.has('cursor'), async route => { if (first) { first = false; await route.abort('failed'); } else await route.continue(); });
  allow(materialNetwork, historyPath(), { cursor }, 2);
  await page.getByRole('button', { name: 'Load earlier versions', exact: true }).press('Enter');
  await expect(page.getByRole('status')).toHaveText('Earlier versions could not be loaded. The versions already shown are unchanged.');
  await expect(page.locator('.wp-version-history-row')).toHaveCount(19);
  await page.getByRole('button', { name: 'Load earlier versions', exact: true }).press('Enter');
  await expect(page.locator('.wp-version-history-row')).toHaveCount(22);
});

for (const account of ['a', 'b'] as const) test(`late history pages never populate a new ${account === 'a' ? 'conversation' : 'account'} scope`, async ({ page, materialNetwork }) => {
  await open(page, materialNetwork);
  const cursor = await history(page, materialNetwork);
  let releasePage!: () => void; let held!: () => void;
  const gate = new Promise<void>(resolve => { releasePage = resolve; });
  const available = new Promise<void>(resolve => { held = resolve; });
  await page.route(url => url.pathname === historyPath() && url.searchParams.has('cursor'), async route => {
    const response = await route.fetch(); held(); await gate;
    await route.fulfill({ response });
  });
  allow(materialNetwork, historyPath(), { cursor });
  try {
    await page.getByRole('button', { name: 'Load earlier versions', exact: true }).press('Enter');
    await available;
    await expect(page.getByRole('button', { name: 'Load earlier versions', exact: true })).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('Loading earlier versions…');
    await configure(page, materialNetwork, account, true);
    releasePage();
    await expect(page.getByRole('tabpanel')).toHaveText('Your script will appear here once you describe your video.');
    await expect(page.locator('.wp-version-history-row')).toHaveCount(0);
  } finally { releasePage(); }
});

test('an account without records receives the honest Library empty state', async ({ page, materialNetwork }) => {
  await page.goto('/saved-work.html');
  await page.waitForFunction(() => !!(window as unknown as { savedWorkTest?: unknown }).savedWorkTest);
  await configure(page, materialNetwork, 'b', true);
  allow(materialNetwork, '/v1/library');
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Nothing saved yet');
  await expect(page.getByRole('dialog')).toContainText('Your saved work will appear here.');
});
