import { createRoot } from 'react-dom/client';
import { createApiClient } from '@workprint/api-client';
import { AccountDialog, type AccountActions } from '../src/auth/dialog.js';
import { Shell } from '../src/shell/shell.js';
import type { NavigationVisualInput } from './navigation-visual.types.js';
import type { NativeNavigationState } from '../src/shell/use-native-navigation.js';
import '../src/ui/tokens.css';
import '../src/ui/foundations.css';

const node = document.getElementById('root');
if (!node) throw new Error('Missing presentation-only root');
const root = createRoot(node);
const noMutation = async () => { throw new Error('Presentation-only native example cannot invoke a mutation'); };
const actions: AccountActions = { close() {}, validation() {}, navigate: noMutation, signIn: noMutation, signOut: noMutation, reset: noMutation, updatePassword: noMutation, retryFence: noMutation };
const base = createApiClient({ baseUrl: location.origin, getAccessToken: async () => null });
const client = { ...base, workspace: async () => ({ ok: false as const, error: { code: 'not_implemented' as const, message: 'Read-only unavailable workspace presentation' } }) };
(window as unknown as { navigationVisual: unknown }).navigationVisual = {
  configure(input: NavigationVisualInput) {
    const navigation: NativeNavigationState = { ...input, create: noMutation, list: async () => {}, open: noMutation, earlier: noMutation, openRecents() {}, dismiss() {} };
    root.render(<><Shell navigation={navigation} connection={{ kind: 'configured', client }} session={input.account} {...(input.history ? { conversationId: input.history.id } : {})} onAccountOpen={() => {}} />{input.auth && <AccountDialog owner={actions} state={input.auth} />}</>);
  },
};
