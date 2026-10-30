import { AuthClient, type Session, type AuthChangeEvent } from '@supabase/auth-js';
import { terminalRefreshRejection } from './refresh.js';
import { authChange, exchangePassword } from './sign-in.js';
import { currentIntent, saveFence, fenceKey, intentKey } from './intent.js';
import type { PublicAuthConfig } from './public-config.js';
type AccountIdentity = { accountId: string; name: string };
type Scope = { epoch: number; intent: string | null };
type Recovery = { scope: Scope; accountId: string };
type Exit = { intent: string | null; accountId: string | null; confirmed: boolean; switchAccount: boolean };
export type AccountScreen = 'sign-in' | 'account' | 'reset' | 'reset-sent' | 'password' | 'password-rejected' | 'password-updated' | 'update-unconfirmed' | 'invalid-link' | 'checking-link' | 'checking' | 'refreshing' | 'refresh-failed' | 'expired' | 'startup-failed' | 'signed-out' | 'signout-unconfirmed' | 'switching' | 'unconfigured' | 'account-lock-not-saved' | 'signout-pending-lock-not-saved' | 'signout-confirmed-lock-not-saved' | 'signout-unconfirmed-lock-not-saved';
export type AccountPresentation = { screen: AccountScreen; account: AccountIdentity | null; open: boolean; busy: boolean; message: string };

/** One persistent SDK authority. All application state is presentation/purpose metadata, never credentials. */
export class AccountOwner {
  private state: AccountPresentation = { screen: 'checking', account: null, open: false, busy: false, message: '' };
  private listeners = new Set<() => void>();
  private client: InstanceType<typeof AuthClient> | undefined;
  private ready: Promise<void> = Promise.resolve();
  private epoch = 0;
  private intent: string | null = null;
  private blocked = false;
  private recoveryWanted = false;
  private recovery: Recovery | undefined;
  private operation = false;
  private initializing = true;
  private restoring = false;
  private refreshRejected = false;
  private fenceSaved = true;
  private exit: Exit | undefined;
  private revoking: { confirmed: boolean } | undefined;
  private read: { scope: Scope; abort: AbortController } | undefined;
  private passwordAttempt: AbortController | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: (() => void) | undefined;
  private readonly onStorage = (event: StorageEvent) => {
    if (event.key !== intentKey && event.key !== fenceKey) return;
    try { if (currentIntent() === this.intent && (event.key !== fenceKey || !event.newValue)) return; }
    catch { this.fence('account-lock-not-saved', false); return; }
    this.fence(this.recoveryWanted || this.state.screen === 'invalid-link' ? 'invalid-link' : 'expired', false);
  };
  constructor(private readonly config: PublicAuthConfig) {
    this.recoveryWanted = location.pathname === '/auth/callback';
    const code = this.recoveryWanted ? new URL(location.href).searchParams.get('code') : null;
    if (this.recoveryWanted) history.replaceState(null, '', '/auth/callback');
    if (config.kind !== 'configured') { this.set({ screen: 'unconfigured', open: this.recoveryWanted }); return; }
    try {
      this.intent = currentIntent(); this.blocked = localStorage.getItem(fenceKey) !== null;
      localStorage.setItem('workprint.auth-storage-check', '1'); localStorage.removeItem('workprint.auth-storage-check');
    } catch { this.blocked = true; this.fenceSaved = false; this.set({ screen: 'account-lock-not-saved', open: true }); return; }
    if (this.recoveryWanted) { this.fence('checking-link'); this.recoveryWanted = true; this.set({ open: true }); }
    this.initialize(code);
  }
  private initialize(code: string | null) {
    const config = this.config;
    if (this.client || config.kind !== 'configured') return;
    this.initializing = true;
    const client = new AuthClient({
      url: `${config.url}/auth/v1`, headers: { apikey: config.publishableKey }, storageKey: 'workprint.auth',
      flowType: 'pkce', persistSession: true, autoRefreshToken: false, skipAutoInitialize: true,
      detectSessionInUrl: false, debug: false, fetch: this.fetch,
    });
    this.client = client; const scope = this.scope(); let initialAccountId: string | null = null;
    this.ready = authChange(async () => {
      await client.initialize();
      // Subscription's initial SDK read can also refresh/remove state. Keep it inside this boundary.
      await new Promise<void>(resolve => {
        const { data } = client.onAuthStateChange((event, session) => {
          if (event === 'INITIAL_SESSION') { initialAccountId = session?.user.id ?? null; resolve(); }
          this.changed(event, session);
        });
        this.unsubscribe = () => data.subscription.unsubscribe();
      });
    }).then(() => {
      this.initializing = false;
      if (!this.current(scope)) return;
      if (this.recoveryWanted) {
        if (!code || code.length > 4096 || !this.fenceSaved) this.set({ screen: this.fenceSaved ? 'invalid-link' : 'account-lock-not-saved' });
        else void this.consume(code, scope);
      } else if (this.blocked || !initialAccountId) this.set({ screen: 'sign-in', busy: false });
      else void this.restore(scope);
    }).catch(() => { this.initializing = false; if (this.current(scope)) this.set({ screen: 'startup-failed', busy: false }); });
    window.addEventListener('storage', this.onStorage);
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(value: Partial<AccountPresentation>) { this.state = { ...this.state, ...value }; for (const listener of this.listeners) listener(); }
  private scope(): Scope { return { epoch: this.epoch, intent: this.intent }; }
  private current(scope: Scope): boolean {
    try { return scope.epoch === this.epoch && scope.intent === currentIntent(); } catch { return false; }
  }
  private fetch: typeof fetch = async (input, init) => {
    const scope = this.scope(), read = this.read;
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const refresh = url.searchParams.get('grant_type') === 'refresh_token';
    const userRead = url.pathname.endsWith('/user') && (init?.method ?? 'GET') === 'GET' && read;
    if (refresh && this.blocked && !this.operation) throw new DOMException('Account access is fenced', 'AbortError');
    if (refresh && this.state.account && !this.blocked) this.set({ screen: 'refreshing', busy: true });
    const signals = [AbortSignal.timeout(5000), ...(init?.signal ? [init.signal] : []), ...(userRead ? [read.abort.signal] : [])];
    try {
      let response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
      if (userRead) {
        // Do not hand a stale session_not_found body to the SDK: getUser may remove shared credentials.
        const bytes = await response.arrayBuffer();
        if (!this.current(read.scope) || read.abort.signal.aborted) throw new DOMException('Account read superseded', 'AbortError');
        response = new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      if (refresh) {
        const terminal = await terminalRefreshRejection(response);
        if (this.current(scope)) {
          this.refreshRejected = !response.ok;
          if (!this.blocked && terminal) this.fence('refresh-failed');
        }
      }
      if (this.revoking && url.pathname.endsWith('/logout') && response.ok && new Headers(init?.headers).get('Authorization')?.startsWith('Bearer ')) this.revoking.confirmed = true;
      return response;
    } finally { if (refresh && this.current(scope) && this.state.screen === 'refreshing' && !this.blocked) this.set({ screen: 'account', busy: false }); }
  };
  private changed(event: AuthChangeEvent, session: Session | null) {
    if (this.initializing || this.operation) return;
    if (!this.current(this.scope())) { this.fence(this.recoveryWanted || this.state.screen === 'invalid-link' ? 'invalid-link' : 'expired', false); return; }
    // Only consume() can establish this tab's recovery purpose/identity, not a broadcast.
    if (event === 'PASSWORD_RECOVERY') { if (!this.recoveryWanted) this.fence('expired', false); return; }
    if (event === 'SIGNED_OUT') {
      if (this.state.account || this.recoveryWanted) this.fence(this.refreshRejected ? 'refresh-failed' : 'expired', false);
      return;
    }
    if (this.blocked || this.recoveryWanted) return;
    if (!session) { this.set({ screen: 'sign-in' }); return; }
    if (event === 'SIGNED_IN' && this.state.account?.accountId === session.user.id) return;
    if (event === 'TOKEN_REFRESHED') this.present(session);
    else if (event === 'SIGNED_IN') { const scope = this.scope(); setTimeout(() => { void this.restore(scope); }, 0); }
  }
  private async guarded<T>(scope: Scope, action: () => Promise<T>): Promise<T | undefined> {
    return authChange(async () => {
      if (!this.current(scope)) return undefined;
      const read = { scope, abort: new AbortController() }; this.read = read;
      try { return await action(); }
      finally { if (this.read === read) this.read = undefined; }
    });
  }
  private async restore(scope: Scope) {
    if (!this.client || this.blocked || this.recoveryWanted || this.restoring) return;
    this.restoring = true;
    try {
      await this.guarded(scope, async () => {
        const { data, error } = await this.client!.getUser();
        if (!this.current(scope) || this.blocked) return;
        if (error || !data.user) {
          if (error && (!error.status || error.status === 429 || error.status >= 500) && this.state.account) return;
          if (error && error.status !== 401 && error.status !== 403 && error.name !== 'AuthSessionMissingError') this.set({ screen: 'startup-failed', account: null, busy: false });
          else this.fence('expired');
          return;
        }
        const result = await this.client!.getSession();
        if (!this.current(scope) || this.blocked) return;
        if (result.error || result.data.session?.user.id !== data.user.id) this.fence('expired');
        else { this.present(result.data.session); void this.client!.startAutoRefresh(); }
      });
    } catch { if (this.current(scope) && !this.state.account) this.set({ screen: 'startup-failed', busy: false }); }
    finally { this.restoring = false; }
  }
  private async consume(code: string, scope: Scope) {
    this.operation = true;
    try {
      await this.guarded(scope, async () => {
        const result = await this.client!.exchangeCodeForSession(code);
        if (!this.current(scope)) return;
        if (result.error || !result.data.user) { this.set({ screen: 'invalid-link' }); return; }
        const verified = await this.client!.getUser();
        if (!this.current(scope)) return;
        if (verified.error || verified.data.user?.id !== result.data.user.id) { this.set({ screen: 'invalid-link' }); return; }
        this.recovery = { scope, accountId: verified.data.user.id }; this.set({ screen: 'password', busy: false });
      });
    } catch { if (this.current(scope)) this.set({ screen: 'invalid-link', busy: false }); }
    finally { this.operation = false; }
  }
  private present(session: Session) {
    if (this.blocked || this.recoveryWanted) return;
    clearTimeout(this.expiry); const remaining = (session.expires_at ?? 0) * 1000 - Date.now();
    if (remaining <= 0) { this.fence('expired'); return; }
    this.expiry = setTimeout(() => this.fence('expired'), remaining);
    this.set({ account: { accountId: session.user.id, name: session.user.email ?? 'Account' }, screen: 'account', busy: false, message: '' });
  }
  private fence(screen: AccountScreen, persist = true) {
    ++this.epoch; this.passwordAttempt?.abort(); this.read?.abort.abort(); this.blocked = true;
    this.recovery = undefined; this.recoveryWanted = false; clearTimeout(this.expiry); void this.client?.stopAutoRefresh();
    if (persist) {
      try { this.intent = saveFence(); this.fenceSaved = true; }
      catch { this.fenceSaved = false; }
    }
    this.set({ account: null, screen: this.fenceSaved ? screen : 'account-lock-not-saved', busy: false, message: '', open: this.state.open || !this.fenceSaved || screen === 'expired' || screen === 'refresh-failed' });
    return this.fenceSaved;
  }
  open = () => this.set({ open: true });
  close = () => this.set({ open: false });
  navigate = async (screen: 'sign-in' | 'reset') => {
    if (this.operation) return;
    const binding = this.recovery;
    if (binding) {
      this.operation = true;
      try { await this.guarded(binding.scope, async () => { const session = await this.client!.getSession(); if (this.current(binding.scope) && session.data.session?.user.id === binding.accountId) await this.client!.signOut({ scope: 'local' }); }); }
      catch { this.fence('invalid-link', false); return; }
      finally { this.operation = false; }
      if (!this.current(binding.scope)) { this.fence('invalid-link', false); return; }
    }
    this.fence(screen); this.set({ screen: this.fenceSaved ? this.client ? screen : 'unconfigured' : 'account-lock-not-saved' });
  };
  validation = (message: string) => this.set({ message });
  signIn = async (email: string, password: string) => {
    const client = this.client, config = this.config;
    if (!client || this.operation || config.kind !== 'configured') return;
    if (!this.fence('sign-in')) return;
    this.exit = undefined;
    const scope = this.scope(), attempt = new AbortController(); this.passwordAttempt = attempt;
    this.operation = true; this.set({ busy: true });
    try {
      await this.ready;
      const result = await exchangePassword(config, email, password, attempt.signal);
      if (!this.current(scope)) return;
      if (result.error || !result.data.session) { this.set({ busy: false, message: result.error?.code === 'invalid_credentials' ? 'Email or password is incorrect. Check both and try again.' : 'We couldn’t complete sign-in. Check your connection and try again.' }); return; }
      const session = result.data.session;
      await this.guarded(scope, async () => {
        const published = await client.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
        if (!this.current(scope)) return;
        if (published.error || !published.data.session) { this.set({ busy: false, message: 'We couldn’t complete sign-in. Check your connection and try again.' }); return; }
        localStorage.removeItem(fenceKey); this.blocked = false; this.recoveryWanted = false; void client.startAutoRefresh(); this.present(published.data.session); this.set({ open: false });
      });
    } catch { if (this.current(scope)) this.set({ busy: false, message: 'We couldn’t complete sign-in. Check your connection and try again.' }); }
    finally { if (this.passwordAttempt === attempt) this.passwordAttempt = undefined; this.operation = false; }
  };
  signOut = async (switchAccount = false) => {
    if (!this.client || this.operation) return;
    if (!this.current(this.scope())) { this.fence('expired', false); return; }
    const previous = this.exit;
    const accountId = previous?.accountId ?? this.state.account?.accountId ?? this.recovery?.accountId ?? null;
    this.fence(switchAccount ? 'switching' : 'signed-out');
    const scope = this.scope(), exit: Exit = { accountId, intent: scope.intent, confirmed: previous?.confirmed ?? false, switchAccount };
    this.exit = exit; this.operation = true; this.set({ open: true, busy: true, screen: this.fenceSaved ? switchAccount ? 'switching' : 'signed-out' : 'signout-pending-lock-not-saved' });
    try {
      await this.ready;
      await this.guarded(scope, async () => {
        const session = await this.client!.getSession();
        if (!this.current(scope)) return;
        if (session.data.session && accountId && session.data.session.user.id !== accountId) { this.fence('expired', false); return; }
        const revoke = { confirmed: false }; this.revoking = revoke;
        try { await this.client!.signOut({ scope: 'local' }); }
        finally { this.revoking = undefined; }
        if (!this.current(scope)) return;
        exit.confirmed ||= revoke.confirmed;
        this.showExit(exit);
      });
    } catch { if (this.current(scope)) this.showExit(exit); }
    finally { this.operation = false; }
  };
  private showExit(exit: Exit) {
    this.set({ busy: false, screen: this.fenceSaved ? exit.confirmed ? exit.switchAccount ? 'sign-in' : 'signed-out' : 'signout-unconfirmed' : exit.confirmed ? 'signout-confirmed-lock-not-saved' : 'signout-unconfirmed-lock-not-saved' });
  }
  retryFence = async () => {
    if (this.operation) return;
    if (this.client && !this.current(this.scope())) { this.fence('expired', false); return; }
    const exit = this.exit;
    this.fence('expired');
    if (exit) { exit.intent = this.intent; this.showExit(exit); }
    else if (this.fenceSaved) {
      if (!this.client) { this.set({ screen: 'checking', busy: true }); this.initialize(null); }
      else this.set({ screen: 'expired' });
    }
  };
  reset = async (email: string) => {
    if (!this.client || this.operation) return;
    const scope = this.scope(); this.operation = true; this.set({ busy: true, message: '' });
    try {
      await this.ready;
      await this.guarded(scope, async () => {
        const { error } = await this.client!.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback` });
        if (this.current(scope)) this.set(error ? { busy: false, message: 'We couldn’t confirm the reset email. Check your inbox, or try again.' } : { screen: 'reset-sent', busy: false });
      });
    } catch { if (this.current(scope)) this.set({ busy: false, message: 'We couldn’t confirm the reset email. Check your inbox, or try again.' }); }
    finally { this.operation = false; }
  };
  updatePassword = async (password: string) => {
    const binding = this.recovery;
    if (!this.client || this.operation || !binding) return;
    this.operation = true; this.set({ busy: true, message: '' });
    try {
      await this.guarded(binding.scope, async () => {
        const verified = await this.client!.getUser();
        if (!this.current(binding.scope) || verified.error || verified.data.user?.id !== binding.accountId) { this.fence('invalid-link', false); return; }
        const { error } = await this.client!.updateUser({ password });
        if (!this.current(binding.scope)) return;
        if (error && (error.code === 'weak_password' || error.code === 'same_password')) { this.set({ screen: 'password-rejected', busy: false, message: 'The password wasn’t accepted. Choose a different password and try again.' }); return; }
        this.fence(error ? error.status && error.status >= 400 && error.status < 500 ? 'invalid-link' : 'update-unconfirmed' : 'password-updated');
        this.set({ busy: true }); const signedOut = await this.client!.signOut({ scope: 'local' });
        this.set({ busy: false, ...(signedOut.error ? { message: 'We couldn’t confirm session revocation. Sign in again to continue.' } : {}) });
      });
      if (!this.current(binding.scope) && this.recoveryWanted) this.fence('invalid-link', false);
    } catch { if (this.current(binding.scope)) { this.fence('update-unconfirmed'); this.set({ busy: false }); } }
    finally { this.operation = false; }
  };
  getAccessToken = async (): Promise<string | null> => {
    const scope = this.scope(), account = this.state.account;
    if (!this.client || this.blocked || this.recoveryWanted || !account || !this.current(scope)) return null;
    // SDK 2.118 guards its own refresh commits; this operation never calls mutating getUser.
    const result = await this.client.getSession();
    if (!this.current(scope) || this.blocked || this.recoveryWanted) return null;
    if (result.error || !result.data.session || result.data.session.user.id !== account.accountId || (result.data.session.expires_at ?? 0) * 1000 <= Date.now()) { this.fence('expired'); return null; }
    return result.data.session.access_token;
  };
  dispose() { ++this.epoch; this.read?.abort.abort(); this.passwordAttempt?.abort(); clearTimeout(this.expiry); this.unsubscribe?.(); void this.client?.stopAutoRefresh(); window.removeEventListener('storage', this.onStorage); this.listeners.clear(); }
}
