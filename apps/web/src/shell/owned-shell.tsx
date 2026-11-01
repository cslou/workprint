import { Shell, type ShellProps } from './shell.js';
import { useNativeNavigation } from './use-native-navigation.js';

/** Product composition; isolated application-workspace prerequisites retain their own inputs. */
export function OwnedShell({ restore = null, ...props }: Omit<ShellProps, 'navigation' | 'conversationId'> & { restore?: string | null }) {
  const navigation = useNativeNavigation(props.connection, props.session?.accountId ?? null, () => props.onAccountOpen?.(), restore);
  return <Shell {...props} {...(props.connection.kind === 'configured' ? { navigation, ...(navigation.history ? { conversationId: navigation.history.id } : {}) } : {})} />;
}
