import { Button as AriaButton } from 'react-aria-components';
import { StatusPill } from '../ui/status.js';
import { WorkspaceEmpty } from '../ui/panel.js';
import { ViewerDialog } from '../ui/overlays.js';
import { VersionReview } from '../versions/review.js';
import { ReferenceSheet } from './sheet.js';
import type { ScriptProps } from './script.js';
import { savedMaterialPresentation } from './content.js';
import './assets.css';

export function Assets({ connection, scope, workspace, prerequisites }: ScriptProps) {
  const rows = workspace.assets.flatMap((work) => {
    if (work.version.kind !== 'reference') return [];
    const facts = prerequisites?.presentations.find((item) => item.versionId === work.version.id && item.revision === work.version.revision) ?? savedMaterialPresentation(work.version);
    return facts?.name && facts.sheet ? [{ work, facts }] : [];
  });
  if (!rows.length) return <WorkspaceEmpty tab="assets" />;
  return <div className="wp-assets">{rows.map(({ work, facts }) => <ViewerDialog key={work.version.id} size="sheet" title={facts.name!} trigger={<AriaButton className="wp-asset-row">{facts.thumbnail ? <img src={facts.thumbnail.src} alt={facts.thumbnail.alt} /> : <span className="wp-asset-no-image" aria-hidden="true">No image</span>}<span><b>{facts.name}</b><small>{facts.description}</small></span><StatusPill state={work.state === 'Ready' ? 'ready' : 'draft'} /></AriaButton>}>
    <VersionReview connection={connection} scope={scope} version={work.version} binding={work.use?.binding.purpose === 'reference' ? work.use.binding : { purpose: 'reference' }} currentUse={work.use} selectionRevision={workspace.selectionRevision} {...(prerequisites?.history ? { historyPrerequisite: prerequisites.history } : {})}>{(version) => {
      const exact = prerequisites?.presentations.find((item) => item.versionId === version.id && item.revision === version.revision) ?? savedMaterialPresentation(version);
      return exact?.sheet ? <ReferenceSheet sheet={exact.sheet} state={work.use?.versionId === version.id && work.use.state === 'approved' ? 'Ready' : 'Draft'} /> : <WorkspaceEmpty tab="assets" />;
    }}</VersionReview>
  </ViewerDialog>)}</div>;
}
