import { Shell, type ShellProps } from './shell.js';
import { useNativeNavigation } from './use-native-navigation.js';

/** Product composition; isolated application-workspace prerequisites retain their own inputs. */
export function OwnedShell(props: Omit<ShellProps, 'navigation' | 'conversationId'>) {
  const navigation = useNativeNavigation(props.connection, props.session?.accountId ?? null, () => props.onAccountOpen?.());
  return <Shell {...props} {...(props.connection.kind === 'configured' ? { navigation, ...(navigation.history ? { conversationId: navigation.history.id } : {}) } : {})} />;
}
