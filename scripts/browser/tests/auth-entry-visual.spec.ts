import { test, expect } from '../material-network.js';
import { fixture, origin, signIn } from '../account-fixture.js';
import { capturePairSide, verifyCapturePair } from '../capture-pair.js';
import { entryReference as reference, retainedAccountReference } from '../entry-reference.js';
import { accountExamples } from '../account-examples.js';
import type { AccountPresentation } from '../../../apps/web/src/auth/owner.js';

for (const width of [1440, 390, 820, 821]) for (const surface of ['landing', 'sign-in', 'landing-signed-in'] as const) test(`entry ${surface} tracked reference at ${width}`, async ({ page, materialNetwork }, info) => {
  test.setTimeout(60000); await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await reference(page, surface);
  const card = surface === 'sign-in';
  const expected = await capturePairSide(page, info, ['header', card ? '.card' : '.hero', 'h1'], 'reference');
  const f = await fixture(page, false, {}, 'built');
  try {
    if (surface === 'landing-signed-in') {
      const user = await f.auth.createAccount(); await page.goto(origin + '/sign-in');
      materialNetwork.expectOperations({ origin: f.auth.url, method: 'POST', path: '/auth/v1/token', query: { grant_type: 'password' }, count: 1 }, { origin: f.auth.url, method: 'GET', path: '/auth/v1/user', query: {}, count: 2 });
      await signIn(page, user.email, user.password); await expect(page).toHaveURL(origin + '/app');
    }
    await page.goto(origin + (card ? '/sign-in' : '/'));
    await expect(page.getByRole('heading', { name: card ? 'Welcome back' : surface === 'landing-signed-in' ? 'Your next idea starts here.' : 'Make room for your next idea.', exact: true })).toBeVisible();
    const actual = await capturePairSide(page, info, ['.wp-entry header', card ? '.wp-auth-card' : '.wp-entry-hero', '.wp-entry h1'], 'actual');
    await verifyCapturePair(info, expected, actual, { reference: `docs/design/auth-entry/${surface}.html`, approval: 'docs/design/design.md#public-entry-and-sign-in', substitutions: 'Remove specimen note/Preview states link; empty labelled-input equivalent; 44px link hit targets; system font smoothing', surface, width });
  } finally { await f.close(); }
});

const states = [
  { id: 'checking', reference: 'checking', screen: 'checking', title: 'Checking your session' },
  { id: 'restore-error', reference: 'restore-error', screen: 'startup-failed', title: 'Couldn’t check your session' },
  { id: 'sign-out-pending', reference: 'signout-pending', screen: 'signed-out', title: 'Signing out' },
  { id: 'sign-out-failed', reference: 'signout-unknown', screen: 'signout-unconfirmed', title: 'Workspace closed' },
  { id: 'password-update', reference: 'password-update', screen: 'password', title: 'Choose a new password' },
  { id: 'reset-link-invalid', reference: 'recovery-error', screen: 'invalid-link', title: 'This link couldn’t be verified' },
  { id: 'account-lock-not-saved', reference: 'signout-unknown', screen: 'account-lock-not-saved', title: 'Account access is locked' },
  { id: 'signout-unconfirmed-lock-not-saved', reference: 'signout-unknown', screen: 'signout-unconfirmed-lock-not-saved', title: 'Workspace closed' },
] as const;
for (const width of [1440, 390]) for (const state of states) test(`entry ${state.id} retained state reference at ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await reference(page, state.reference);
  const example = accountExamples.find(example => example.id === state.id);
  if (example) await retainedAccountReference(page, example, state.title);
  const expected = await capturePairSide(page, info, ['header', '.card', 'h1'], 'reference');
  await page.goto('/account-visual.html');
  await page.waitForFunction(() => !!(window as unknown as { accountVisual?: unknown }).accountVisual);
  const presentation: AccountPresentation = { screen: state.screen, account: null, open: true, busy: state.id === 'sign-out-pending', message: '' };
  await page.evaluate(state => (window as unknown as { accountVisual: { entry(state: AccountPresentation, kind: 'sign-in'): void } }).accountVisual.entry(state, 'sign-in'), presentation);
  await expect(page.locator('.wp-auth-card')).toBeVisible();
  const actual = await capturePairSide(page, info, ['.wp-entry header', '.wp-auth-card', '.wp-entry h1'], 'actual');
  await verifyCapturePair(info, expected, actual, { reference: `docs/design/auth-entry/${state.reference}.html`, approval: 'docs/design/design.md#public-entry-and-sign-in', retainedSemantics: example ? 'Frozen account-examples: approved Phase 3 account/recovery/lock controls retained inside the new card frame' : 'Unmodified approved card state', lane: 'read-only component presentation; real Auth/route behavior verified separately', state: state.id, width });
});
