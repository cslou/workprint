import { useEffect, useRef, useState } from 'react';
import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
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
import './storyboard.css';

type Workspace = OperationResponse<'workspace'>;
const newer = (a: Workspace, b: Workspace) => a.selectionRevision > b.selectionRevision || (a.selectionRevision === b.selectionRevision && (a.storyboard.work?.version.revision ?? -1) > (b.storyboard.work?.version.revision ?? -1));
export type StoryboardProps = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace; prerequisites?: StoryboardPrerequisites };
export function Storyboard(props: StoryboardProps) {
  return <ScopedStoryboard key={JSON.stringify([props.scope?.accountId, props.scope?.conversationId, props.workspace.storyboard.work?.version.artifactId])} {...props} />;
}
function ScopedStoryboard({ connection, scope, workspace, prerequisites }: StoryboardProps) {
  const [refreshed, setRefreshed] = useState<Workspace | null>(null);
  const [drafts, setDrafts] = useState(new Map<string, PlanningDraft>());
  const [uses, setUses] = useState(new Map<string, OperationResponse<'useVersion'>>());
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
  const common = { connection, scope, workspace: current };
  const draftFor = (target: PlanningTarget) => {
    const key = JSON.stringify([base?.id, base?.revision, target]);
    return { value: drafts.get(key) ?? emptyPlanningDraft, onChange: (action: SetStateAction<PlanningDraft>) => setDrafts(previous => { const next = new Map(previous); next.set(key, typeof action === 'function' ? action(previous.get(key) ?? emptyPlanningDraft) : action); return next; }) };
  };
  const choices = { uses, onUsed: (panelId: string, value: OperationResponse<'useVersion'>) => setUses(previous => { const current = previous.get(panelId); if (current && current.selectionRevision >= value.selectionRevision) return previous; const next = new Map(previous); next.set(panelId, value); return next; }) };
  return <div className="wp-storyboard">
    <ViewerDialog trigger={<Button variant="secondary">View storyboard</Button>} title={facts?.title ? `Storyboard · ${facts.title}` : 'Storyboard'} size="board">
      <div className="wp-storyboard-board">{rows.map(({ shot, number, panels }) => <section className="wp-board-shot" key={shot.shotId} data-shot-id={shot.shotId}>
        <header><span className="wp-shot-number">{number}</span><b>{shot.intent ?? `Shot ${number}`}</b></header>
        <PlanningEditor {...common} target={{ kind: 'shot', shotId: shot.shotId }} draft={draftFor({ kind: 'shot', shotId: shot.shotId })} onEdited={edited} />
        <div className="wp-board-grid">{panels.map(({ panel, number: panelNumber }) => <section className="wp-board-panel" key={panel.panelId}><b>{number}.{panelNumber}</b><PlanningEditor {...common} target={{ kind: 'panel', shotId: shot.shotId, panelId: panel.panelId }} draft={draftFor({ kind: 'panel', shotId: shot.shotId, panelId: panel.panelId })} onEdited={edited} /><PanelVersions {...common} {...choices} shotId={shot.shotId} panel={panel} shotNumber={number} panelNumber={panelNumber} {...(facts ? { facts } : {})} /></section>)}</div>
      </section>)}</div>
    </ViewerDialog>
    {rows.map(({ shot, number, panels }) => {
      const fact = facts?.shots?.find(value => value.shotId === shot.shotId);
      return <details className="wp-storyboard-shot" key={shot.shotId} data-shot-id={shot.shotId} open><summary><span className="wp-shot-number">{number}</span><span className="wp-shot-title"><b>{shot.intent ?? `Shot ${number}`}</b><small>{fact?.duration ? `${fact.duration} · ` : ''}{panels.length} panel{panels.length === 1 ? '' : 's'}</small></span>{fact?.status && <span className={`wp-status wp-status-${fact.status.toLowerCase()}`}>{fact.status}</span>}<span className="wp-storyboard-chevron" aria-hidden="true">⌃</span></summary>
        <div className="wp-storyboard-body">{fact?.camera && <p className="wp-storyboard-camera">{fact.camera}</p>}{panels.map(({ panel, number: panelNumber }) => <div className="wp-storyboard-panel" key={panel.panelId} data-panel-id={panel.panelId}><span className="wp-panel-number">{number}.{panelNumber}</span><p>{panel.description}</p><PanelVersions {...common} {...choices} shotId={shot.shotId} panel={panel} shotNumber={number} panelNumber={panelNumber} {...(facts ? { facts } : {})} /></div>)}</div>
      </details>;
    })}
  </div>;
}
type PanelProps = Pick<StoryboardProps, 'connection' | 'scope' | 'workspace'> & { shotId: string; panel: Workspace['storyboard']['shots'][number]['panels'][number]; shotNumber: number; panelNumber: number; facts?: StoryboardPrerequisites; uses: ReadonlyMap<string, OperationResponse<'useVersion'>>; onUsed(panelId: string, value: OperationResponse<'useVersion'>): void };
function PanelVersions({ connection, scope, workspace, shotId, panel, shotNumber, panelNumber, facts, uses, onUsed }: PanelProps) {
  const used = uses.get(panel.panelId);
  const selected = used && used.selectionRevision > workspace.selectionRevision ? used : null;
  const versions = panel.candidateImageVersions;
  if (new Set(versions.map(version => version.id)).size !== versions.length) return null;
  return <div className="wp-panel-versions">{versions.filter(version => version.kind === 'image').map(version => <ViewerDialog key={version.id} trigger={<Button variant="quiet" aria-label={`View Panel ${shotNumber}.${panelNumber} version ${version.revision}`}>Version {version.revision}</Button>} title={`Panel ${shotNumber}.${panelNumber} · Version ${version.revision}`}>
    <PanelVersion connection={connection} scope={scope} version={version} caption={`Shot ${shotNumber} · Panel ${shotNumber}.${panelNumber} · Version ${version.revision}`} {...(facts ? { facts } : {})} />
    <VersionUse connection={connection} scope={scope} version={version} binding={{ purpose: 'panel_image', shotId, panelId: panel.panelId }} currentUse={selected?.use ?? null} selectedVersionId={selected?.use.versionId ?? panel.approvedImageVersionId} selectionRevision={selected?.selectionRevision ?? workspace.selectionRevision} presentation="viewer" onUsed={value => onUsed(panel.panelId, value)} />
  </ViewerDialog>)}</div>;
}
function PanelVersion({ connection, scope, version, caption, facts }: { connection: BrowserClient; scope: ReadScope | null; version: Version; caption: string; facts?: StoryboardPrerequisites }) {
  const read = useExactVersion(connection.kind === 'configured' ? connection.client : null, scope, version.id);
  const observed = read.kind === 'settled' && read.result.ok ? read.result.value : null;
  const visible = observed && observed.id === version.id && observed.kind === version.kind && observed.artifactId === version.artifactId && observed.revision === version.revision ? observed : version;
  const image = facts?.images?.find(value => value.versionId === visible.id && value.revision === visible.revision);
  return <div className="wp-panel-version" data-displayed-version-id={visible.id}>{image && <img src={image.src} alt={image.alt} />}<p>{caption}</p></div>;
}
