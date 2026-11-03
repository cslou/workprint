import { currentPanelImage, currentSubjects, currentSubjectSheets, lineVoice, sceneCharacters, type SubjectKind } from '@workprint/contracts';
import { maxReferenceImages, maxVideoPromptCharacters, videoImageFits } from '../generation/index.js';
import type { VideoJobOutcome, VideoJobs, VideoRunControl } from './video-jobs.js';
import type { OwnedWorkspace, ReadOwnedWorkspace } from './workspace-reads.js';

type Shot = OwnedWorkspace['storyboard']['shots'][number];
type Line = NonNullable<Shot['dialogue']>[number];

/** What making a Shot's video needs; agent composition supplies these. Without `videos` nothing is sent. */
export type ShotMakers = Readonly<{ readWorkspace: ReadOwnedWorkspace; videos?: Pick<VideoJobs, 'start'> | undefined }>;
/** One Shot's video to make: the Shot's id and the model's motion prompt. The clip's length is the Shot's. */
export type MakeShotRequest = Readonly<{ shot: string; prompt: string }>;
/** The length of a Shot saved without one, such as an older or built-in storyboard's. */
export const defaultShotDurationS = 6;
export type ShotRefusal = 'unsaveable' | 'not_found' | 'needs_panels' | 'too_long' | 'work_unavailable';
/** A refusal before any job is saved or sent, or the job's own outcome. */
export type ShotOutcome = { kind: 'shot_refused'; reason: ShotRefusal } | VideoJobOutcome;

const byOrder = <T extends { order: number }>(items: readonly T[]) => [...items].sort((a, b) => a.order - b.order);

/** A sheet description in an image's label is cut to this many characters, at a word. */
export const maxLabelDescription = 300;
/** The prompt's last line, so the Shot's motion finishes rather than being cut off. */
export const shotEnding = 'The action completes within the Shot, and it ends on a settled moment.';

/** One image a Shot's video is made from, with its line in the prompt (without its "Image N: " number). */
export type ShotReference = Readonly<{ versionId: string; label: string }>;

/** What a subject's images keep, by the subject's kind; the subject is named, never a pronoun. */
const keeps: Readonly<Record<SubjectKind, (name: string) => string>> = {
  character: name => `Keep ${name}'s face, hair, build and clothing as shown.`,
  place: name => `Keep ${name}'s layout, architecture and light as shown.`,
  prop: name => `Keep ${name}'s design, shape and materials as shown.`,
};

/** A sheet description cut to `maxLabelDescription` characters at a word, without its closing stop. */
function cut(text: string): string {
  const trimmed = text.trim().replace(/[.\s]+$/, '');
  if (trimmed.length <= maxLabelDescription) return trimmed;
  const head = trimmed.slice(0, maxLabelDescription + 1), space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : trimmed.slice(0, maxLabelDescription)).replace(/[,;:.\s]+$/, '');
}

/**
 * The images a Shot's video is made from, by the one rule, or `needs_panels` when its first or last panel has no
 * image. Each subject the Shot names, in Shot order, gives its sheet's first view while room is kept for the panels;
 * then the first panel's current image, and the last panel's when the Shot has more than one; then each subject's
 * second view while room remains. At most 9 images, none twice; a subject with no sheet gives nothing. A panel's image
 * is always sent as the panel, so a sheet view that is also a panel's image is sent once, with the panel's label. A
 * sheet view MiniMax wouldn't take (its sides or shape, `videoImageFits`) is left out, so one odd view never stops the
 * Shot; a panel is always sent, and MiniMax's checks refuse one it wouldn't take.
 */
export function shotReferences(workspace: OwnedWorkspace, shot: Shot): { kind: 'picked'; references: ShotReference[] } | { kind: 'needs_panels' } {
  const panels = byOrder(shot.panels);
  // A person's Shot may have more panels: only its first and last are sent, as the framing to aim for.
  const ends = panels.length > 1 ? [panels[0]!, panels.at(-1)!] : panels;
  const images = ends.map(panel => currentPanelImage(panel)?.id);
  if (!images.length || images.some(id => id === undefined)) return { kind: 'needs_panels' };
  const panelImages = [...new Set(images as string[])].map((versionId, index) => ({ versionId,
    label: index === 0 ? 'the storyboard panel for this Shot. Frame the Shot like this panel.' : 'the Shot\'s last storyboard panel. End the Shot on this framing.' }));

  const kinds = new Map(currentSubjects(workspace).map(subject => [subject.id, subject.kind])), sheets = currentSubjectSheets(workspace);
  const sizes = new Map(workspace.assets.flatMap(({ version }) => 'media' in version ? [[version.id, version.media] as const] : []));
  const panelIds = new Set(panelImages.map(panel => panel.versionId));
  // A view whose size the workspace doesn't list is sent, and the job's own read checks it.
  const sendable = (versionId: string) => { const size = sizes.get(versionId); return !panelIds.has(versionId) && (!size || videoImageFits(size.width, size.height)); };
  const subjects = [...new Set((shot.references ?? []).map(reference => reference.subjectId))].flatMap(subjectId => {
    const sheet = sheets.get(subjectId), kind = kinds.get(subjectId);
    if (!sheet || !kind) return [];
    const description = cut(sheet.description);
    return [{ views: sheet.views.map(view => view.versionId).filter(sendable), label: `${sheet.subjectName}${description ? `, ${description}` : ''}. ${keeps[kind](sheet.subjectName)}` }];
  });

  const picked: ShotReference[] = [];
  const add = (reference: ShotReference, limit: number) => { if (picked.length < limit && !picked.some(item => item.versionId === reference.versionId)) picked.push(reference); };
  for (const subject of subjects) if (subject.views[0]) add({ versionId: subject.views[0], label: subject.label }, maxReferenceImages - panelImages.length);
  for (const panel of panelImages) add(panel, maxReferenceImages);
  for (const subject of subjects) if (subject.views[1]) add({ versionId: subject.views[1], label: subject.label }, maxReferenceImages);
  return { kind: 'picked', references: picked };
}

/**
 * A dialogue line in MiniMax's form, by how it is heard (`lineVoice`). `speaker` is the line's speaker id (S1, S2…),
 * given in order of each speaker's first line in the Shot.
 */
function spoken(line: Line, sceneCharacters: ReadonlySet<string>, speaker: string): string {
  const character = line.character.trim(), words = `<d>[English] ${line.text.trim()}</d>`;
  switch (lineVoice(line, sceneCharacters)) {
    case 'off_screen': return `${character} (${speaker}), off-screen, says: ${words}`;
    case 'voice_over': return `${character} (${speaker}) says in an off-screen voiceover: ${words} while ${character}'s lips remain completely closed.`;
    case 'narration': return `A narrator (${speaker}) says in an off-screen voiceover: ${words} while every character on screen keeps their lips closed.`;
    case 'on_screen': return `${character} (${speaker}) says: ${words}`;
  }
}

/**
 * The MiniMax prompt for a Shot: a line per image it is made from ("Image N: …", in the order they are sent), its
 * action (or its intent when it has none) and camera note, then its dialogue in MiniMax's form, or "No one speaks.",
 * then the model's motion prompt and the closing line. Context is never voiced: it stays in the action.
 */
export function shotVideoPrompt(shot: Pick<Shot, 'action' | 'intent' | 'cameraNote' | 'dialogue'>, sceneCharacters: ReadonlySet<string>, motion: string, references: readonly ShotReference[]): string {
  const speakers = new Map<string, string>();
  const lines = (shot.dialogue ?? []).map(line => {
    const key = line.character.trim();
    if (!speakers.has(key)) speakers.set(key, `S${speakers.size + 1}`);
    return spoken(line, sceneCharacters, speakers.get(key)!);
  });
  const labels = references.map((reference, index) => `Image ${index + 1}: ${reference.label}`).join('\n');
  return [labels, shot.action ?? shot.intent ?? '', shot.cameraNote ?? '', lines.length ? lines.join('\n') : 'No one speaks.', motion, shotEnding]
    .map(part => part.trim()).filter(Boolean).join('\n\n');
}

/**
 * Makes one Shot's video from the storyboard the video uses, from reference images: its subjects' sheet views and its
 * panels (`shotReferences`), each labelled in the prompt, at 16:9 and the Shot's length.
 * Every refusal comes before any job is saved or sent: an unknown Shot, a first or last panel with no image, or a
 * prompt longer than MiniMax takes. The job carries the Shot, so a resume still saves its clip there.
 */
export async function makeShot(makers: ShotMakers, accountId: string, videoId: string, request: MakeShotRequest, control: VideoRunControl): Promise<ShotOutcome> {
  const refused = (reason: ShotRefusal): ShotOutcome => ({ kind: 'shot_refused', reason });
  const { videos } = makers;
  if (!videos) return refused('unsaveable');
  const read = await makers.readWorkspace(accountId, videoId);
  if (read.kind !== 'found') return refused('work_unavailable');
  const shot = read.workspace.storyboard.shots.find(item => item.shotId === request.shot);
  if (!shot) return refused('not_found');
  const picked = shotReferences(read.workspace, shot);
  if (picked.kind === 'needs_panels') return refused('needs_panels');
  const prompt = shotVideoPrompt(shot, sceneCharacters(read.workspace), request.prompt, picked.references);
  if (prompt.length > maxVideoPromptCharacters) return refused('too_long');
  return videos.start(accountId, videoId, {
    prompt, durationS: shot.durationS ?? defaultShotDurationS, ratio: '16:9', referenceImageIds: picked.references.map(reference => reference.versionId), target: { shotId: shot.shotId },
  }, control);
}
