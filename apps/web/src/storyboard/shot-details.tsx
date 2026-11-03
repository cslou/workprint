import { currentPanelImage, currentSubjects, sceneCharacters, type OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import { useNearViewport } from '../ui/use-near-viewport.js';
import { deliveryLabel } from './dialogue.js';

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

/**
 * A panel's current image (the version a person chose, else the assistant's current one), read once it is near view;
 * the hidden Storyboard panel reads nothing until it opens. Before any image exists it is a planned panel, and an image
 * that can't be read says so in its slot.
 */
export function PanelImage({ connection, panel, label }: { connection: BrowserClient; panel: Panel; label: string }) {
  const [slot, near] = useNearViewport<HTMLSpanElement>();
  const current = currentPanelImage(panel);
  const image = useOwnedImage(connection, near && current?.kind === 'image' ? current : null);
  if (!current) return <span className="wp-panel-planned">Planned panel</span>;
  if (image.phase === 'ready' && image.url) return <img className="wp-panel-image" src={image.url} alt={label} data-displayed-version-id={current.id} onError={image.fail} />;
  if (image.phase === 'error' || image.phase === 'expired') return <span className="wp-panel-planned">This image couldn’t be shown</span>;
  return <span ref={slot} className="wp-panel-image wp-panel-loading" aria-hidden="true" />;
}
