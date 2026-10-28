import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button as AriaButton, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { nativeConversations } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { Button } from '../ui/controls.js';
import type { WorkspaceTab } from '../ui/panel.js';
import { Library } from '../library/library.js';
import { LibraryPicker } from '../library/picker.js';
import type { LibraryPrerequisites } from '../library/picker.js';
import { MaterialPanel } from '../materials/panel.js';
import type { MaterialPrerequisites } from '../materials/presentation.js';
import { Storyboard } from '../storyboard/storyboard.js';
import type { StoryboardPrerequisites } from '../storyboard/presentation.js';
import { Videos, type VideoPrerequisites } from '../videos/videos.js';
import { Composer } from '../conversation/composer.js';
import { QuestionReview } from '../conversation/question.js';
import { useWorkspace } from './workspace.js';
import { WorkspaceReadPlaceholder } from './workspace-placeholder.js';
import './shell.css';

export type SessionPresentation = { accountId: string; name: string };
export type ShellProps = { connection: BrowserClient; session: SessionPresentation | null; conversationId?: string; workspaceContent?: (workspace: OperationResponse<'workspace'>) => Partial<Record<WorkspaceTab, ReactNode>>; materialPrerequisites?: MaterialPrerequisites; storyboardPrerequisites?: StoryboardPrerequisites; videoPrerequisites?: VideoPrerequisites; libraryPrerequisites?: LibraryPrerequisites };
type Surface = 'account' | 'account-unavailable' | 'navigation' | 'library' | 'new' | 'recents' | 'load' | null;
const nativeCopy = { new: ['New video is not available yet.', 'No conversation was created.'], recents: ['Recents are not available yet.', 'No conversation list was loaded.'], load: ['Conversation loading is not available yet.', 'The current workspace is unchanged.'] } as const;

/** Session is supplied by its qualified owner; this shell never creates or persists one. */
export function Shell(props: ShellProps) {
  return <ScopedShell key={JSON.stringify([props.session?.accountId ?? null, props.conversationId ?? null])} {...props} />;
}
function ScopedShell({ connection, session, conversationId, workspaceContent, materialPrerequisites, storyboardPrerequisites, videoPrerequisites, libraryPrerequisites }: ShellProps) {
  const [surface, setSurface] = useState<Surface>(null);
  const [tab, setTab] = useState<WorkspaceTab>('script');
  const [composerText, setComposerText] = useState('');
  const draft = { value: composerText, onChange: setComposerText };
  const dialogHead = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (surface) dialogHead.current?.querySelector('button')?.focus(); }, [surface]);
  const scope = session ? { accountId: session.accountId, ...(conversationId === undefined ? {} : { conversationId }) } : null;
  const workspace = useWorkspace(connection, scope);
  const native = connection.kind === 'configured' ? connection.client.native : nativeConversations;
  const runNative = async (action: 'new' | 'recents' | 'load') => {
    const method = { new: 'createConversation', recents: 'listConversations', load: 'loadConversation' } as const;
    await native[method[action]]();
    setSurface(action);
  };
  const accountName = session?.name ?? 'Account';
  const nav = () => <>
    <AriaButton className="wp-nav-item current" onPress={() => void runNative('new')}><svg className="wp-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>New video</AriaButton>
    <AriaButton className="wp-nav-item wp-library-nav" onPress={() => setSurface('library')}><svg className="wp-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="4" height="16" rx="1" /><rect x="9" y="4" width="4" height="16" rx="1" /><path d="m15.5 5.2 3.8-1 3 15.6-3.8.9Z" /></svg>Library</AriaButton>
  </>;
  const recent = <><AriaButton className="wp-nav-label" onPress={() => void runNative('recents')}>Recents</AriaButton><p className="wp-recents-empty">No videos yet.</p>{conversationId && <AriaButton className="wp-nav-item" onPress={() => void runNative('load')}>Open conversation</AriaButton>}</>;
  const account = <AriaButton className="wp-account" onPress={() => setSurface('account')}><span className="wp-avatar" aria-hidden="true">{session ? session.name.slice(0, 1) : ''}</span><span>{accountName}</span></AriaButton>;
  const projection = workspace.kind === 'settled' && workspace.result.ok ? workspace.result.value : null;
  const content = projection ? workspaceContent?.(projection) : undefined;
  const placeholder = workspace.kind === 'loading' ? <WorkspaceReadPlaceholder state="loading" /> : workspace.failure ? <WorkspaceReadPlaceholder state={workspace.failure} /> : undefined;
  const title = surface === 'navigation' ? 'Navigation' : surface === 'library' ? 'Library' : surface === 'new' ? 'New video' : surface === 'recents' ? 'Recents' : surface === 'load' ? 'Open conversation' : 'Account';
  return <>
    <div className="wp-shell">
      <nav className="wp-sidebar" aria-label="Workprint">
        <div className="wp-brand"><span className="wp-mark">a</span><span>Workprint</span></div>
        <div className="wp-nav-list">{nav()}<span className="wp-menu"><Button variant="secondary" onPress={() => setSurface('navigation')}>Menu</Button></span></div>
        <div className="wp-recents">{recent}</div><div className="wp-sidebar-spacer" />{account}
      </nav>
      <main className="wp-main" aria-label="New video" aria-busy={workspace.kind === 'loading'}>
        <div className="wp-thread"><div className="wp-welcome"><h1>What would you like to make?</h1><p className="wp-lead">Describe the moment you want to see. Rough is fine; I'll ask about anything I need.</p><div className="wp-hints" aria-label="Things that help">{["Who's in it", 'Where it happens', 'What happens', 'Anything they say', 'Look or mood'].map((hint) => <span key={hint}>{hint}</span>)}</div><p className="wp-aside-note">Have photos of the people or places? You can attach them now or later.</p></div></div>
        {workspace.kind === 'settled' && workspace.result.ok && workspace.result.value.pendingQuestion ? <QuestionReview connection={connection} scope={scope} question={workspace.result.value.pendingQuestion} workspace={workspace.result.value} draft={draft} /> : <Composer native={native} draft={draft} connection={connection} scope={scope} />}
      </main>
      <aside className="wp-workspace" aria-label="This video"><MaterialPanel connection={connection} scope={scope} workspace={projection} {...(projection ? { additionalContent: { storyboard: <Storyboard connection={connection} scope={scope} workspace={projection} {...(storyboardPrerequisites ? { prerequisites: storyboardPrerequisites } : {})} />, videos: <Videos connection={connection} scope={scope} workspace={projection} {...(videoPrerequisites ? { prerequisites: videoPrerequisites } : {})} /> } } : {})} {...(materialPrerequisites ? { prerequisites: materialPrerequisites } : {})} placeholder={placeholder} selectedKey={tab} onSelectionChange={(key) => setTab(key as WorkspaceTab)} {...(content === undefined ? {} : { contentOverride: content })} /></aside>
    </div>
    <ModalOverlay className="wp-modal-overlay" isOpen={surface !== null} onOpenChange={(open) => { if (!open) setSurface(null); }} isDismissable><Modal className="wp-modal"><Dialog className="wp-dialog"><div className="wp-dialog-head" ref={dialogHead}><Heading slot="title">{title}</Heading><Button variant="icon" aria-label="Close" autoFocus onPress={() => setSurface(null)}>×</Button></div>
      {surface === 'navigation' && <div className="wp-navigation-dialog">{nav()}{recent}{account}</div>}
      {surface === 'account' && <div className="wp-session-content"><p><b>{session?.name ?? 'Not signed in'}</b></p>{session ? <div className="wp-session-actions"><Button variant="secondary" onPress={() => setSurface('account-unavailable')}>Sign out</Button><Button variant="secondary" onPress={() => setSurface('account-unavailable')}>Switch account</Button></div> : <><p>Sign-in is not available yet.</p><div className="wp-session-actions"><Button isDisabled size="choose">Sign in</Button></div></>}</div>}
      {surface === 'account-unavailable' && <p className="wp-session-message" role="status">Account actions are not available yet. Nothing about your session has changed.</p>}
      {(surface === 'new' || surface === 'recents' || surface === 'load') && <div className="wp-session-content" role="status">{nativeCopy[surface].map((line) => <p key={line}>{line}</p>)}</div>}
      {surface === 'library' && <Library connection={connection} scope={scope}>{(library) => <LibraryPicker connection={connection} scope={scope} library={library} {...(libraryPrerequisites === undefined ? {} : { prerequisites: libraryPrerequisites })} />}</Library>}
    </Dialog></Modal></ModalOverlay>
  </>;
}
