import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { currentPanelImage, type OperationResponse, type Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { Button } from '../ui/controls.js';
import { ViewerDialog } from '../ui/overlays.js';
import { WorkspaceEmpty } from '../ui/panel.js';
import { VersionUse } from '../versions/use.js';
import { useExactVersion } from '../versions/reads.js';
import { PlanningEditor, emptyPlanningDraft } from './planning-editor.js';
import type { PlanningDraft, PlanningTarget } from './planning-editor.js';
import type { SetStateAction } from 'react';
import { orderedStoryboard } from '../workspace/projection.js';
import type { StoryboardPrerequisites } from './presentation.js';
import { PanelImage, ShotText } from './shot-details.js';
import './storyboard.css';

type Workspace = OperationResponse<'workspace'>;
const newer = (a: Workspace, b: Workspace) => a.selectionRevision > b.selectionRevision || (a.selectionRevision === b.selectionRevision && (a.storyboard.work?.version.revision ?? -1) > (b.storyboard.work?.version.revision ?? -1));
export type StoryboardProps = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace; prerequisites?: StoryboardPrerequisites; onSaved?: (result: OperationResponse<'saveVersion'>) => void; onUsed?: (result: OperationResponse<'useVersion'>, version: Version) => void };
export function Storyboard(props: StoryboardProps) {
  return <ScopedStoryboard key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId, props.workspace.storyboard.work?.version.artifactId])} {...props} />;
}
function ScopedStoryboard({ connection, scope, workspace, prerequisites, onSaved, onUsed }: StoryboardProps) {
  const [refreshed, setRefreshed] = useState<Workspace | null>(null);
  const [drafts, setDrafts] = useState(new Map<string, PlanningDraft>());
  const [uses, setUses] = useState(new Map<string, PanelChoice>());
  const active = useRef(true);
  const latest = useRef(workspace); latest.current = workspace;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = refreshed && newer(refreshed, workspace) ? refreshed : workspace;
  const rows = orderedStoryboard(current.storyboard.shots);
  const base = current.storyboard.work?.version;
  const facts = base && prerequisites?.versionId === base.id && prerequisites.revision === base.revision ? prerequisites : undefined;
  const edited = async (result: OperationResponse<'editStoryboard'>) => {
    if (connection.kind !== 'configured' || !scope?.conversationId) return;
    const read = await connection.client.workspace({ params: { id: scope.conversationId }, query: {}, body: {} });
    if (!active.current) return;
    if (!read.ok) throw new Error('Updated Storyboard projection could not be loaded');
    const value = read.value, version = value.storyboard.work?.version;
    if (!version || version.id !== result.version.id || version.artifactId !== result.version.artifactId || version.revision !== result.version.revision || value.selectionRevision < Math.max(result.selectionRevision, latest.current.selectionRevision)) return;
    setRefreshed(previous => previous && !newer(value, previous) ? previous : value);
  };
  if (!rows?.length) return <WorkspaceEmpty tab="storyboard" />;
  const common = { connection, scope, workspace: current, ...(onSaved ? { onSaved } : {}) };
  const draftFor = (target: PlanningTarget) => {
    const key = JSON.stringify([base?.id, base?.revision, target]);
    return { value: drafts.get(key) ?? emptyPlanningDraft, onChange: (action: SetStateAction<PlanningDraft>) => setDrafts(previous => { const next = new Map(previous); next.set(key, typeof action === 'function' ? action(previous.get(key) ?? emptyPlanningDraft) : action); return next; }) };
  };
  const choices = { uses, onUsed: (panelId: string, choice: PanelChoice, version: Version) => { onUsed?.(choice.value, version); setUses(previous => { const current = previous.get(panelId); if (current && current.value.selectionRevision > choice.value.selectionRevision) return previous; const next = new Map(previous); next.set(panelId, choice); return next; }); } };
  return <div className="wp-storyboard">
    <ViewerDialog trigger={<Button variant="secondary"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="7" height="6" rx="1" /><rect x="14" y="4" width="7" height="6" rx="1" /><rect x="3" y="14" width="7" height="6" rx="1" /><rect x="14" y="14" width="7" height="6" rx="1" /></svg>View storyboard</Button>} title={facts?.title ? `Storyboard · ${facts.title}` : 'Storyboard'} size="board">
      <div className="wp-storyboard-board">{rows.map(({ shot, number, panels }) => <section className="wp-board-shot" key={shot.shotId} data-shot-id={shot.shotId}>
        <header><span className="wp-shot-number">{number}</span><b>{shot.intent ?? `Shot ${number}`}</b></header>
        <PlanningEditor {...common} target={{ kind: 'shot', shotId: shot.shotId }} draft={draftFor({ kind: 'shot', shotId: shot.shotId })} onEdited={edited} />
        <div className="wp-board-text"><ShotText workspace={current} shot={shot} camera={facts?.shots?.find(value => value.shotId === shot.shotId)?.camera} /></div>
        <div className="wp-board-grid">{panels.map(({ panel, number: panelNumber }) => <section className="wp-board-panel" key={panel.panelId} data-panel-id={panel.panelId}><PanelThumbnail {...common} {...choices} shotId={shot.shotId} panel={panel} shotNumber={number} panelNumber={panelNumber} {...(facts ? { facts } : {})} /><b>{number}.{panelNumber}</b><PlanningEditor {...common} target={{ kind: 'panel', shotId: shot.shotId, panelId: panel.panelId }} draft={draftFor({ kind: 'panel', shotId: shot.shotId, panelId: panel.panelId })} onEdited={edited} /><PanelVersions {...common} {...choices} shotId={shot.shotId} panel={panel} shotNumber={number} panelNumber={panelNumber} {...(facts ? { facts } : {})} /></section>)}</div>
      </section>)}</div>
    </ViewerDialog>
    {rows.map(({ shot, number, panels }) => {
      const fact = facts?.shots?.find(value => value.shotId === shot.shotId);
      return <details className="wp-storyboard-shot" key={shot.shotId} data-shot-id={shot.shotId} open><summary><span className="wp-shot-number">{number}</span><span className="wp-shot-title"><b>{shot.intent ?? `Shot ${number}`}</b><small>{shot.framing ? `${shot.framing} · ` : ''}{fact?.duration ? `${fact.duration} · ` : ''}{panels.length} panel{panels.length === 1 ? '' : 's'}</small></span>{fact?.status && <span className={`wp-status wp-status-${fact.status.toLowerCase()}`}>{fact.status}</span>}<svg className="wp-storyboard-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
        <div className="wp-storyboard-body">{panels.map(({ panel, number: panelNumber }) => <div className="wp-storyboard-panel" key={panel.panelId} data-panel-id={panel.panelId}><PanelThumbnail {...common} {...choices} shotId={shot.shotId} panel={panel} shotNumber={number} panelNumber={panelNumber} {...(facts ? { facts } : {})} /><div className="wp-storyboard-panel-text"><span className="wp-panel-number">{number}.{panelNumber}</span><PanelVersions {...common} {...choices} shotId={shot.shotId} panel={panel} shotNumber={number} panelNumber={panelNumber} {...(facts ? { facts } : {})} /></div></div>)}</div>
      </details>;
    })}
  </div>;
}
type PanelProps = Pick<StoryboardProps, 'connection' | 'scope' | 'workspace'> & { shotId: string; panel: Workspace['storyboard']['shots'][number]['panels'][number]; shotNumber: number; panelNumber: number; facts?: StoryboardPrerequisites; uses: ReadonlyMap<string, PanelChoice>; onUsed(panelId: string, choice: PanelChoice, version: Version): void };
/** A Panel-image approval leaves the selection revision unchanged, so a local acknowledgement applies only while the projection it was made against is current. */
type PanelChoice = { basis: string; value: OperationResponse<'useVersion'> };
function PanelVersions(props: PanelProps) {
  const { panel, shotNumber, panelNumber } = props;
  const versions = panel.candidateImageVersions;
  if (new Set(versions.map(version => version.id)).size !== versions.length) return null;
  return <div className="wp-panel-versions">{versions.filter(version => version.kind === 'image').map(version => <PanelViewer key={version.id} {...props} version={version} trigger={<Button variant="quiet" aria-label={`View Panel ${shotNumber}.${panelNumber} version ${version.revision}`}>Version {version.revision}</Button>} />)}</div>;
}
/** A panel's current image, or its planned slot; once an image exists, selecting it opens that version's viewer. */
function PanelThumbnail(props: PanelProps) {
  const { connection, panel, shotNumber, panelNumber } = props;
  const label = `Shot ${shotNumber} · Panel ${shotNumber}.${panelNumber}`;
  const image = <PanelImage connection={connection} panel={panel} label={label} />;
  const current = currentPanelImage(panel);
  if (current?.kind !== 'image') return image;
  // Keyed by the version it opens, so a newer current version closes an open viewer instead of swapping what it would approve.
  return <PanelViewer key={current.id} {...props} version={current} trigger={<AriaButton className="wp-panel-open" aria-label={`Open ${label}`}>{image}</AriaButton>} />;
}
/** One panel image version's viewer: the image, its caption, and choosing it for the panel. */
function PanelViewer({ connection, scope, workspace, shotId, panel, shotNumber, panelNumber, facts, uses, onUsed, version, trigger }: PanelProps & { version: Version; trigger: ReactElement }) {
  const used = uses.get(panel.panelId), basis = JSON.stringify([workspace.selectionRevision, panel.approvedImageVersionId]);
  const selected = used && (used.value.selectionRevision > workspace.selectionRevision || (used.value.selectionRevision === workspace.selectionRevision && used.basis === basis)) ? used.value : null;
  return <ViewerDialog trigger={trigger} title={`Panel ${shotNumber}.${panelNumber} · Version ${version.revision}`} size="wide">
    <PanelVersion connection={connection} scope={scope} version={version} caption={`Shot ${shotNumber} · Panel ${shotNumber}.${panelNumber} · Version ${version.revision}`} {...(facts ? { facts } : {})} />
    <VersionUse connection={connection} scope={scope} version={version} binding={{ purpose: 'panel_image', shotId, panelId: panel.panelId }} currentUse={selected?.use ?? null} selectedVersionId={selected?.use.versionId ?? panel.approvedImageVersionId} selectionRevision={selected?.selectionRevision ?? workspace.selectionRevision} presentation="viewer" onUsed={value => onUsed(panel.panelId, { basis, value }, version)} />
  </ViewerDialog>;
}
/** The viewed version's image: a display composition's supplied image, else the owned image read through the shared copy. */
function PanelVersion({ connection, scope, version, caption, facts }: { connection: BrowserClient; scope: ReadScope | null; version: Version; caption: string; facts?: StoryboardPrerequisites }) {
  const read = useExactVersion(connection.kind === 'configured' ? connection.client : null, scope, version.id);
  const observed = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const visible = observed && observed.id === version.id && observed.kind === version.kind && observed.artifactId === version.artifactId && observed.revision === version.revision ? observed : version;
  const supplied = facts?.images?.find(value => value.versionId === visible.id && value.revision === visible.revision);
  const owned = useOwnedImage(connection, !supplied && visible.kind === 'image' ? visible : null);
  const shown = supplied ? <img src={supplied.src} alt={supplied.alt} />
    : owned.phase === 'ready' && owned.url ? <img src={owned.url} alt={caption} onError={owned.fail} />
    : owned.phase === 'error' || owned.phase === 'expired' ? <span className="wp-panel-version-slot">This image couldn’t be shown</span>
    : <span className="wp-panel-version-slot wp-panel-loading" aria-hidden="true" />;
  return <div className="wp-panel-version" data-displayed-version-id={visible.id}>{shown}<p>{caption}</p></div>;
}
