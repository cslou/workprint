import { createRoot } from 'react-dom/client';
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { AccountOwner } from './auth/owner.js';
import { AccountDialog } from './auth/dialog.js';
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
  const previousAccount = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    const id = state.account?.accountId ?? null;
    if (previousAccount.current !== undefined && previousAccount.current !== id) {
      const url = new URL(location.href); url.searchParams.delete('conversation'); history.replaceState(null, '', url);
    }
    if (id !== null || previousAccount.current !== undefined) previousAccount.current = id;
  }, [state.account?.accountId]);
  return <><OwnedShell key={state.account?.accountId ?? 'signed-out'} connection={connection} session={state.account} onAccountOpen={account.open} /><AccountDialog owner={account} state={state} /></>;
}
createRoot(root).render(<Application />);
