import { shotDurations, type OperationResponse, type Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';

type Workspace = OperationResponse<'workspace'>;
type Shot = Workspace['storyboard']['shots'][number];
type Configured = Extract<BrowserClient, { kind: 'configured' }>;

/** One Shot's change in a person's storyboard edit: its intent, its length, or one panel's description. */
export type ShotChange = Readonly<{ shotId: string; intent?: string; durationS?: number; panel?: Readonly<{ panelId: string; description: string }> }>;

/** Every Shot of the storyboard as a person's edit sends it, with `change` applied; the server keeps every other Shot field. */
export function editedShots(shots: readonly Shot[], change: ShotChange) {
  return shots.map(shot => {
    const changed = shot.shotId === change.shotId;
    const intent = changed && change.intent !== undefined ? change.intent : shot.intent;
    return {
      shotId: shot.shotId, order: shot.order, ...(intent === undefined ? {} : { intent }), ...(changed && change.durationS !== undefined ? { durationS: change.durationS } : {}),
      panels: shot.panels.map(panel => ({ panelId: panel.panelId, order: panel.order, description: changed && change.panel?.panelId === panel.panelId ? change.panel.description : panel.description, references: [...panel.references] })),
    };
  });
}

/** How a person's storyboard edit ended: the next version, a save failure code, or an answer older than one already shown. */
export type StoryboardEditOutcome = { kind: 'edited'; value: OperationResponse<'editStoryboard'> } | { kind: 'refused'; code: string } | { kind: 'superseded' };

/**
 * Sends a person's storyboard edit on `base` and checks the answer is the next version of the same storyboard. An
 * answer whose selection revision is older than `latestRevision()` arrived after a newer one and is dropped.
 */
export async function submitStoryboardEdit(client: Configured['client'], conversationId: string, base: Version, shots: ReturnType<typeof editedShots>, latestRevision: () => number): Promise<StoryboardEditOutcome> {
  const result = await client.editStoryboard({ params: { id: conversationId }, query: {}, body: { operationId: crypto.randomUUID(), baseVersionId: base.id, shots } });
  if (!result.ok) return { kind: 'refused', code: result.error.code };
  const next = result.value;
  if (next.selectionRevision < latestRevision()) return { kind: 'superseded' };
  if (next.version.kind !== 'storyboard' || next.version.artifactId !== base.artifactId || next.version.id === base.id || next.version.revision <= base.revision) return { kind: 'refused', code: 'invalid_response' };
  return { kind: 'edited', value: next };
}

/** Whether a person can edit this storyboard version: a saved, non-built-in storyboard, with a configured connection and video. */
export const storyboardEditable = (base: Version | undefined, connection: BrowserClient, scope: ReadScope | null): base is Version =>
  base?.kind === 'storyboard' && 'content' in base && !base.builtIn && connection.kind === 'configured' && !!scope?.conversationId;

/** The Shot's length line, "Length · 6 s" or "Length · not set". */
export const lengthText = (durationS: number | undefined) => `Length · ${durationS === undefined ? 'not set' : `${durationS} s`}`;
export const lengthOutOfRange = `Enter a whole number of seconds from ${shotDurations.min} to ${shotDurations.max}.`;

/** The seconds a person typed, when they are a whole number in the Shot length range; otherwise null. */
export function shotLengthSeconds(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= shotDurations.min && value <= shotDurations.max ? value : null;
}
