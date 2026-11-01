import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { createUploadSession, nativeConversations, type UploadSession } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { DraftGuard } from '../api/draft-guard.js';
import { Button } from '../ui/controls.js';
import type { WorkspaceTab } from '../ui/panel.js';
import { Library } from '../library/library.js';
import { LibraryPicker } from '../library/picker.js';
import { createLibrarySelection } from '../library/selection.js';
import type { LibraryPrerequisites } from '../library/picker.js';
import { MaterialPanel } from '../materials/panel.js';
import type { MaterialPrerequisites } from '../materials/presentation.js';
import { Storyboard } from '../storyboard/storyboard.js';
import type { StoryboardPrerequisites } from '../storyboard/presentation.js';
import type { VideoPrerequisites } from '../videos/videos.js';
import { WorkspaceVideos } from './workspace-videos.js';
import { Composer } from '../conversation/composer.js';
import { createChatSession, type ChatSession } from '../conversation/chat-session.js';
import { useChatSnapshot } from '../conversation/use-chat.js';
import { LiveTurns } from '../conversation/live-turns.js';
import { QuestionReview } from '../conversation/question.js';
import { useWorkspace } from './workspace.js';
import { WorkspaceReadPlaceholder } from './workspace-placeholder.js';
import { NativeHistory, RecentRows, Recents } from './native-views.js';
import { SkeletonRows, usePlaceholder } from '../ui/skeleton.js';
import { Welcome } from './welcome.js';
import type { NativeNavigationState } from './use-native-navigation.js';
import './shell.css';

export type SessionPresentation = { accountId: string; name: string };
export type ShellProps = { navigation?: NativeNavigationState; onAccountOpen?: () => void; connection: BrowserClient; session: SessionPresentation | null; conversationId?: string; workspaceContent?: (workspace: OperationResponse<'workspace'>) => Partial<Record<WorkspaceTab, ReactNode>>; materialPrerequisites?: MaterialPrerequisites; storyboardPrerequisites?: StoryboardPrerequisites; videoPrerequisites?: VideoPrerequisites; libraryPrerequisites?: LibraryPrerequisites };
type Surface = 'account' | 'account-unavailable' | 'navigation' | 'library' | 'new' | 'recents' | null;
const nativeCopy = { new: ['New video is not available yet.', 'No conversation was created.'], recents: ['Recents are not available yet.', 'No conversation list was loaded.'] } as const;

/** Session is supplied by its qualified owner; this shell never creates or persists one. */
export function Shell(props: ShellProps) {
  const [uploadSession] = useState(() => createUploadSession());
  useLayoutEffect(() => () => uploadSession.dispose(), [uploadSession]);
  // An owned shell re-scopes when the user opens or starts a video, not when a new video's first send saves it.
  return <DraftGuard key={JSON.stringify([props.session?.accountId ?? null, props.navigation ? props.navigation.scope : props.conversationId ?? null])}><ScopedShell uploadSession={uploadSession} {...props} /></DraftGuard>;
}
function ScopedShell({ navigation, onAccountOpen, connection, session, conversationId, workspaceContent, materialPrerequisites, storyboardPrerequisites, videoPrerequisites, libraryPrerequisites, uploadSession }: ShellProps & { uploadSession: UploadSession }) {
  const [surface, setSurface] = useState<Surface>(null);
  const [tab, setTab] = useState<WorkspaceTab>('script');
  const [composerText, setComposerText] = useState('');
  const draft = { value: composerText, onChange: setComposerText };
  const dialogHead = useRef<HTMLDivElement>(null);
  const shown = navigation?.dialog ?? surface;
  const dismiss = () => { if (navigation?.dialog) navigation.dismiss(); setSurface(null); };
  useLayoutEffect(() => { if (shown) dialogHead.current?.querySelector('button')?.focus(); }, [shown]);
  // New video may remount this shell, removing the focused control; land focus on the opening composer instead.
  const main = useRef<HTMLElement>(null), started = navigation?.started ?? 0, opening = !navigation?.history;
  useEffect(() => {
    if (!started || !opening) return;
    const frame = requestAnimationFrame(() => { if (!document.querySelector('[role="dialog"]')) main.current?.querySelector<HTMLElement>('.wp-chat-input')?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [started, opening]);
  const qualifiedId = navigation && !navigation.history?.thread ? undefined : conversationId;
  const scope = session ? { accountId: session.accountId, ...(qualifiedId === undefined ? {} : { conversationId: qualifiedId }) } : null;
  const workspace = useWorkspace(connection, scope);
  const libraryConnection = useRef(connection); libraryConnection.current = connection;
  // A restored thread qualifies the workspace scope without remounting; read its current receipt handler.
  const libraryUsed = useRef(workspace.onUsed); libraryUsed.current = workspace.onUsed;
  const libraryConversation = useRef(conversationId); libraryConversation.current = conversationId;
  const [librarySelection] = useState(() => createLibrarySelection({ getClient: () => libraryConnection.current.kind === 'configured' ? libraryConnection.current.client : null, getConversationId: () => libraryConversation.current, onUsed: (result, version) => libraryUsed.current(result, version) }));
  useEffect(() => () => librarySelection.dispose(), [librarySelection]);
  const native = connection.kind === 'configured' ? connection.client.native : nativeConversations;
  // One chat per scope. Its callbacks read the current navigation; unmounting disposes it, so late events go nowhere.
  const live = useRef({ navigation, setComposerText }); live.current = { navigation, setComposerText };
  const [chat] = useState<ChatSession | null>(() => navigation && session && connection.kind === 'configured' ? createChatSession({
    native, accountId: session.accountId, ...(navigation.history ? { conversationId: navigation.history.id } : {}),
    knownMessageIds: () => new Set(live.current.navigation?.history?.messages.map(message => message.id)),
    clearDraft: () => live.current.setComposerText(''),
    onStarted: thread => live.current.navigation?.adopt(thread),
    onConfirmed: (thread, page) => { const current = live.current.navigation, saved = thread ?? current?.history?.thread; if (saved) current?.adopt(saved, page); },
  }) : null);
  useLayoutEffect(() => () => chat?.dispose(), [chat]);
  const chatState = useChatSnapshot(chat);
  // Send once the open video's saved history is shown, so the reply lands after it and a re-read can tell old from new.
  const sendBlocked = !!navigation?.history && navigation.history.kind !== 'ready';
  const liveTurns = <LiveTurns turns={chatState.turns} canRetry={chatState.phase === 'idle'} onRetry={key => void chat?.retry(key)} />;
  const runNative = async (action: 'new' | 'recents') => {
    if (!session && onAccountOpen && connection.kind === 'configured') { onAccountOpen(); return; }
    if (navigation) { setSurface(null); if (action === 'new') navigation.startNew(); else navigation.openRecents(); return; }
    const method = { new: 'createConversation', recents: 'listConversations' } as const;
    await native[method[action]]();
    setSurface(action);
  };
  const accountName = session?.name ?? 'Account';
  const nav = (popup = false) => <>
    <AriaButton className={`wp-nav-item${navigation?.history || navigation && popup ? '' : ' current'}`} onPress={() => void runNative('new')}><svg className="wp-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>New video</AriaButton>
    <AriaButton className="wp-nav-item wp-library-nav" onPress={() => setSurface('library')}><svg className="wp-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="9" y="4" width="4" height="16" rx="1" /><path d="m15.5 5.2 3.8-1 3 15.6-3.8.9Z" /></svg>Library</AriaButton>
  </>;
  const quick = navigation?.quick ?? (navigation?.history?.thread ? [navigation.history.thread] : []);
  const sidebarPlaceholder = usePlaceholder(!!navigation && navigation.quick === null && !navigation.recents.value && !navigation.recents.failed);
  const recent = <><AriaButton className="wp-nav-label" onPress={() => void runNative('recents')}>Recents</AriaButton>{navigation && session ? sidebarPlaceholder.active ? <>{sidebarPlaceholder.visible && <p className="wp-sr-only" role="status">Loading Recents…</p>}<SkeletonRows count={4} compact visible={sidebarPlaceholder.visible} /></> : <>{quick.length > 0 && <RecentRows threads={quick} navigation={navigation} compact />}{navigation.recents.failed && !navigation.recents.value && <p className="wp-recents-empty">Recents couldn’t be loaded.</p>}{navigation.recents.value && !quick.length && <p className="wp-recents-empty">No videos yet.</p>}</> : <p className="wp-recents-empty">No videos yet.</p>}</>;
  const account = <AriaButton className="wp-account" onPress={() => { if (onAccountOpen) { setSurface(null); onAccountOpen(); } else setSurface('account'); }}><span className="wp-avatar" aria-hidden="true">{session ? session.name.slice(0, 1).toUpperCase() : ''}</span><span>{accountName}</span></AriaButton>;
  const projection = workspace.kind === 'settled' && workspace.result.ok ? workspace.result.value : null;
  const content = projection ? workspaceContent?.(projection) : undefined;
  const placeholder = workspace.kind === 'loading' ? <WorkspaceReadPlaceholder state="loading" /> : workspace.failure ? <WorkspaceReadPlaceholder state={workspace.failure} /> : undefined;
  const title = shown === 'navigation' ? 'Navigation' : shown === 'library' ? 'Library' : shown === 'new' ? 'New video' : shown === 'recents' ? 'Recents' : 'Account';
  return <>
    <div className={`wp-shell${navigation ? ' wp-owned-shell' : ''}`}>
      <nav className="wp-sidebar" aria-label="Workprint">
        <div className="wp-brand"><span className="wp-mark">a</span><span>Workprint</span></div>
        <div className="wp-nav-list">{nav()}<span className="wp-menu"><Button variant="secondary" onPress={() => { setSurface('navigation'); if (navigation && session) void navigation.list(); }}>Menu</Button></span></div>
        <div className="wp-recents" aria-busy={!!navigation?.recents.pending || sidebarPlaceholder.active}>{recent}</div><div className="wp-sidebar-spacer" />{account}
      </nav>
      <main ref={main} className="wp-main" data-layout={!chatState.turns.length && (!navigation?.history || navigation.history.kind === 'ready' && navigation.history.messages.length === 0) ? 'opening' : 'thread'} aria-label={navigation?.history ? 'Conversation' : 'New video'} aria-busy={navigation?.history ? navigation.history.kind === 'loading' : workspace.kind === 'loading'}>
        {navigation?.history ? <NativeHistory state={navigation.history} navigation={navigation} live={chatState.turns.length ? liveTurns : null} /> : <div className="wp-thread"><Welcome owned={!!(navigation && session)} /></div>}
        {workspace.kind === 'settled' && workspace.result.ok && workspace.result.value.pendingQuestion ? <QuestionReview uploadSession={uploadSession} onUploaded={workspace.onUploaded} connection={connection} scope={scope} question={workspace.result.value.pendingQuestion} workspace={workspace.result.value} draft={draft} /> : <Composer uploadSession={uploadSession} onUploaded={workspace.onUploaded} native={native} chat={chat} sendBlocked={sendBlocked} draft={draft} connection={connection} scope={scope} />}
      </main>
      <aside className="wp-workspace" aria-label="This video"><MaterialPanel connection={connection} scope={scope} workspace={projection} onSaved={workspace.onSaved} {...(projection ? { additionalContent: { storyboard: <Storyboard connection={connection} scope={scope} workspace={projection} onSaved={workspace.onSaved} onUsed={workspace.onUsed} {...(storyboardPrerequisites ? { prerequisites: storyboardPrerequisites } : {})} />, videos: <WorkspaceVideos connection={connection} scope={scope} workspace={projection} onUsed={workspace.onUsed} {...(videoPrerequisites ? { videoPrerequisites } : {})} /> } } : {})} {...(materialPrerequisites ? { prerequisites: materialPrerequisites } : {})} placeholder={placeholder} selectedKey={tab} onSelectionChange={(key) => setTab(key as WorkspaceTab)} {...(content === undefined ? {} : { contentOverride: content })} /></aside>
    </div>
    <ModalOverlay className="wp-modal-overlay" isOpen={shown !== null} onOpenChange={(open) => { if (!open) dismiss(); }} isDismissable><Modal className={`wp-modal${navigation && (navigation.dialog || shown === 'navigation') ? ' wp-native-dialog' : ''}`}><Dialog className="wp-dialog"><div className="wp-dialog-head" ref={dialogHead}><Heading slot="title">{title}</Heading><Button variant="icon" aria-label="Close" autoFocus onPress={dismiss}>×</Button></div>
      {shown === 'navigation' && (navigation && session ? <div className="wp-owned-navigation"><div className="wp-navigation-dialog wp-owned-navigation-links">{nav(true)}</div><h3>Recents</h3><Recents navigation={navigation} embedded onActivate={() => setSurface(null)} /><div className="wp-navigation-dialog wp-owned-navigation-account">{account}</div></div> : <div className="wp-navigation-dialog">{nav()}{recent}{account}</div>)}
      {navigation?.dialog === 'recents' && <Recents navigation={navigation} />}
      {surface === 'account' && <div className="wp-session-content"><p><b>{session?.name ?? 'Not signed in'}</b></p>{session ? <div className="wp-session-actions"><Button variant="secondary" onPress={() => setSurface('account-unavailable')}>Sign out</Button><Button variant="secondary" onPress={() => setSurface('account-unavailable')}>Switch account</Button></div> : <><p>Sign-in is not available yet.</p><div className="wp-session-actions"><Button isDisabled size="choose">Sign in</Button></div></>}</div>}
      {surface === 'account-unavailable' && <p className="wp-session-message" role="status">Account actions are not available yet. Nothing about your session has changed.</p>}
      {!navigation && (surface === 'new' || surface === 'recents') && <div className="wp-session-content" role="status">{nativeCopy[surface].map((line) => <p key={line}>{line}</p>)}</div>}
      {surface === 'library' && <Library connection={connection} scope={scope}>{(library, pagination, windowOffset, filter) => <LibraryPicker filter={filter} selection={librarySelection} connection={connection} scope={scope} library={library} pagination={pagination} windowOffset={windowOffset} {...(libraryPrerequisites === undefined ? {} : { prerequisites: libraryPrerequisites })} />}</Library>}
    </Dialog></Modal></ModalOverlay>
  </>;
}
