import type { Page } from '@playwright/test';
import { test, expect } from '../material-network.js';
import { fixture } from '../account-fixture.js';
import { allowHistory, allowList, enter, holdRealResponse, observeNavigation, settledFrames } from '../navigation-fixture.js';

/** The welcome heading and composer form one group centred in the main column (not across the sidebar). */
async function expectCentredOpening(page: Page) {
  const main = page.locator('main.wp-main');
  await expect(main).toHaveAttribute('data-layout', 'opening');
  const [area, welcome, composer] = await Promise.all([main.boundingBox(), page.locator('.wp-welcome').boundingBox(), page.locator('.wp-opening-composer').boundingBox()]);
  const top = welcome!.y, bottom = composer!.y + composer!.height;
  expect(Math.abs((top + bottom) / 2 - (area!.y + area!.height / 2))).toBeLessThan(32);
  expect(Math.abs(composer!.x + composer!.width / 2 - (area!.x + area!.width / 2))).toBeLessThan(2);
}

// This first case is driven against the unchanged serving/browser implementation for a functional red.
test('New video is client-only: it returns to the centred opening without creating a conversation', async ({ page, materialNetwork }) => {
  test.setTimeout(120000);
  const f = await fixture(page, true, {}, 'built');
  try {
    const user = await f.auth.createAccount();
    const saved = await f.application!.saveNative(user.id, [{ role: 'user', text: 'Existing saved text' }], 'Existing video');
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id);
    await enter(page, materialNetwork, f, user, saved.id);
    await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Existing saved text');
    await expect(page.locator('main.wp-main')).toHaveAttribute('data-layout', 'thread');
    const snapshot = await f.application!.snapshot();
    await page.getByRole('button', { name: 'New video', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'What would you like to make?', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.has('conversation')).toBe(false);
    await expectCentredOpening(page);
    await page.setViewportSize({ width: 390, height: 560 });
    await page.getByRole('textbox', { name: 'Message', exact: true }).focus(); await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Do not send native work');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Sending messages is not available yet. Your message is kept.', { exact: true })).toBeVisible();
    expect(materialNetwork.entries.filter(entry => entry.method === 'POST' && entry.url.pathname.startsWith('/memory/'))).toEqual([]);
    expect(await f.application!.snapshot()).toBe(snapshot);
  } finally { await f.close(); }
});

test('workspace entry reads Recents once and shows placeholders, not empty copy, until real reads settle', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount();
    const saved = await f.application!.saveNative(user.id, [{ role: 'user', text: 'Skeleton restored text' }], 'Skeleton seeded scene');
    await observeNavigation(page);
    // Record from the first document render whether the opening welcome ever appears during restore.
    await page.addInitScript(() => { const w = window as unknown as { welcomeSeen: boolean }; w.welcomeSeen = false; new MutationObserver(() => { if (document.querySelector('.wp-welcome') && location.pathname === '/app') w.welcomeSeen = true; }).observe(document, { childList: true, subtree: true }); });
    // Record when the sidebar placeholder is inserted (space reserved), painted and removed.
    await page.addInitScript(() => { const w = window as unknown as { skeleton: Record<string, number> }; w.skeleton = {}; new MutationObserver(() => { const el = document.querySelector('.wp-sidebar .wp-skeleton-rows'), now = performance.now(); if (el) { w.skeleton.inserted ??= now; if (!el.classList.contains('wp-skeleton-reserved')) w.skeleton.shown ??= now; } else if (w.skeleton.shown !== undefined) w.skeleton.gone ??= now; }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); });
    const list = await holdRealResponse(page, '**/memory/threads?*');
    const history = await holdRealResponse(page, `**/memory/threads/${saved.id}/messages?*`);
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id);
    await enter(page, materialNetwork, f, user, saved.id);
    await list.seen; await history.seen;
    const recents = page.locator('.wp-sidebar .wp-recents'), placeholders = recents.locator('.wp-skeleton-rows');
    await expect(placeholders).toBeVisible(); await expect(placeholders).toHaveAttribute('aria-hidden', 'true');
    await expect(recents).toHaveAttribute('aria-busy', 'true');
    await expect(recents.getByText('No videos yet.', { exact: true })).toHaveCount(0);
    await expect(recents.getByText('Loading Recents…', { exact: true })).toHaveAttribute('role', 'status');
    // Release Recents as soon as the placeholder is painted: it must stay for its minimum rather than flicker away.
    list.release(); await list.done;
    await expect(recents.getByRole('button', { name: 'Skeleton seeded scene', exact: true })).toBeVisible();
    await expect(placeholders).toHaveCount(0); await expect(recents).toHaveAttribute('aria-busy', 'false');
    const timing = await page.evaluate(() => (window as unknown as { skeleton: Record<string, number> }).skeleton);
    expect(timing.shown! - timing.inserted!).toBeGreaterThanOrEqual(240);
    expect(timing.gone! - timing.shown!).toBeGreaterThanOrEqual(440);
    await expect(page.locator('.wp-native-history .wp-skeleton-lines')).toBeVisible();
    const main = page.locator('main.wp-main');
    await expect(main).toHaveAttribute('data-layout', 'thread');
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Draft kept across loading');
    await expect(page.getByRole('heading', { name: 'Untitled video', exact: true })).toHaveCount(0);
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.wp-skeleton-rows, .wp-skeleton-lines'))).toBe(false);
    history.release(); await history.done;
    await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Skeleton restored text');
    await expect(page.locator('.wp-skeleton-lines')).toHaveCount(0);
    await expect(main).toHaveAttribute('data-layout', 'thread');
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Draft kept across loading');
    expect(await page.evaluate(() => (window as unknown as { welcomeSeen: boolean }).welcomeSeen)).toBe(false);
    expect(materialNetwork.entries.filter(entry => entry.method === 'POST' && entry.url.pathname.startsWith('/memory/'))).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { navigationCalls: { started: Record<string, number> } }).navigationCalls.started.listConversations)).toBe(1);
  } finally { await f.close(); }
});

test('real browser traverses more than one page of owned Recents with focus and exact persisted reload', async ({ page, materialNetwork }) => {
  test.setTimeout(180000);
  const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount(), other = await f.auth.createAccount();
    for (let i = 0; i < 6; i++) await f.application!.saveNative(user.id, [{ role: 'user', text: `Seeded exact text ${i}` }], `Saved scene ${i}`);
    await f.application!.saveNative(other.id, [{ role: 'user', text: 'Foreign text never shown' }], 'Other account private title');
    for (let i = 0; i < 8; i++) await f.application!.saveNative(user.id, [{ role: 'user', text: `Later text ${i}` }], `Later scene ${i}`);
    await enter(page, materialNetwork, f, user);
    allowList(materialNetwork, f.application!.apiOrigin, user.id);
    const opener = page.getByRole('button', { name: 'Recents', exact: true }); await opener.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Videos 1–6', { exact: true })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await expect(page.getByText('Other account private title', { exact: true })).not.toBeVisible();
    const quickRows = await page.locator('.wp-sidebar .wp-recent-list').textContent();
    for (const [index, range] of [[1, 'Videos 7–12'], [2, 'Videos 13–14']] as const) {
      allowList(materialNetwork, f.application!.apiOrigin, user.id, index);
      await dialog.getByRole('button', { name: 'Next', exact: true }).focus(); await page.keyboard.press('Enter');
      await expect(dialog.getByText(range, { exact: true })).toBeFocused();
      expect(await page.locator('.wp-sidebar .wp-recent-list').textContent()).toBe(quickRows);
    }
    await expect(dialog.getByText('End of Recents.', { exact: true })).toHaveAttribute('role', 'status');
    await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    allowList(materialNetwork, f.application!.apiOrigin, user.id, 1);
    await dialog.getByRole('button', { name: 'Previous', exact: true }).click(); await expect(dialog.getByText('Videos 7–12', { exact: true })).toBeFocused();
    const name = 'Saved scene 5';
    // Owned row identity is obtained from the real list response, not a fabricated UI success.
    const native = JSON.parse(await f.application!.snapshot()) as { threads: { threads: { id: string; title: string }[] } };
    const id = native.threads.threads.find(thread => thread.title === name)!.id;
    const before = await f.application!.snapshot(); allowHistory(materialNetwork, f.application!.apiOrigin, user.id, id);
    await dialog.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeFocused();
    await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Seeded exact text 5');
    expect(await f.application!.snapshot()).toBe(before);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 1 });
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, id); allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await page.reload(); await expect(page.getByRole('heading', { name, exact: true })).toBeFocused();
    await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Seeded exact text 5');
    expect(await f.application!.snapshot()).toBe(before);
    expect(materialNetwork.entries.filter(entry => entry.method === 'POST' && entry.url.pathname === '/memory/threads')).toHaveLength(0);
  } finally { await f.close(); }
});


test('native selection survives real SDK refresh and reconnect; revoked refresh fences all native presentation', async ({ page, context, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true, { jwtExpirySeconds: 180 });
  try {
    const user = await f.auth.createAccount();
    const saved = await f.application!.saveNative(user.id, [{ role: 'assistant', text: 'Persisted native refresh text' }], 'Refresh scope history');
    await page.clock.install({ time: Date.now() });
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id);
    await enter(page, materialNetwork, f, user, saved.id);
    await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Persisted native refresh text');
    const draft = page.getByRole('textbox', { name: 'Message', exact: true }); await draft.fill('Valid native refresh draft');
    const snapshot = await f.application!.snapshot();
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    const refreshed = page.waitForResponse(response => new URL(response.url()).searchParams.get('grant_type') === 'refresh_token');
    await page.clock.fastForward(60000); expect((await refreshed).status()).toBe(200);
    await expect(draft).toHaveValue('Valid native refresh draft');
    await expect(page.getByRole('heading', { name: saved.title!, exact: true })).toBeVisible();
    allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await page.getByRole('button', { name: 'Recents', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: saved.title!, exact: true })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
    const nativeCalls = materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/')).length;
    await context.setOffline(true); await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online'))); await settledFrames(page);
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/'))).toHaveLength(nativeCalls);
    await expect(draft).toHaveValue('Valid native refresh draft');
    expect((await f.auth.request('admin/users/' + user.id, undefined, f.auth.serviceKey, 'DELETE')).status).toBe(200);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'refresh_token' }, count: 1 });
    const rejected = page.waitForResponse(response => new URL(response.url()).searchParams.get('grant_type') === 'refresh_token');
    await page.clock.fastForward(30000); expect((await rejected).status()).toBeGreaterThanOrEqual(400);
    await expect(page.locator('.wp-auth-card')).toContainText('Your session couldn’t be refreshed.');
    await expect(page.getByText('Persisted native refresh text', { exact: true })).not.toBeVisible();
    await expect(page.getByText(saved.title!, { exact: true })).not.toBeVisible();
    expect(new URL(page.url()).searchParams.get('conversation')).toBeNull();
    await page.keyboard.press('Escape'); await expect(draft).toHaveCount(0);
    expect(materialNetwork.entries.filter(entry => entry.url.pathname.startsWith('/memory/'))).toHaveLength(nativeCalls);
    expect(await f.application!.snapshot()).toBe(snapshot);
  } finally { await f.close(); }
});

test('real Recents long labels, keyboard dismissal, 200% reflow and reduced motion at main widths', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true);
  try {
    const user = await f.auth.createAccount(); const title = 'A full accessible conversation title ' + 'long_unbroken_title_'.repeat(12);
    await f.application!.saveNative(user.id, [], title); await enter(page, materialNetwork, f, user);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [1440, 390, 820, 821]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      allowList(materialNetwork, f.application!.apiOrigin, user.id);
      const opener = page.getByRole('button', { name: width <= 820 ? 'Menu' : 'Recents', exact: true });
      await opener.focus(); await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Videos 1–1', { exact: true })).toBeFocused();
      const row = dialog.getByRole('button', { name: title, exact: true }); await expect(row).toBeVisible();
      expect((await row.boundingBox())!.height).toBeGreaterThan(40);
      await expect(dialog.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
      await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
      if (width > 820) expect(await page.locator('.wp-sidebar .wp-recent-row > span').evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
      // CSS zoom does not update media queries. At desktop edges, qualify the
      // effective half-width viewport instead; CSS zoom at 390 also checks scaling.
      if (width === 390) await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      else await page.setViewportSize({ width: Math.floor(width / 2), height: 900 });
      const geometry = await dialog.evaluate(node => {
        const r = node.getBoundingClientRect(), modal = node.closest('.wp-modal')!.getBoundingClientRect();
        return { contained: r.left >= 0 && r.right <= innerWidth, noOverflow: node.scrollWidth <= node.clientWidth, viewport: innerWidth, x: r.x, right: r.right, client: node.clientWidth, scroll: node.scrollWidth, modal: { x: modal.x, width: modal.width }, overflowing: [...node.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > r.right + 1).map(child => ({ tag: child.tagName, className: child.getAttribute('class'), width: child.getBoundingClientRect().width })) };
      });
      expect(geometry, `200% native dialog reflow at ${width}: ${JSON.stringify(geometry)}`).toMatchObject({ contained: true, noOverflow: true });
      const documentGeometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll('*')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).map(node => ({ tag: node.tagName, className: node.getAttribute('class'), right: node.getBoundingClientRect().right })).slice(0, 20) }));
      expect(documentGeometry.scroll, `200% document reflow at ${width}: ${JSON.stringify(documentGeometry)}`).toBeLessThanOrEqual(documentGeometry.width);
      await page.evaluate(() => { document.documentElement.style.zoom = ''; });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(opener).toBeFocused();
    }
    expect(materialNetwork.entries.filter(entry => entry.method === 'POST' && entry.url.pathname.startsWith('/memory/'))).toEqual([]);
  } finally { await f.close(); }
});
