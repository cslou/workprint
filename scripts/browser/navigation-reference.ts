import type { Page } from '@playwright/test';
import type { NativeThread } from '../../packages/api-client/src/index.js';
import type { NavigationVisualInput } from '../../apps/web/test/navigation-visual.types.js';
import { accountReference } from './account-reference.js';
import { accountExamples } from './account-examples.js';

// Frozen independent r73/r74/r85 substitutions approved at 74f2c4b; never load ignored previews.
export const navigationExamples = [
  'navigation-closed', 'navigation-open', 'recents-first', 'recents-next', 'recents-end', 'recents-loading', 'recents-page-loading', 'recents-empty', 'recents-failed', 'recents-page-failed', 'recents-long-title', 'recents-keyboard-focus',
  'history-loading', 'history-loaded', 'history-empty', 'history-failed', 'history-unavailable', 'history-earlier-loading', 'history-earlier-failed', 'history-all-loaded', 'history-long-content',
  'create-pending', 'create-rejected', 'create-unconfirmed', 'create-complete', 'session-expired-create', 'session-expired-recents', 'session-expired-history', 'session-refresh-failed-history',
] as const;
export type NavigationExample = typeof navigationExamples[number];
export async function navigationReference(page: Page, id: NavigationExample): Promise<NavigationVisualInput> {
  await page.goto(`/navigation-references/${id}.html`);
  // Enforce the binding ellipsis/containment rule: the exploratory grid otherwise
  // expands a desktop long-title track beyond its sidebar instead of ellipsizing.
  await page.addStyleTag({ content: '.recent-list{grid-template-columns:minmax(0,1fr);min-width:0}.recent-list>li{min-width:0}' });
  // Only fictional content is supplied to the consumer. Expected markup/styles stay independent.
  const content = await page.evaluate(() => ({
    quick: [...document.querySelectorAll('.sidebar .recent-row')].map(node => node.textContent!.trim()),
    rows: [...document.querySelectorAll('.dialog-content .recent-row')].map(node => node.textContent!.trim()),
    title: document.querySelector('.history-head h1')?.textContent ?? '',
    messages: [...document.querySelectorAll('.saved-messages > *')].map(node => ({ role: node.classList.contains('me') ? 'user' as const : 'assistant' as const, parts: node.querySelectorAll('p').length ? [...node.querySelectorAll('p')].map(p => p.textContent!) : [node.textContent!] })),
  }));
  const resourceId = '11111111-1111-4111-8111-111111111111';
  const uuid = (value: number) => `22222222-2222-4222-8222-${String(value).padStart(12, '0')}`;
  const thread = (title: string, index: number): NativeThread => ({ id: uuid(index), resourceId, title, metadata: {}, createdAt: '2026-10-30T00:00:00.000Z', updatedAt: '2026-10-30T00:00:00.000Z' });
  const quick = content.quick.map((title, index) => thread(title, index + 1));
  const rowThreads = content.rows.map((title, index) => thread(title, index + 100));
  const session = id.startsWith('session-');
  const value: NavigationVisualInput = { account: session ? null : { accountId: resourceId, name: 'alex@example.test' }, auth: null, history: null, quick, recents: { value: null, pending: false, failed: false, target: 0 }, createState: 'idle', dialog: null };
  const recent = id.startsWith('recents-') || id === 'navigation-open';
  if (recent) {
    value.dialog = id === 'navigation-open' ? null : 'recents';
    const number = id === 'recents-next' ? 1 : id === 'recents-end' ? 2 : 0;
    value.recents = { value: id === 'recents-loading' || id === 'recents-failed' ? null : { threads: rowThreads, page: number, perPage: 6, total: id === 'recents-empty' ? 0 : 14, hasMore: id !== 'recents-end' && id !== 'recents-empty' }, pending: id === 'recents-loading' || id === 'recents-page-loading', failed: id === 'recents-failed' || id === 'recents-page-failed', target: id === 'recents-page-failed' || id === 'recents-page-loading' ? 1 : number };
  }
  if (id === 'navigation-closed' || session) value.recents.value = { threads: [], page: 0, perPage: 6, total: 0, hasMore: false };
  if (id.startsWith('history-') || id === 'create-complete') {
    const selected = quick.find(item => item.title === content.title) ?? thread(content.title, 500);
    value.history = { id: selected.id, thread: id === 'history-unavailable' ? null : selected, kind: id === 'history-loading' ? 'loading' : id === 'history-unavailable' ? 'unavailable' : id === 'history-failed' ? 'error' : 'ready', page: 0, hasMore: !['history-all-loaded', 'history-empty', 'create-complete'].includes(id), earlier: id === 'history-earlier-loading' ? 'loading' : id === 'history-earlier-failed' ? 'error' : 'idle', messages: content.messages.map((message, index) => ({ id: uuid(1000 + index), threadId: selected.id, resourceId, createdAt: '2026-10-30T00:00:00.000Z', role: message.role, content: { format: 2, parts: message.parts.map(text => ({ type: 'text', text })) } })) };
  }
  if (id === 'create-pending' || id === 'create-rejected' || id === 'create-unconfirmed') { value.dialog = 'new'; value.createState = id === 'create-pending' ? 'pending' : id === 'create-rejected' ? 'rejected' : 'unknown'; }
  if (session) {
    value.auth = { screen: id === 'session-refresh-failed-history' ? 'refresh-failed' : 'expired', account: null, open: true, busy: false, message: '' };
    // The binding approval reuses Auth unchanged. Preserve its earlier approved notice
    // colour/action inset, rather than the generic modal in the exploratory native view.
    const existing = accountExamples.find(example => example.id === (id === 'session-refresh-failed-history' ? 'session-refresh-failed' : 'session-expired'));
    if (!existing) throw new Error('Missing existing approved Session reference');
    await accountReference(page, existing);
    await page.addStyleTag({ content: '.navlabel{display:inline-flex;align-items:center;min-height:32px}' });
  }
  return value;
}

export function navigationGeometry(page: Page, reference: boolean) {
  return page.evaluate(reference => {
    const pairs = reference ? ['.app', '.sidebar', '.main', '.panel', '.lb-panel', '.lb-head', '.dialog-content, .account-content', '.history-head', '.saved-messages', '.history-more, .history-range, .earlier-error'] : ['.wp-shell', '.wp-sidebar', '.wp-main', '.wp-workspace', '.wp-modal', '.wp-dialog-head', '.wp-native-recents, .wp-native-feedback, .wp-owned-navigation, .wp-auth-content', '.wp-history-head', '.wp-saved-messages', '.wp-history-more'];
    const boxes = pairs.map(selector => [...document.querySelectorAll(selector)].filter(node => getComputedStyle(node).display !== 'none' && !(!reference && node.matches('.wp-native-recents') && node.closest('.wp-owned-navigation'))).map(node => { const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }));
    const rows = [...document.querySelectorAll(reference ? '.recent-row' : '.wp-recent-row')].map(node => { const r = node.getBoundingClientRect(), s = getComputedStyle(node); return { text: node.textContent, x: r.x, y: r.y, width: r.width, height: r.height, font: s.font, colour: s.color, padding: s.padding, margin: s.margin, lineHeight: s.lineHeight }; });
    return { overflow: document.documentElement.scrollWidth > innerWidth, boxes, rows };
  }, reference);
}
