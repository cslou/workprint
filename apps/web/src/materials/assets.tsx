import { Button as AriaButton } from 'react-aria-components';
import { StatusPill } from '../ui/status.js';
import { WorkspaceEmpty } from '../ui/panel.js';
import { ViewerDialog } from '../ui/overlays.js';
import { ManualVersionEditor } from '../versions/manual-editor.js';
import { savedTextTarget } from '../versions/targets.js';
import { VersionReview } from '../versions/review.js';
import { ReferenceSheet } from './sheet.js';
import { MediaReceipt } from '../ui/media-receipt.js';
import type { ScriptProps } from './script.js';
import { savedMaterialPresentation } from './content.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { assetLabels, type Version } from '@workprint/contracts';
import { useNearViewport } from '../ui/use-near-viewport.js';
import './assets.css';

export function Assets({ connection, scope, workspace, prerequisites, onSaved }: ScriptProps) {
  const rows = workspace.assets.flatMap((work) => {
    if (work.version.kind !== 'reference') return [];
    const facts = prerequisites?.presentations.find((item) => item.versionId === work.version.id && item.revision === work.version.revision) ?? savedMaterialPresentation(work.version);
    return facts?.name && facts.sheet ? [{ work, facts }] : [];
  });
  const media = workspace.assets.flatMap(work => { const version = work.version; return version.kind === 'image' || version.kind === 'video' ? [{ version, use: work.use, state: work.state }] : []; });
  if (!rows.length && !media.length) return <WorkspaceEmpty tab="assets" />;
  const labels = assetLabels(workspace.assets);
  // An image's viewer keeps its version history: an assistant edit is the image's next version.
  return <div className="wp-assets">{rows.map(({ work, facts }) => <ViewerDialog key={work.use?.id ?? work.version.artifactId} size="sheet" title={facts.name!} trigger={<AriaButton className="wp-asset-row">{facts.thumbnail ? <img src={facts.thumbnail.src} alt={facts.thumbnail.alt} /> : <span className="wp-asset-no-image" aria-hidden="true">No image</span>}<span><b>{facts.name}</b><small>{facts.description}</small></span><StatusPill state={work.state === 'Ready' ? 'ready' : 'draft'} /></AriaButton>}>
    <VersionReview connection={connection} scope={scope} version={work.version} binding={work.use?.binding.purpose === 'reference' ? work.use.binding : { purpose: 'reference' }} currentUse={work.use} selectionRevision={workspace.selectionRevision} {...(onSaved ? { onSaved } : {})} {...(prerequisites?.history ? { historyPrerequisite: prerequisites.history } : {})}>{(version, editable, selection) => {
      const exact = prerequisites?.presentations.find((item) => item.versionId === version.id && item.revision === version.revision) ?? savedMaterialPresentation(version);
      return exact?.sheet ? <ReferenceSheet sheet={exact.sheet} state={selection.currentUse?.versionId === version.id && selection.currentUse.state === 'approved' ? 'Ready' : 'Draft'} {...(savedTextTarget({ kind: 'reference-description' }).read(version) !== null ? { description: <ManualVersionEditor connection={connection} scope={scope} version={version} target={{ kind: 'reference-description' }} label="Description" currentUse={selection.currentUse} readOnly={!editable} onSaved={selection.onSaved} /> } : {})} /> : <WorkspaceEmpty tab="assets" />;
    }}</VersionReview>
  </ViewerDialog>)}{media.map(work => { const name = `${labels.get(work.version.artifactId) ?? (work.version.kind === 'video' ? 'Video' : 'Image')} · Version ${work.version.revision}`; return <ViewerDialog key={work.use?.id ?? work.version.id} title={name} trigger={<AriaButton className="wp-asset-row" data-media-version-id={work.version.id}>{work.version.kind === 'image' ? <AssetKeyImage connection={connection} version={work.version} /> : <span className="wp-asset-no-image" aria-hidden="true">Video</span>}<span><b>{name}</b><small>{work.version.media.width} × {work.version.media.height}</small></span></AriaButton>}>{close => work.version.kind === 'image' ? <VersionReview connection={connection} scope={scope} version={work.version} binding={{ purpose: 'reference' }} currentUse={work.use} selectionRevision={workspace.selectionRevision} {...(prerequisites?.history ? { historyPrerequisite: prerequisites.history } : {})}>{version => version.kind === 'image' ? <MediaReceipt connection={connection} version={version} close={close}/> : null}</VersionReview> : <MediaReceipt connection={connection} version={work.version} close={close}/>}</ViewerDialog>; })}</div>;
}

/**
 * An image row's key image, read through the owned-image read once the row is near view; the hidden Assets panel
 * reads nothing until it opens. Decorative: the row is named by its text. Media rows show no status pill: nothing
 * can approve or choose an image yet.
 */
function AssetKeyImage({ connection, version }: { connection: ScriptProps['connection']; version: Version }) {
  const [placeholder, near] = useNearViewport<HTMLSpanElement>();
  const image = useOwnedImage(connection, near ? version : null);
  return image.phase === 'ready' && image.url ? <img src={image.url} alt="" onError={image.fail} /> : <span ref={placeholder} className="wp-asset-no-image" aria-hidden="true">Image</span>;
}
