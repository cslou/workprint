import { test, expect } from '../material-network.js';
import { account, fixture } from '../account-fixture.js';
import { allowHistory, allowList, enter, holdRealResponse, navigationSettled, observeNavigation, settledFrames } from '../navigation-fixture.js';

test('narrow Menu dismisses on current-conversation activation and restores history focus without resetting its draft', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(page, true); let held: Awaited<ReturnType<typeof holdRealResponse>> | undefined;
  try {
    const user = await f.auth.createAccount(); const saved = await f.application!.saveNative(user.id, [{ role: 'user', text: 'Current persisted message' }], 'Current owned history');
    await observeNavigation(page); allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id);
    await enter(page, materialNetwork, f, user, saved.id);
    const heading = page.getByRole('heading', { name: saved.title!, exact: true }); await expect(heading).toBeFocused();
    const draft = page.getByRole('textbox', { name: 'Message', exact: true }); await draft.fill('Keep this same-conversation draft');
    const snapshot = await f.application!.snapshot();
    allowList(materialNetwork, f.application!.apiOrigin, user.id);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const dialog = page.getByRole('dialog'); const row = dialog.getByRole('button', { name: saved.title!, exact: true });
    await expect(row).toHaveAttribute('aria-current', 'page');
    held = await holdRealResponse(page, `**/memory/threads/${saved.id}/messages?*`);
    allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id, 1, false);
    await row.focus(); await page.keyboard.press('Enter'); expect(await held.seen).toBe(200);
    expect(held.held()).toBe(true); await expect(dialog).not.toBeVisible();
    held.release(); await held.done; await expect.poll(() => navigationSettled(page, 'loadMessages')).toBe(2); await settledFrames(page);
    await expect(dialog).not.toBeVisible(); await expect(heading).toBeFocused();
    await expect(draft).toHaveValue('Keep this same-conversation draft');
    await expect(page.getByRole('list', { name: 'Saved messages' })).toHaveText('Current persisted message');
    expect(new URL(page.url()).searchParams.get('conversation')).toBe(saved.id);
    expect(await f.application!.snapshot()).toBe(snapshot);
  } finally { held?.release(); await f.close(); }
});

for (const width of [1440, 390]) for (const interaction of ['scroll', 'scroll-return', 'resize-return'] as const) test(`earlier history preserves the live ${interaction} anchor while a real response is pending at ${width}`, async ({ page, materialNetwork }) => {
  test.setTimeout(120000); await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const f = await fixture(page, true); let held: Awaited<ReturnType<typeof holdRealResponse>> | undefined;
  try {
    const user = await f.auth.createAccount(); const text = (index: number) => `Exact message ${index}: ${'saved words '.repeat(25)}`;
    const saved = await f.application!.saveNative(user.id, Array.from({ length: 45 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, text: text(index) })), 'Live history anchor');
    const expected = await f.application!.readNative(user.id, saved.id); const snapshot = await f.application!.snapshot();
    await observeNavigation(page); allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id);
    await enter(page, materialNetwork, f, user, saved.id);
    const heading = page.getByRole('heading', { name: saved.title!, exact: true }); await expect(heading).toBeFocused();
    const messages = page.getByRole('list', { name: 'Saved messages' }); await expect(messages.locator('li')).toHaveCount(20);
    held = await holdRealResponse(page, `**/memory/threads/${saved.id}/messages?*`);
    materialNetwork.expectOperations({ origin: f.application!.apiOrigin, method: 'GET', path: `/memory/threads/${saved.id}/messages`, query: { resourceId: user.id, page: '1', perPage: '20' }, count: 1 });
    await page.getByRole('button', { name: 'Load earlier messages', exact: true }).click(); expect(await held.seen).toBe(200);
    await expect(page.getByText('Loading earlier messages…', { exact: true })).toBeVisible();
    const position = () => page.evaluate(() => innerWidth <= 820 ? scrollY : document.querySelector('.wp-native-history')!.scrollTop);
    const initialPosition = await position();
    if (interaction === 'resize-return') {
      const height = width === 390 ? 844 : 900;
      await page.setViewportSize({ width: width + 80, height }); await settledFrames(page);
      expect(await page.evaluate(() => innerWidth)).toBe(width + 80);
      await page.setViewportSize({ width, height }); await settledFrames(page);
      expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual({ width, height });
      await expect.poll(position).toBe(initialPosition);
    } else {
      const bounds = (await page.locator('.wp-native-history').boundingBox())!;
      await page.mouse.move(bounds.x + 100, Math.max(100, bounds.y + 150)); await page.mouse.wheel(0, 320);
      await expect.poll(position).toBeGreaterThan(initialPosition + 200); await settledFrames(page);
      if (interaction === 'scroll-return') {
        await page.mouse.wheel(0, -320); await expect.poll(position).toBe(initialPosition); await settledFrames(page);
      }
    }
    const anchor = await messages.locator('li').evaluateAll(nodes => {
      const node = nodes.find(node => { const r = node.getBoundingClientRect(); return r.top >= 120 && r.bottom < innerHeight - 80; });
      if (!node) throw new Error('No fully visible saved-message anchor after user scroll');
      return { id: node.getAttribute('data-message-id')!, top: node.getBoundingClientRect().top, text: node.textContent };
    });
    expect(held.held()).toBe(true); await expect(messages.locator('li')).toHaveCount(20); await expect(heading).not.toBeFocused();
    held.release(); await held.done; await expect.poll(() => navigationSettled(page, 'loadMessages')).toBe(2);
    await expect(messages.locator('li')).toHaveCount(40); await settledFrames(page);
    const retained = messages.locator(`[data-message-id="${anchor.id}"]`);
    expect(Math.abs((await retained.boundingBox())!.y - anchor.top)).toBeLessThanOrEqual(1);
    await expect(retained).toHaveText(anchor.text!); await expect(heading).not.toBeFocused();
    expect(await messages.locator('li').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-message-id')))).toEqual(expected.messages.slice(-40).map(message => message.id));
    expect(await messages.locator('li').allTextContents()).toEqual(Array.from({ length: 40 }, (_, index) => text(index + 5)));
    expect(await f.application!.snapshot()).toBe(snapshot);
  } finally { held?.release(); await f.close(); }
});

test('native history retires viewport subscriptions when real sign-out unmounts the history', async ({ page, materialNetwork }) => {
  test.setTimeout(120000); const f = await fixture(page, true);
  try {
    // Observe only public EventTarget registration identity/counts, never events or credentials.
    await page.addInitScript(() => {
      const active = new Map<EventListenerOrEventListenerObject, Map<EventTarget, Set<string>>>();
      const native = new Set<EventListenerOrEventListenerObject>();
      const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        add.call(this, type, listener, options);
        if (!listener || !['scroll', 'resize'].includes(type)) return;
        const targets = active.get(listener) ?? new Map<EventTarget, Set<string>>();
        const keys = targets.get(this) ?? new Set<string>();
        keys.add(`${type}:${typeof options === 'boolean' ? options : !!options?.capture}`);
        targets.set(this, keys); active.set(listener, targets);
        if (this instanceof HTMLElement && this.classList.contains('wp-native-history')) native.add(listener);
      };
      EventTarget.prototype.removeEventListener = function(type, listener, options) {
        remove.call(this, type, listener, options);
        if (listener) active.get(listener)?.get(this)?.delete(`${type}:${typeof options === 'boolean' ? options : !!options?.capture}`);
      };
      (window as unknown as { nativeViewportBindings(): number }).nativeViewportBindings = () => [...native].reduce((sum, listener) => sum + [...(active.get(listener)?.values() ?? [])].reduce((count, keys) => count + keys.size, 0), 0);
    });
    const user = await f.auth.createAccount(); const saved = await f.application!.saveNative(user.id, [{ role: 'user', text: 'Read-only listener lifecycle' }], 'Listener lifecycle');
    const snapshot = await f.application!.snapshot(); allowHistory(materialNetwork, f.application!.apiOrigin, user.id, saved.id);
    await enter(page, materialNetwork, f, user, saved.id);
    await expect(page.getByRole('heading', { name: saved.title!, exact: true })).toBeFocused();
    const bindings = () => page.evaluate(() => (window as unknown as { nativeViewportBindings(): number }).nativeViewportBindings());
    await expect.poll(bindings).toBeGreaterThan(0);
    await account(page, user.email);
    materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/logout', query: { scope: 'local' }, count: 1 });
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: saved.title!, exact: true })).not.toBeVisible();
    await page.keyboard.press('Escape'); await expect.poll(bindings).toBe(0);
    expect(await f.application!.snapshot()).toBe(snapshot);
  } finally { await f.close(); }
});
