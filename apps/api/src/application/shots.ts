import { currentPanelImage, savedScriptContentSchema } from '@workprint/contracts';
import { maxVideoPromptCharacters } from '../generation/index.js';
import type { VideoJobOutcome, VideoJobs, VideoRunControl } from './video-jobs.js';
import type { OwnedWorkspace, ReadOwnedWorkspace } from './workspace-reads.js';

type Shot = OwnedWorkspace['storyboard']['shots'][number];
type Line = NonNullable<Shot['dialogue']>[number];

/** What making a Shot's video needs; agent composition supplies these. Without `videos` nothing is sent. */
export type ShotMakers = Readonly<{ readWorkspace: ReadOwnedWorkspace; videos?: Pick<VideoJobs, 'start'> | undefined }>;
/** One Shot's video to make: the Shot's id, the model's motion prompt and the clip's length. */
export type MakeShotRequest = Readonly<{ shot: string; prompt: string; durationS: number }>;
export type ShotRefusal = 'unsaveable' | 'not_found' | 'needs_panels' | 'too_long' | 'work_unavailable';
/** A refusal before any job is saved or sent, or the job's own outcome. */
export type ShotOutcome = { kind: 'shot_refused'; reason: ShotRefusal } | VideoJobOutcome;

const byOrder = <T extends { order: number }>(items: readonly T[]) => [...items].sort((a, b) => a.order - b.order);

/**
 * How a dialogue line is voiced: by its character on screen, off screen, or in voice-over when the character is in
 * the scene; any other voice-over is a narrator's.
 */
function spoken(line: Line, sceneCharacters: ReadonlySet<string>): string {
  const character = line.character.trim(), text = line.text.trim();
  if (line.delivery === 'off_screen') return `${character}, off screen, says: "${text}"`;
  if (line.delivery === 'voice_over') return sceneCharacters.has(character) ? `${character}, in voice-over, says: "${text}"` : `Narrated in voice-over: "${text}"`;
  return `${character} says: "${text}"`;
}

/**
 * The MiniMax prompt for a Shot: its action (or its intent when it has none) and camera note, then its dialogue as it
 * is voiced, or "No one speaks.", then the model's motion prompt. Context is never voiced: it stays in the action.
 */
export function shotVideoPrompt(shot: Pick<Shot, 'action' | 'intent' | 'cameraNote' | 'dialogue'>, sceneCharacters: ReadonlySet<string>, motion: string): string {
  const lines = (shot.dialogue ?? []).map(line => spoken(line, sceneCharacters));
  return [shot.action ?? shot.intent ?? '', shot.cameraNote ?? '', lines.length ? lines.join('\n') : 'No one speaks.', motion]
    .map(part => part.trim()).filter(Boolean).join('\n\n');
}

/** The characters of the script's scene, trimmed, as the script names them. */
function sceneCharacters(workspace: OwnedWorkspace): Set<string> {
  const content = workspace.script && 'content' in workspace.script.version ? savedScriptContentSchema.safeParse(workspace.script.version.content).data : undefined;
  return new Set(content?.scenes.flatMap(scene => scene.characters.map(name => name.trim())) ?? []);
}

/**
 * Makes one Shot's video from the storyboard the video uses. The frames and the text come from the Shot alone: its
 * first panel's current image is the first frame and, with two or more panels, its last panel's is the last frame.
 * Every refusal comes before any job is saved or sent: an unknown Shot, a panel with no image, or a prompt longer
 * than MiniMax takes. The job carries the Shot, so a resume still saves its clip there.
 */
export async function makeShot(makers: ShotMakers, accountId: string, videoId: string, request: MakeShotRequest, control: VideoRunControl): Promise<ShotOutcome> {
  const refused = (reason: ShotRefusal): ShotOutcome => ({ kind: 'shot_refused', reason });
  const { videos } = makers;
  if (!videos) return refused('unsaveable');
  const read = await makers.readWorkspace(accountId, videoId);
  if (read.kind !== 'found') return refused('work_unavailable');
  const shot = read.workspace.storyboard.shots.find(item => item.shotId === request.shot);
  if (!shot) return refused('not_found');
  const panels = byOrder(shot.panels);
  // A person's or built-in Shot may have more panels: its first and last are the frames.
  const framed = panels.length > 1 ? [panels[0]!, panels.at(-1)!] : panels;
  const frames = framed.map(panel => currentPanelImage(panel)?.id);
  if (!frames.length || frames.some(id => id === undefined)) return refused('needs_panels');
  const prompt = shotVideoPrompt(shot, sceneCharacters(read.workspace), request.prompt);
  if (prompt.length > maxVideoPromptCharacters) return refused('too_long');
  const [firstFrame, lastFrame] = frames as string[];
  return videos.start(accountId, videoId, {
    prompt, durationS: request.durationS, ratio: '16:9', firstFrame: firstFrame!, ...(lastFrame ? { lastFrame } : {}), target: { shotId: shot.shotId },
  }, control);
}
