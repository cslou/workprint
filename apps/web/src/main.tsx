import { createRoot } from 'react-dom/client';
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { AccountOwner } from './auth/owner.js';
import { AccountDialog } from './auth/dialog.js';
import { entryDecision } from './auth/entry.js';
import { EntryPage } from './auth/entry-page.js';
import { useEntryLocation, replaceEntry } from './auth/browser-entry.js';
import type { PublicAuthConfig } from './auth/public-config.js';
import { OwnedShell } from './shell/owned-shell.js';
import { createConfiguredBrowserClient } from './api/runtime.js';
import './ui/tokens.css';
import './ui/foundations.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
declare const __WORKPRINT_PUBLIC_AUTH__: PublicAuthConfig;
const account = new AccountOwner(__WORKPRINT_PUBLIC_AUTH__);
const connection = createConfiguredBrowserClient(account.getAccessToken);
function Application() {
  const state = useSyncExternalStore(account.subscribe, account.getSnapshot);
  const href = useEntryLocation();
  const previousAccount = useRef<string | null | undefined>(undefined);
  const route = new URL(href), accountId = state.account?.accountId ?? null;
  if (previousAccount.current !== undefined && previousAccount.current !== accountId) { route.searchParams.delete('conversation'); route.searchParams.delete('returnTo'); }
  const decision = entryDecision(route, state);
  useLayoutEffect(() => {
    const id = state.account?.accountId ?? null;
    if (previousAccount.current !== undefined && previousAccount.current !== id) {
      const url = new URL(location.href); url.searchParams.delete('conversation'); url.searchParams.delete('returnTo'); replaceEntry(url.pathname + url.search);
    }
    if (id !== null || previousAccount.current !== undefined) previousAccount.current = id;
  }, [state.account?.accountId]);
  useLayoutEffect(() => { if (decision.kind === 'replace') replaceEntry(decision.target); }, [decision.kind, decision.kind === 'replace' ? decision.target : null]);
  if (decision.kind === 'replace') return null;
  if (decision.kind !== 'workspace') return <EntryPage owner={account} state={state} kind={decision.kind} />;
  return <><OwnedShell key={state.account!.accountId} connection={connection} session={state.account} onAccountOpen={account.open} /><AccountDialog owner={account} state={state} /></>;
}
createRoot(root).render(<Application />);
