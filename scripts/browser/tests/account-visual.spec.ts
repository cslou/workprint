import { test, expect } from '../material-network.js';
import { accountExamples } from '../account-examples.js';
import { accountReference, accountGeometry } from '../account-reference.js';
import { browserOrigin } from '../origin.js';
import { settleCapture } from '../capture.js';
import { compare } from '../compare.js';
import { writeFile } from 'node:fs/promises';
import type { AccountPresentation, AccountScreen } from '../../../apps/web/src/auth/owner.js';

const screens: Record<string, AccountScreen> = {
  'sign-in': 'sign-in', 'sign-in-validation': 'sign-in', 'sign-in-pending': 'sign-in', 'sign-in-incorrect': 'sign-in', 'sign-in-failed': 'sign-in', 'sign-in-unconfigured': 'unconfigured',
  'account-signed-in': 'account', 'account-long-identity': 'account', 'sign-out-pending': 'signed-out', 'sign-out-failed': 'signout-unconfirmed', 'signed-out': 'signed-out', 'account-switching': 'switching',
  'reset-request': 'reset', 'reset-pending': 'reset', 'reset-failed': 'reset', 'reset-sent': 'reset-sent', 'reset-link-checking': 'checking-link', 'reset-link-invalid': 'invalid-link', 'reset-link-expired': 'invalid-link', 'reset-link-reused': 'invalid-link',
  'password-update': 'password', 'password-mismatch': 'password', 'password-update-pending': 'password', 'password-update-rejected': 'password-rejected', 'password-update-unconfirmed': 'update-unconfirmed', 'password-updated': 'password-updated',
  'session-checking': 'checking', 'session-refreshing': 'refreshing', 'session-refresh-failed': 'refresh-failed', 'session-expired': 'expired',
};
const messages = new Set(['sign-in-validation', 'sign-in-incorrect', 'sign-in-failed', 'reset-failed', 'password-mismatch', 'password-update-rejected']);
const main = new Set(['sign-in', 'account-signed-in', 'reset-request', 'reset-sent', 'password-update', 'signed-out']);
for (const width of [1440, 390, 820, 821]) for (const example of accountExamples) {
  if (width !== 1440 && width !== 390 && !main.has(example.id)) continue;
  test(`account ${example.id} approved reference at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await accountReference(page, example);
    await settleCapture(page);
    const referenceGeometry = await accountGeometry(page, true);
    const reference = await page.screenshot({ path: info.outputPath('reference-full.png'), fullPage: true, animations: 'disabled' });
    await page.goto('/account-visual.html');
    await page.waitForFunction(() => !!(window as unknown as { accountVisual?: unknown }).accountVisual);
    const screen = screens[example.id]; if (!screen) throw new Error('Unmapped approved account example');
    const state: AccountPresentation = { screen, account: example.signed ? { accountId: 'presentation-only', name: example.id === 'account-long-identity' ? 'alex.very.long.creator.name+review@example.test' : 'alex@example.test' } : null, open: true, busy: false, message: messages.has(example.id) ? example.notice : '' };
    const configure = (state: AccountPresentation) => page.evaluate(state => (window as unknown as { accountVisual: { configure(state: AccountPresentation): void } }).accountVisual.configure(state), state);
    await configure(state);
    await expect(page.getByRole('dialog')).toBeVisible();
    for (const [label, value] of example.fields) if (!['name@example.com', 'Password', 'New password', 'Repeat new password'].includes(value)) await page.getByLabel(label, { exact: true }).fill(value);
    if (example.pending) await configure({ ...state, busy: true });
    await settleCapture(page);
    const actualGeometry = await accountGeometry(page, false);
    const actual = await page.screenshot({ path: info.outputPath('actual-full.png'), fullPage: true, animations: 'disabled' });
    const changedPixels = await compare(reference, actual, info.outputPath('comparison'));
    await writeFile(info.outputPath('result.json'), JSON.stringify({ state: example.id, width, reference: 'docs/design/flow2-step1-r73.html + approved account substitutions', approval: 'docs/design/design.md#phase-3-account-and-session-flows', revision: info.config.metadata, changedPixels, tolerance: 0, referenceGeometry, actualGeometry }, null, 2));
    expect(actualGeometry.overflow).toBe(false); expect(referenceGeometry.overflow).toBe(false);
    expect(actualGeometry.slots).toEqual(referenceGeometry.slots);
    expect(changedPixels).toBe(0);
    expect(new URL(page.url()).origin).toBe(browserOrigin);
  });
}
