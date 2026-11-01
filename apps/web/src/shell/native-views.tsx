import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import type { NativeThread } from '@workprint/api-client';
import { Button } from '../ui/controls.js';
import { SkeletonLines, SkeletonRows, usePlaceholder } from '../ui/skeleton.js';
import { ActivityLine } from '../conversation/activity-line.js';
import { HistoryScroll } from './history-scroll.js';
import type { HistoryState, NativeNavigationState } from './use-native-navigation.js';
import { Welcome } from './welcome.js';
import './native-views.css';

export const threadTitle = (thread: NativeThread | null) => thread?.title?.trim() || 'Untitled video';
export function RecentRows({ threads, navigation, compact = false, onActivate }: { threads: NativeThread[]; navigation: NativeNavigationState; compact?: boolean; onActivate?: () => void }) {
  return <ul className={`wp-recent-list${compact ? ' wp-recent-compact' : ''}`} aria-label="Recent videos">{threads.map(thread => <li key={thread.id}><AriaButton className={`wp-nav-item wp-recent-row${navigation.history?.id === thread.id ? ' current' : ''}`} {...(navigation.history?.id === thread.id ? { 'aria-current': 'page' as const } : {})} aria-label={threadTitle(thread)} isDisabled={!compact && navigation.recents.pending} onPress={() => { onActivate?.(); void navigation.open(thread.id, thread); }}><span>{threadTitle(thread)}</span></AriaButton></li>)}</ul>;
}
export function Recents({ navigation, embedded = false, onActivate = () => {} }: { navigation: NativeNavigationState; embedded?: boolean; onActivate?: () => void }) {
  const { value, pending, failed, target } = navigation.recents;
  const heading = useRef<HTMLParagraphElement>(null);
  const placeholder = usePlaceholder(!value && !failed);
  useLayoutEffect(() => { if (value && !pending && !failed && !placeholder.active) heading.current?.focus(); }, [value, pending, failed, placeholder.active]);
  return <div className="wp-native-recents" aria-busy={pending || placeholder.active}>
    {placeholder.active && <>{placeholder.visible && <p className="wp-sr-only" role="status">Loading Recents…</p>}<SkeletonRows count={6} visible={placeholder.visible} /></>}
    {!placeholder.active && !value && failed && <><p role="status">Recents couldn’t be loaded. Check your connection and try again.</p><div className="wp-native-actions"><Button variant="secondary" onPress={() => void navigation.list(target)}>Try again</Button></div></>}
    {!placeholder.active && value && <>
      {value.threads.length ? <><p className="wp-native-range" ref={heading} tabIndex={-1} role="status">{`Videos ${value.page * value.perPage + 1}–${value.page * value.perPage + value.threads.length}`}</p><RecentRows threads={value.threads} navigation={navigation} onActivate={onActivate} /></> : <p role="status">No videos yet.</p>}
      {pending && <p role="status">Loading the next page…</p>}
      {failed && <><p role="status">The next page couldn’t be loaded. This page is unchanged.</p><div className="wp-native-actions"><Button variant="secondary" onPress={() => void navigation.list(target)}>Try next page again</Button></div></>}
      {value.threads.length > 0 && <><nav className="wp-native-pager" aria-label="Recents pages"><Button variant="secondary" isDisabled={pending || value.page === 0} onPress={() => void navigation.list(value.page - 1)}>Previous</Button><span className="wp-native-range">Page {value.page + 1}</span><Button variant="secondary" isDisabled={pending || !value.hasMore} onPress={() => void navigation.list(value.page + 1)}>Next</Button></nav>{!value.hasMore && <p className="wp-native-range" role="status">End of Recents.</p>}</>}
      {!embedded && !value.threads.length && <div className="wp-native-actions"><Button variant="secondary" onPress={navigation.startNew}>New video</Button></div>}
    </>}
  </div>;
}
/** `live` holds turns sent from this page, shown after the saved messages. */
export function NativeHistory({ state, navigation, live = null }: { state: HistoryState; navigation: NativeNavigationState; live?: ReactNode }) {
  const title = useRef<HTMLHeadingElement>(null), scroller = useRef<HTMLDivElement>(null);
  // History only delays its placeholder: holding it after resolution would also hold the opening/thread layout.
  const placeholder = usePlaceholder(state.kind === 'loading', 0);
  useEffect(() => {
    if (state.kind !== 'ready' || state.quiet) return;
    const frame = requestAnimationFrame(() => { if (!document.querySelector('[role="dialog"]')) title.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [state.id, state.kind]);
  const earlier = () => { void navigation.earlier(); };
  return <>
    {/* The title is not shown visually; it remains the focus and announcement target for an opened conversation. */}
    {state.kind !== 'unavailable' && <h1 ref={title} tabIndex={-1} className="wp-sr-only">{state.kind === 'loading' && !state.thread ? 'Loading conversation' : threadTitle(state.thread)}</h1>}
    <div className="wp-thread wp-native-history" ref={scroller} aria-label="Conversation history" aria-busy={state.kind === 'loading'}><HistoryScroll scroller={scroller} rows={state.messages} loading={state.earlier === 'loading'}>
      {state.kind === 'loading' && <>{placeholder.visible && <p className="wp-sr-only" role="status">Loading conversation…</p>}<SkeletonLines count={4} visible={placeholder.visible} /></>}
      {state.kind === 'unavailable' && <div className="wp-history-state"><p role="status">This conversation isn’t available.</p><div className="wp-native-actions"><Button variant="secondary" onPress={navigation.openRecents}>Recents</Button></div></div>}
      {state.kind === 'error' && <div className="wp-history-state"><p role="status">This conversation couldn’t be loaded. Check your connection and try again.</p><div className="wp-native-actions"><Button variant="secondary" onPress={() => void navigation.open(state.id, state.thread)}>Try again</Button><Button variant="secondary" onPress={navigation.openRecents}>Recents</Button></div></div>}
      {state.kind === 'ready' && (state.messages.length === 0 ? live ?? <Welcome owned heading="h2" /> : <>
        <div className="wp-history-more">{state.earlier === 'loading' ? <p role="status">Loading earlier messages…</p> : state.earlier === 'error' ? <div className="wp-history-earlier-error"><p role="status">Earlier messages couldn’t be loaded.</p><Button variant="secondary" onPress={earlier}>Try again</Button></div> : state.hasMore ? <Button variant="secondary" onPress={earlier}>Load earlier messages</Button> : <p role="status">Beginning of conversation.</p>}</div>
        <ol className="wp-saved-messages" aria-label="Saved messages">{state.messages.map(message => <li key={message.id} data-message-id={message.id} className={message.role === 'user' ? 'wp-saved-user' : 'wp-saved-assistant'} aria-label={message.role === 'user' ? 'Your message' : 'Assistant message'}>{message.content.parts.map((part, index) => part.type === 'tool-activity' ? <ActivityLine key={index} activity={part} /> : message.role === 'assistant' ? <p key={index}>{part.text}</p> : <span key={index}>{part.text}</span>)}</li>)}</ol>
        {live}
      </>)}
    </HistoryScroll></div>
  </>;
}
