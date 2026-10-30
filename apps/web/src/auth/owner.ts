import { AuthClient, type Session, type AuthChangeEvent } from '@supabase/auth-js';
import type { PublicAuthConfig } from './public-config.js';
type AccountIdentity = { accountId: string; name: string };

export type AccountScreen = 'sign-in' | 'account' | 'reset' | 'reset-sent' | 'password' | 'password-updated' | 'update-unconfirmed' | 'invalid-link' | 'checking' | 'expired' | 'startup-failed' | 'signed-out' | 'signout-unconfirmed' | 'switching' | 'unconfigured';
export type AccountPresentation = { screen: AccountScreen; account: AccountIdentity | null; open: boolean; busy: boolean; message: string };
const fenceKey = 'workprint.auth-access-fenced';

/** The SDK alone owns credentials, persistence and refresh. This owner holds presentation/intent only. */
export class AccountOwner {
  private state: AccountPresentation = { screen: 'checking', account: null, open: false, busy: false, message: '' };
  private listeners = new Set<() => void>();
  private client: InstanceType<typeof AuthClient> | undefined;
  private epoch = 0;
  private blocked = false;
  private recovery = false;
  private operation = false;
  private restoring = false;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: (() => void) | undefined;
  private readonly onStorage = (event: StorageEvent) => { if (event.key === fenceKey && event.newValue) this.fence('expired'); };
  constructor(config: PublicAuthConfig) {
    if (config.kind !== 'configured') { this.set({ screen: 'unconfigured' }); return; }
    try {
      // The noncredential flag prevents a failed revocation restoring access on reload/another tab.
      this.blocked = localStorage.getItem(fenceKey) !== null;
      localStorage.setItem('workprint.auth-storage-check', '1'); localStorage.removeItem('workprint.auth-storage-check');
    } catch { this.set({ screen: 'unconfigured', message: 'Account access requires browser storage. Allow storage and reload.' }); return; }
    this.recovery = location.pathname === '/auth/callback';
    if (this.recovery) { this.blocked = true; localStorage.setItem(fenceKey, 'recovery'); this.set({ open: true }); }
    this.client = new AuthClient({
      url: `${config.url}/auth/v1`, headers: { apikey: config.publishableKey }, storageKey: 'workprint.auth',
      flowType: 'pkce', persistSession: true, autoRefreshToken: !this.blocked,
      detectSessionInUrl: this.recovery, debug: false,
      fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) }),
    });
    const { data } = this.client.onAuthStateChange((event, session) => this.changed(event, session));
    this.unsubscribe = () => data.subscription.unsubscribe();
    window.addEventListener('storage', this.onStorage);
    void this.client.initialize().then(({ error }) => {
      if (this.recovery && (error || this.state.screen === 'checking')) this.set({ screen: 'invalid-link', busy: false });
      if (location.pathname === '/auth/callback') history.replaceState(null, '', '/auth/callback');
    });
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(value: Partial<AccountPresentation>) { this.state = { ...this.state, ...value }; for (const listener of this.listeners) listener(); }
  private changed(event: AuthChangeEvent, session: Session | null) {
    if (event === 'PASSWORD_RECOVERY') { this.recovery = true; this.blocked = true; this.set({ account: null, screen: 'password', open: true, busy: false }); return; }
    if (this.operation || this.recovery) return;
    if (event === 'SIGNED_OUT') { if (this.state.account) this.fence('expired'); return; }
    if (this.blocked) { if (this.state.screen === 'checking') this.set({ screen: 'sign-in' }); return; }
    if (!session) { this.set({ screen: 'sign-in' }); return; }
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      const epoch = this.epoch;
      // Never await another SDK method inside its Auth event callback (SDK lock).
      setTimeout(() => { void this.restore(epoch); }, 0);
    } else if (event === 'TOKEN_REFRESHED') this.present(session);
  }
  private async restore(epoch: number) {
    if (!this.client || this.blocked || this.recovery || epoch !== this.epoch || this.restoring) return;
    this.restoring = true;
    try {
      const { data, error } = await this.client.getUser();
      if (epoch !== this.epoch || this.blocked || this.recovery) return;
      if (error || !data.user) {
        if (error && error.status !== 401 && error.status !== 403) this.set({ screen: 'startup-failed', account: null, busy: false });
        else this.fence('expired');
        return;
      }
      const session = await this.client.getSession();
      if (epoch !== this.epoch || this.blocked || this.recovery) return;
      if (session.error || session.data.session?.user.id !== data.user.id) this.fence('expired');
      else this.present(session.data.session);
    } finally { this.restoring = false; }
  }
  private present(session: Session) {
    if (this.blocked || this.recovery) return;
    clearTimeout(this.expiry);
    const remaining = (session.expires_at ?? 0) * 1000 - Date.now();
    if (remaining <= 0) { this.fence('expired'); return; }
    this.expiry = setTimeout(() => this.fence('expired'), remaining);
    this.set({ account: { accountId: session.user.id, name: session.user.email ?? 'Account' }, screen: 'account', busy: false, message: '' });
  }
  private fence(screen: AccountScreen) {
    ++this.epoch; this.blocked = true; clearTimeout(this.expiry); this.client?.stopAutoRefresh();
    localStorage.setItem(fenceKey, this.recovery ? 'recovery' : 'blocked');
    this.set({ account: null, screen, busy: false, message: '', open: this.state.open || screen === 'expired' });
  }
  open = () => this.set({ open: true });
  close = () => this.set({ open: false });
  navigate = async (screen: 'sign-in' | 'reset') => {
    if (this.operation) return;
    if (this.recovery) { this.fence(screen); this.operation = true; try { await this.client?.signOut({ scope: 'local' }); } finally { this.operation = false; this.recovery = false; } }
    this.set({ screen: this.client ? screen : 'unconfigured', message: '', busy: false });
  };
  validation = (message: string) => this.set({ message });
  signIn = async (email: string, password: string) => {
    if (!this.client || this.operation) return;
    this.fence('sign-in');
    const epoch = this.epoch; this.operation = true; this.set({ busy: true, message: '' });
    try {
      const { data, error } = await this.client.signInWithPassword({ email, password });
      if (epoch !== this.epoch) return;
      if (error || !data.session) { this.set({ busy: false, message: error?.code === 'invalid_credentials' ? 'Email or password is incorrect. Check both and try again.' : 'We couldn’t complete sign-in. Check your connection and try again.' }); return; }
      this.recovery = false; this.blocked = false; localStorage.removeItem(fenceKey); this.client.startAutoRefresh(); this.present(data.session); this.set({ open: false });
    } finally { this.operation = false; }
  };
  signOut = async (switchAccount = false) => {
    if (!this.client || this.operation) return;
    this.fence(switchAccount ? 'switching' : 'signed-out'); this.operation = true; this.set({ open: true, busy: true });
    try {
      const { error } = await this.client.signOut({ scope: 'local' });
      this.set({ screen: error ? 'signout-unconfirmed' : switchAccount ? 'sign-in' : 'signed-out', busy: false, message: error ? 'You’re signed out here. We couldn’t confirm session revocation. Sign in again to continue.' : '' });
    } finally { this.operation = false; }
  };
  reset = async (email: string) => {
    if (!this.client || this.operation) return;
    this.operation = true; this.set({ busy: true, message: '' });
    try {
      const { error } = await this.client.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback` });
      this.set(error ? { busy: false, message: 'We couldn’t confirm the reset email. Check your inbox, or try again.' } : { screen: 'reset-sent', busy: false });
    } finally { this.operation = false; }
  };
  updatePassword = async (password: string) => {
    if (!this.client || this.operation || !this.recovery || this.state.screen !== 'password') return;
    this.operation = true; this.set({ busy: true, message: '' });
    try {
      const { error } = await this.client.updateUser({ password });
      if (error && (error.status === 400 || error.status === 422)) { this.set({ busy: false, message: 'The password wasn’t accepted. Choose a different password and try again.' }); return; }
      this.fence(error ? 'update-unconfirmed' : 'password-updated');
      this.set({ busy: true });
      const signedOut = await this.client.signOut({ scope: 'local' });
      this.recovery = false;
      this.set({ busy: false, ...(signedOut.error ? { message: 'We couldn’t confirm session revocation. Sign in again to continue.' } : {}) });
    } finally { this.operation = false; }
  };
  getAccessToken = async (): Promise<string | null> => {
    const epoch = this.epoch, account = this.state.account;
    if (!this.client || this.blocked || this.recovery || !account) return null;
    const { data, error } = await this.client.getSession();
    if (epoch !== this.epoch || this.blocked || this.recovery) return null;
    if (error || !data.session || data.session.user.id !== account.accountId || (data.session.expires_at ?? 0) * 1000 <= Date.now()) { this.fence('expired'); return null; }
    return data.session.access_token;
  };
  dispose() { ++this.epoch; clearTimeout(this.expiry); this.unsubscribe?.(); this.client?.stopAutoRefresh(); window.removeEventListener('storage', this.onStorage); this.listeners.clear(); }
}
