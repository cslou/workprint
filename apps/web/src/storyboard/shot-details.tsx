import { currentPanelImage, currentSubjects, sceneCharacters, type OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { useNearViewport } from '../ui/use-near-viewport.js';
import { deliveryLabel } from '../workspace/projection.js';

type Workspace = OperationResponse<'workspace'>;
type Shot = Workspace['storyboard']['shots'][number];
type Panel = Shot['panels'][number];

/**
 * A Shot's text as the storyboard saves it: its action, its dialogue labelled by delivery, its camera note and the
 * script subjects it names. `camera` is a display composition's camera text, used when the Shot has no note.
 */
export function ShotText({ workspace, shot, camera }: { workspace: Workspace; shot: Shot; camera?: string | undefined }) {
  const subjects = currentSubjects(workspace);
  const names = new Map(subjects.map(subject => [subject.id, subject.name]));
  const characters = sceneCharacters(workspace);
  const named = (shot.references ?? []).flatMap(reference => names.get(reference.subjectId) ?? []);
  const note = shot.cameraNote ?? camera;
  return <>
    {shot.action && <p className="wp-storyboard-action">{shot.action}</p>}
    {shot.dialogue?.length ? <ul className="wp-storyboard-dialogue">{shot.dialogue.map((line, index) => <li key={index}><b>{deliveryLabel(line, characters)}</b> <q>{line.text}</q></li>)}</ul> : null}
    {note && <p className="wp-storyboard-camera">{note}</p>}
    {named.length ? <p className="wp-storyboard-subjects">{named.join(' · ')}</p> : null}
  </>;
}

/** A built-in composition's own picture of a version, which is shown instead of reading the version's media. */
export type KnownImage = Readonly<{ versionId: string; revision: number; src: string }>;

/**
 * A panel's current image (the version a person chose, else the assistant's current one), read once it is near view;
 * the hidden Storyboard panel reads nothing until it opens. Before any image exists it is a planned panel.
 */
export function PanelImage({ connection, panel, label, known }: { connection: BrowserClient; panel: Panel; label: string; known?: readonly KnownImage[] | undefined }) {
  const [slot, near] = useNearViewport<HTMLSpanElement>();
  const current = currentPanelImage(panel);
  const shown = current && known?.find(image => image.versionId === current.id && image.revision === current.revision);
  const image = useOwnedImage(connection, near && !shown && current?.kind === 'image' ? current : null);
  if (!current) return <span className="wp-panel-planned">Planned panel</span>;
  if (shown) return <img className="wp-panel-image" src={shown.src} alt={label} />;
  return image.phase === 'ready' && image.url ? <img className="wp-panel-image" src={image.url} alt={label} onError={image.fail} /> : <span ref={slot} className="wp-panel-image wp-panel-loading" aria-hidden="true" />;
}
