import type { AccountPresentation } from '../src/auth/owner.js';
import type { NativeNavigationState } from '../src/shell/use-native-navigation.js';

export type NavigationVisualInput = Pick<NativeNavigationState, 'history' | 'recents' | 'quick' | 'createState' | 'dialog'> & { account: AccountPresentation['account']; auth: AccountPresentation | null };
