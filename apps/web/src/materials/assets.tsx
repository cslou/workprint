import { Button as AriaButton } from 'react-aria-components';
import { assetLabels, currentSheets, mediaVersionName, sheetViews, subjectGroups, type OperationResponse, type Version } from '@workprint/contracts';
import { WorkspaceEmpty } from '../ui/panel.js';
import { ViewerDialog } from '../ui/overlays.js';
import { ManualVersionEditor } from '../versions/manual-editor.js';
import { savedTextTarget } from '../versions/targets.js';
import { VersionReview } from '../versions/review.js';
import { ReferenceSheet } from './sheet.js';
import { MediaReceipt } from '../ui/media-receipt.js';
import type { ScriptProps } from './script.js';
import { kindLabel, savedMaterialPresentation, shotsLabel } from './content.js';
import type { MaterialPresentation } from './presentation.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { useNearViewport } from '../ui/use-near-viewport.js';
import { useSavedMedia } from '../versions/use-saved-media.js';
import { subjectShotNumbers } from '../workspace/projection.js';
import './assets.css';

type Workspace = OperationResponse<'workspace'>;
type Work = Workspace['assets'][number];
type Sheet = MaterialPresentation & { sheet: NonNullable<MaterialPresentation['sheet']> };
type Presented = { work: Work; facts?: Sheet };

/** What a reference version shows: its supplied or validated presentation, only when it is a sheet with a name. */
const presentation = (prerequisites: ScriptProps['prerequisites'], version: Version) => {
  const facts = prerequisites?.presentations.find((item) => item.versionId === version.id && item.revision === version.revision) ?? savedMaterialPresentation(version);
  return facts?.name && facts.sheet ? facts as Sheet : undefined;
};

/**
 * Assets by subject (the shared `subjectGroups` rule): each script subject in Assets order with its sheets, then its
 * other images; then "Other", only when it shows something. Nothing shows a status pill, as in the demo's subject
 * rows without their pill: nothing approves a sheet or image yet. A subject with nothing to show reads Empty.
 */
export function Assets(props: ScriptProps) {
  const { workspace, prerequisites } = props;
  // Only rows that render count: a reference that isn't a sheet shows nothing, as before subjects.
  const shown = (work: Work): Presented[] => {
    if (work.version.kind === 'image' || work.version.kind === 'video') return [{ work }];
    const facts = work.version.kind === 'reference' ? presentation(prerequisites, work.version) : undefined;
    return facts ? [{ work, facts }] : [];
  };
  const groups = subjectGroups(workspace).map(group => ({ subject: group.subject, sheets: group.sheets.flatMap(shown), items: group.items.flatMap(shown) }))
    .map(group => ({ ...group, empty: !group.sheets.length && !group.items.length })).filter(group => group.subject || !group.empty);
  if (!groups.length) return <WorkspaceEmpty tab="assets" />;
  const names = { labels: assetLabels(workspace.assets), views: sheetViews(workspace), sheets: new Map(currentSheets(workspace).map(sheet => [sheet.versionId, sheet.subjectName])) };
  const row = ({ work, facts }: Presented) => facts ? <SheetRow key={work.use?.id ?? work.version.id} {...props} work={work} facts={facts} subjectName={names.sheets.get(work.version.id)} />
    : <MediaRow key={work.use?.id ?? work.version.id} {...props} work={work} name={mediaVersionName(names.labels, work.version, names.views)} />;
  return <div className="wp-assets">{groups.map(group => {
    const title = group.subject?.name ?? 'Other';
    const shots = group.subject ? shotsLabel(subjectShotNumbers(workspace.storyboard.shots, group.subject.id)) : '';
    return <section key={group.subject?.id ?? ''} className="wp-subject" aria-label={title}>
      <div className="wp-subject-entry"><span><b>{title}</b>{group.subject && <small>{kindLabel[group.subject.kind]}{shots && ` · ${shots}`}</small>}</span>{group.empty && <span className="wp-subject-empty">Empty</span>}</div>
      {group.sheets.map(row)}{group.items.map(row)}
    </section>;
  })}</div>;
}

/**
 * A sheet's row and its opened sheet, both named by the subject's current script name (or the sheet's own when the
 * script doesn't list it); the sheet shows its views.
 */
function SheetRow({ connection, scope, workspace, prerequisites, onSaved, work, facts, subjectName }: ScriptProps & { work: Work; facts: Sheet; subjectName: string | undefined }) {
  const views = facts.sheet.views ?? [];
  const subject = subjectName ?? facts.name ?? facts.sheet.name;
  const name = `${subject} · Version ${work.version.revision}`;
  const key = facts.thumbnail ? <img src={facts.thumbnail.src} alt={facts.thumbnail.alt} /> : views[0] ? <SheetKeyImage connection={connection} scope={scope} workspace={workspace} versionId={views[0].versionId} /> : <span className="wp-asset-no-image" aria-hidden="true">No image</span>;
  return <ViewerDialog size="sheet" title={name} trigger={<AriaButton className="wp-asset-row" data-sheet-version-id={work.version.id}>{key}<span><b>{name}</b><small>{`${facts.description} sheet · ${views.length} ${views.length === 1 ? 'view' : 'views'}`}</small></span></AriaButton>}>
    <VersionReview connection={connection} scope={scope} version={work.version} binding={work.use?.binding.purpose === 'reference' ? work.use.binding : { purpose: 'reference' }} currentUse={work.use} selectionRevision={workspace.selectionRevision} {...(onSaved ? { onSaved } : {})} {...(prerequisites?.history ? { historyPrerequisite: prerequisites.history } : {})}>{(version, editable, selection) => {
      const exact = presentation(prerequisites, version);
      const shown = exact?.sheet.views?.length ? exact.sheet.views.map(view => <SheetView key={view.versionId} connection={connection} scope={scope} workspace={workspace} versionId={view.versionId} view={view.view} />) : undefined;
      return exact ? <ReferenceSheet sheet={{ ...exact.sheet, name: subject }} views={shown} {...(savedTextTarget({ kind: 'reference-description' }).read(version) !== null ? { description: <ManualVersionEditor connection={connection} scope={scope} version={version} target={{ kind: 'reference-description' }} label="Description" currentUse={selection.currentUse} readOnly={!editable} onSaved={selection.onSaved} /> } : {})} /> : <WorkspaceEmpty tab="assets" />;
    }}</VersionReview>
  </ViewerDialog>;
}

/** An image or video row: today's name and size; an image's viewer keeps its version history. */
function MediaRow({ connection, scope, workspace, prerequisites, work, name }: ScriptProps & { work: Work; name: string }) {
  const version = work.version;
  if (version.kind !== 'image' && version.kind !== 'video') return null;
  return <ViewerDialog title={name} trigger={<AriaButton className="wp-asset-row" data-media-version-id={version.id}>{version.kind === 'image' ? <AssetKeyImage connection={connection} version={version} /> : <span className="wp-asset-no-image" aria-hidden="true">Video</span>}<span><b>{name}</b><small>{version.media.width} × {version.media.height}</small></span></AriaButton>}>{close => version.kind === 'image' ? <VersionReview connection={connection} scope={scope} version={version} binding={{ purpose: 'reference' }} currentUse={work.use} selectionRevision={workspace.selectionRevision} {...(prerequisites?.history ? { historyPrerequisite: prerequisites.history } : {})}>{shown => shown.kind === 'image' ? <MediaReceipt connection={connection} version={shown} close={close}/> : null}</VersionReview> : <MediaReceipt connection={connection} version={version} close={close}/>}</ViewerDialog>;
}

/**
 * One view in an open sheet: its image, read once near view through the shared owned-image read, captioned with its
 * view. Selecting it opens the image viewer on that exact version. An image that can't be read says so in its slot only.
 */
function SheetView({ connection, scope, workspace, versionId, view }: Pick<ScriptProps, 'connection' | 'scope' | 'workspace'> & { versionId: string; view: string }) {
  const [slot, near] = useNearViewport<HTMLElement>();
  const { version, settled } = useSavedMedia(connection, scope, workspace, versionId, 'image');
  const image = useOwnedImage(connection, near ? version : null);
  const failed = (settled && !version) || image.phase === 'error' || image.phase === 'expired';
  const label = version ? mediaVersionName(assetLabels(workspace.assets), version, sheetViews(workspace)) : view;
  const picture = image.phase === 'ready' && image.url ? <img src={image.url} alt={label} onError={image.fail} /> : <span className="wp-sheet-view-slot" aria-hidden="true" />;
  return <figure data-view-version-id={versionId}>
    {failed || !version ? <p ref={slot} className="wp-sheet-view-slot">{failed ? 'This image couldn’t be shown' : ''}</p>
      : <ViewerDialog title={label} trigger={<AriaButton ref={slot} className="wp-sheet-view" aria-label={`Open ${label}`}>{picture}</AriaButton>}>{close => <MediaReceipt connection={connection} version={version} close={close} />}</ViewerDialog>}
    <figcaption>{view}</figcaption>
  </figure>;
}

/** A sheet row's key image: its first view, read like any key image once the row is near view. */
function SheetKeyImage({ connection, scope, workspace, versionId }: Pick<ScriptProps, 'connection' | 'scope' | 'workspace'> & { versionId: string }) {
  const [placeholder, near] = useNearViewport<HTMLSpanElement>();
  const { version } = useSavedMedia(connection, scope, workspace, versionId, 'image', near);
  return version ? <AssetKeyImage connection={connection} version={version} /> : <span ref={placeholder} className="wp-asset-no-image" aria-hidden="true">Image</span>;
}

/**
 * An image row's key image, read through the owned-image read once the row is near view; the hidden Assets panel
 * reads nothing until it opens. Decorative: the row is named by its text.
 */
function AssetKeyImage({ connection, version }: { connection: ScriptProps['connection']; version: Version }) {
  const [placeholder, near] = useNearViewport<HTMLSpanElement>();
  const image = useOwnedImage(connection, near ? version : null);
  return image.phase === 'ready' && image.url ? <img src={image.url} alt="" onError={image.fail} /> : <span ref={placeholder} className="wp-asset-no-image" aria-hidden="true">Image</span>;
}
