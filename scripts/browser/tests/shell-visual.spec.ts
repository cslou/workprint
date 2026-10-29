import { browserOrigin } from '../origin.js';
import { expect, test } from '@playwright/test';
import { compare } from '../compare.js';
import { settleCapture } from '../capture.js';
import { writeFile } from 'node:fs/promises';

// Independent approved substitutions into the tracked opening/dialog references.
// Never import component markup, production shell CSS or ignored proposal files.
const states = ['opening', 'assets', 'storyboard', 'videos', 'library', 'signed-out', 'signed-in', 'account-unavailable', 'navigation', 'new', 'recents', 'load', 'read-unauthenticated', 'read-unavailable', 'read-error'] as const;
const workspaceCopy = { 'read-unauthenticated': 'Sign-in required to load this video.', 'read-unavailable': 'Loading this video is not available yet.', 'read-error': 'This video could not be loaded. Nothing was changed.' };
for (const width of [1440, 390, 820, 821]) for (const state of states) {
  if ((state === 'navigation' && width > 820) || (state.startsWith('read-') && width !== 1440 && width !== 390)) continue;
  test(`shell ${state} approved reference at ${width}`, async ({ page, context }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await context.route('**/*', async (route) => { if (new URL(route.request().url()).origin !== browserOrigin) throw new Error('Unauthorized visual egress'); await route.continue(); });
    await page.goto('/references/flow2-step1-r73.html');
    await page.addStyleTag({ content: ':root{--font-sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--font-display:Georgia,"Times New Roman",serif}b,strong{font-weight:600}.approved-menu{display:none}.approved-rows{display:grid;gap:12px;color:var(--fg-muted);font-size:13px}.approved-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.approved-nav{display:flex;flex-direction:column;align-items:stretch;gap:4px}.approved-nav .navitem{display:flex!important}@media(max-width:820px){.approved-menu{display:block}}' });
    await page.evaluate(({ state }) => {
      const signed = state === 'signed-in' || state === 'account-unavailable' || state.startsWith('read-');
      if (state === 'load' || state.startsWith('read-')) document.querySelector('.empty-note')!.insertAdjacentHTML('afterend', '<span class="navitem">Open conversation</span>');
      const account = document.querySelector('.account')!;
      account.innerHTML = `<span class="avatar">${signed ? 'C' : ''}</span>${signed ? 'Creator A' : 'Account'}`;
      document.querySelector('.navlist')!.insertAdjacentHTML('beforeend', '<button class="choice approved-menu" type="button">Menu</button>');
      if (state === 'read-unauthenticated' || state === 'read-unavailable' || state === 'read-error') {
        const copy = { 'read-unauthenticated': 'Sign-in required to load this video.', 'read-unavailable': 'Loading this video is not available yet.', 'read-error': 'This video could not be loaded. Nothing was changed.' };
        document.querySelector('#p-script .pempty')!.textContent = copy[state];
        return;
      }
      if (state === 'opening' || state === 'assets' || state === 'storyboard' || state === 'videos') { if (state !== 'opening') location.hash = state === 'videos' ? 'p-takes' : `p-${state}`; return; }
      const copy = { new: ['New video', 'New video is not available yet.', 'No conversation was created.'], recents: ['Recents', 'Recents are not available yet.', 'No conversation list was loaded.'], load: ['Open conversation', 'Conversation loading is not available yet.', 'The current workspace is unchanged.'] };
      let title = 'Account', body = '';
      if (state === 'library') { title = 'Library'; body = '<div class="lp-empty"><b>Library connection not configured</b><span>No API origin is configured for this build.</span></div>'; }
      if (state === 'signed-out') body = '<div class="approved-rows"><p><b>Not signed in</b></p><p>Sign-in is not available yet.</p><div style="margin-top:4px"><button class="choose" disabled>Sign in</button></div></div>';
      if (state === 'signed-in') body = '<div class="approved-rows"><p><b>Creator A</b></p></div><div class="approved-actions"><button class="choice">Sign out</button><button class="choice">Switch account</button></div>';
      if (state === 'account-unavailable') body = '<p style="font-size:13px;color:var(--fg-muted)">Account actions are not available yet. Nothing about your session has changed.</p>';
      if (state === 'navigation') { title = 'Navigation'; body = '<div class="approved-nav"><span class="navitem current">New video</span><span class="navitem">Library</span><span class="navitem">Recents</span><p class="empty-note">No videos yet.</p><span class="navitem">Account</span></div>'; }
      if (state === 'new' || state === 'recents' || state === 'load') { const value = copy[state]; title = value[0]!; body = `<div class="approved-rows"><p>${value[1]}</p><p>${value[2]}</p></div>`; }
      document.body.insertAdjacentHTML('beforeend', `<div class="lightbox" style="display:flex"><div class="lb-panel"><div class="lb-head"><h2>${title}</h2><span class="qclose">×</span></div>${body}</div></div>`);
    }, { state });
    await settleCapture(page);
    const reference = await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
    await page.goto('/shell.html');
    await page.waitForFunction(() => !!(window as unknown as { shellTest?: unknown }).shellTest);
    await page.route('**/v1/conversations/*/workspace', async (route) => {
      if (state === 'read-error') await route.abort();
      else await route.fulfill({ status: state === 'read-unauthenticated' ? 401 : 501, json: { error: { code: state === 'read-unauthenticated' ? 'unauthenticated' : 'not_implemented', message: 'Controlled visual prerequisite' } } });
    });
    await page.evaluate(({ signed, workspace }) => (window as unknown as { shellTest: { configure(value: unknown): void } }).shellTest.configure({ session: signed ? { accountId: 'visual-account', name: 'Creator A' } : null, ...(workspace ? { apiOrigin: window.location.origin, conversationId: 'visual-conversation' } : {}) }), { signed: state === 'signed-in' || state === 'account-unavailable' || state.startsWith('read-'), workspace: state.startsWith('read-') });
    if (state === 'read-unauthenticated' || state === 'read-unavailable' || state === 'read-error') {
      await expect(page.getByRole('tabpanel')).toHaveText(workspaceCopy[state]);
    } else if (state === 'assets' || state === 'storyboard' || state === 'videos') {
      await page.getByRole('tab', { name: state === 'assets' ? 'Assets' : state === 'storyboard' ? 'Storyboard' : 'Videos', exact: true }).click();
    } else if (state !== 'opening') {
      if (width <= 820) await page.getByRole('button', { name: 'Menu', exact: true }).click();
      if (state === 'signed-in' || state === 'signed-out' || state === 'account-unavailable') {
        await page.getByRole('button', { name: state === 'signed-out' ? 'Account' : 'Creator A', exact: true }).click();
        if (state === 'account-unavailable') await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      } else if (state !== 'navigation') {
        if (state === 'load') {
          await page.evaluate(() => (window as unknown as { shellTest: { configure(value: unknown): void } }).shellTest.configure({ session: null, conversationId: 'visual-conversation' }));
          if (width <= 820) await page.getByRole('button', { name: 'Menu', exact: true }).click();
        }
        const owner = width <= 820 ? page.getByRole('dialog') : page;
        await owner.getByRole('button', { name: state === 'new' ? 'New video' : state === 'load' ? 'Open conversation' : state === 'library' ? 'Library' : 'Recents', exact: true }).click();
      }
      await expect(page.getByRole('dialog')).toBeVisible();
    } else await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settleCapture(page);
    const actual = await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    const changed = await compare(reference, actual, info.outputPath('comparison'));
    await writeFile(info.outputPath('result.json'), JSON.stringify({ state, width, reference: 'docs/design/flow2-step1-r73.html + flow1-step4-r85.html#look-a dialog geometry', approval: 'docs/design/design.md#shell-and-remaining-phase-2-feedback', revision: info.config.metadata, changedPixels: changed, tolerance: 0 }, null, 2));
    expect(changed).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
