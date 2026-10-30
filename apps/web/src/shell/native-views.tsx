import { useEffect, useLayoutEffect, useRef } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { NativeThread } from '@workprint/api-client';
import { Button } from '../ui/controls.js';
import type { HistoryState, NativeNavigationState } from './use-native-navigation.js';
import './native-views.css';

export const threadTitle = (thread: NativeThread | null) => thread?.title?.trim() || 'Untitled video';
export function RecentRows({ threads, navigation, compact = false }: { threads: NativeThread[]; navigation: NativeNavigationState; compact?: boolean }) {
  return <ul className={`wp-recent-list${compact ? ' wp-recent-compact' : ''}`} aria-label="Recent videos">{threads.map(thread => <li key={thread.id}><AriaButton className={`wp-nav-item wp-recent-row${navigation.history?.id === thread.id ? ' current' : ''}`} {...(navigation.history?.id === thread.id ? { 'aria-current': 'page' as const } : {})} aria-label={threadTitle(thread)} isDisabled={!compact && navigation.recents.pending} onPress={() => void navigation.open(thread.id, thread)}><span>{threadTitle(thread)}</span></AriaButton></li>)}</ul>;
}
export function Recents({ navigation, embedded = false }: { navigation: NativeNavigationState; embedded?: boolean }) {
  const { value, pending, failed, target } = navigation.recents;
  const heading = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => { if (value && !pending && !failed) heading.current?.focus(); }, [value, pending, failed]);
  return <div className="wp-native-recents" aria-busy={pending}>
    {!value && pending && <p role="status">Loading Recents…</p>}
    {!value && failed && <><p role="status">Recents couldn’t be loaded. Check your connection and try again.</p><div className="wp-native-actions"><Button variant="secondary" onPress={() => void navigation.list(target)}>Try again</Button></div></>}
    {value && <>
      {value.threads.length ? <><p className="wp-native-range" ref={heading} tabIndex={-1} role="status">{`Videos ${value.page * value.perPage + 1}–${value.page * value.perPage + value.threads.length}`}</p><RecentRows threads={value.threads} navigation={navigation} /></> : <p role="status">No videos yet.</p>}
      {pending && <p role="status">Loading the next page…</p>}
      {failed && <><p role="status">The next page couldn’t be loaded. This page is unchanged.</p><div className="wp-native-actions"><Button variant="secondary" onPress={() => void navigation.list(target)}>Try next page again</Button></div></>}
      {value.threads.length > 0 && <><nav className="wp-native-pager" aria-label="Recents pages"><Button variant="secondary" isDisabled={pending || value.page === 0} onPress={() => void navigation.list(value.page - 1)}>Previous</Button><span className="wp-native-range">Page {value.page + 1}</span><Button variant="secondary" isDisabled={pending || !value.hasMore} onPress={() => void navigation.list(value.page + 1)}>Next</Button></nav>{!value.hasMore && <p className="wp-native-range" role="status">End of Recents.</p>}</>}
      {!embedded && !value.threads.length && <div className="wp-native-actions"><Button variant="secondary" onPress={() => void navigation.create()}>New video</Button></div>}
    </>}
  </div>;
}
export function CreateFeedback({ navigation }: { navigation: NativeNavigationState }) {
  if (navigation.createState === 'pending') return <div className="wp-native-feedback" aria-busy="true"><p role="status">Creating a new video…</p><p>Closing this dialog won’t cancel creation.</p></div>;
  const unknown = navigation.createState === 'unknown';
  return <div className="wp-native-feedback"><p role="status">{unknown ? 'We couldn’t confirm the new video.' : 'A new video couldn’t be started.'}</p><p>{unknown ? 'Open Recents to check before starting another.' : 'Nothing was created. Try again.'}</p><div className="wp-native-actions"><Button variant="secondary" onPress={() => { if (unknown) navigation.openRecents(); else void navigation.create(); }}>{unknown ? 'Open Recents' : 'Try again'}</Button></div></div>;
}
export function NativeHistory({ state, navigation }: { state: HistoryState; navigation: NativeNavigationState }) {
  const title = useRef<HTMLHeadingElement>(null), scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ top: number; height: number; windowY: number; documentHeight: number } | null>(null);
  useEffect(() => {
    if (state.kind !== 'ready') return;
    const frame = requestAnimationFrame(() => { if (!document.querySelector('[role="dialog"]')) title.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [state.id, state.kind]);
  useLayoutEffect(() => {
    if (state.earlier !== 'idle' || !anchor.current || !scroller.current) return;
    const previous = anchor.current; anchor.current = null;
    scroller.current.scrollTop = previous.top + scroller.current.scrollHeight - previous.height;
    if (innerWidth <= 820) window.scrollTo(0, previous.windowY + document.documentElement.scrollHeight - previous.documentHeight);
  }, [state.messages, state.earlier]);
  const earlier = () => { if (scroller.current) anchor.current = { top: scroller.current.scrollTop, height: scroller.current.scrollHeight, windowY: scrollY, documentHeight: document.documentElement.scrollHeight }; void navigation.earlier(); };
  return <>
    {state.kind !== 'unavailable' && <header className="wp-history-head"><h1 ref={title} tabIndex={-1}>{threadTitle(state.thread)}</h1><p>Conversation history</p></header>}
    <div className="wp-thread wp-native-history" ref={scroller} aria-label="Conversation history" aria-busy={state.kind === 'loading'}>
      {state.kind === 'loading' && <p className="wp-history-state" role="status">Loading conversation…</p>}
      {state.kind === 'unavailable' && <div className="wp-history-state"><p role="status">This conversation isn’t available.</p><div className="wp-native-actions"><Button variant="secondary" onPress={navigation.openRecents}>Recents</Button></div></div>}
      {state.kind === 'error' && <div className="wp-history-state"><p role="status">This conversation couldn’t be loaded. Check your connection and try again.</p><div className="wp-native-actions"><Button variant="secondary" onPress={() => void navigation.open(state.id, state.thread)}>Try again</Button><Button variant="secondary" onPress={navigation.openRecents}>Recents</Button></div></div>}
      {state.kind === 'ready' && (state.messages.length === 0 ? <p className="wp-history-state" role="status">No messages yet.</p> : <>
        <div className="wp-history-more">{state.earlier === 'loading' ? <p role="status">Loading earlier messages…</p> : state.earlier === 'error' ? <div className="wp-history-earlier-error"><p role="status">Earlier messages couldn’t be loaded.</p><Button variant="secondary" onPress={earlier}>Try again</Button></div> : state.hasMore ? <Button variant="secondary" onPress={earlier}>Load earlier messages</Button> : <p role="status">Beginning of conversation.</p>}</div>
        <ol className="wp-saved-messages" aria-label="Saved messages">{state.messages.map(message => <li key={message.id} data-message-id={message.id} className={message.role === 'user' ? 'wp-saved-user' : 'wp-saved-assistant'} aria-label={message.role === 'user' ? 'Your message' : 'Assistant message'}>{message.content.parts?.map((part, index) => part.type === 'text' ? message.role === 'assistant' ? <p key={index}>{part.text}</p> : <span key={index}>{part.text}</span> : null)}</li>)}</ol>
      </>)}
    </div>
  </>;
}
