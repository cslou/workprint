import type { OperationResponse, Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';
import { PanelSection, WorkspaceEmpty } from '../ui/panel.js';
import { VersionEditor } from '../versions/editor.js';
import { VersionReview } from '../versions/review.js';
import type { MaterialPrerequisites, MaterialPresentation } from './presentation.js';
import './script.css';

type Workspace = OperationResponse<'workspace'>;
export type ScriptProps = { connection: BrowserClient; scope: ReadScope | null; workspace: Workspace; prerequisites?: MaterialPrerequisites };
function ScriptBody({ connection, scope, workspace, version, facts }: ScriptProps & { version: Version | null; facts?: MaterialPresentation }) {
  const current = !version || workspace.script?.version.id === version.id;
  const shots = current || facts ? [...workspace.storyboard.shots].sort((a, b) => a.order - b.order) : [];
  const ordered = new Set(shots.map((shot) => shot.order)).size === shots.length && new Set(shots.map((shot) => shot.shotId)).size === shots.length;
  const displayed = ordered ? shots.map((shot, index) => ({ shot, index, fact: facts?.shots?.find((fact) => fact.shotId === shot.shotId) })).filter(({ shot, fact }) => shot.intent || fact) : [];
  if (!facts?.sections?.length && !displayed.length && !facts?.look?.length) return <WorkspaceEmpty tab="script" />;
  return <div className="wp-script">
    {facts?.sections?.map((section) => section.field && version && 'content' in version && Object.hasOwn(version.content, section.field) && version.content[section.field] === section.text
      ? <VersionEditor key={section.label} connection={connection} scope={scope} version={version} field={section.field} label={section.label} />
      : <PanelSection key={section.label} title={section.label}><p>{section.text}</p></PanelSection>)}
    {displayed.length > 0 && <PanelSection title="Shots"><ol className="wp-script-shots">{displayed.map(({ shot, index, fact }) => <li key={shot.shotId} value={index + 1}>{fact ? <><b>{shot.intent ?? fact.title}</b><p>{fact.description}</p>{fact.dialogue && <p className="wp-script-dialogue">{fact.dialogue}</p>}</> : <p>{shot.intent}</p>}</li>)}</ol>{facts?.duration && <p className="wp-script-duration">{facts.duration}</p>}</PanelSection>}
    {!!facts?.look?.length && <PanelSection title="Look"><div className="wp-script-look">{facts.look.map((look) => <span key={look}>{look}</span>)}</div></PanelSection>}
  </div>;
}
export function Script({ connection, scope, workspace, prerequisites }: ScriptProps) {
  const work = workspace.script;
  if (!work || work.version.kind !== 'script') return <ScriptBody connection={connection} scope={scope} workspace={workspace} version={null} />;
  return <VersionReview connection={connection} scope={scope} version={work.version} currentUse={work.use} selectionRevision={workspace.selectionRevision} binding={{ purpose: 'script' }} {...(prerequisites?.history ? { historyPrerequisite: prerequisites.history } : {})}>{(version) => {
    const facts = prerequisites?.presentations.find((item) => item.versionId === version.id && item.revision === version.revision);
    return <ScriptBody connection={connection} scope={scope} workspace={workspace} version={version} {...(facts ? { facts } : {})} />;
  }}</VersionReview>;
}
