import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { idSchema, roleKinds, savedStoryboardContentSchema, scriptSubjects, useSchema, type dialogueLineSchema, type shotReferenceSchema, type Version } from '@workprint/contracts';
import { transaction } from '../db/index.js';
import { assertBase, lockedUse, namedBase, publishDraftUse } from './assistant-base.js';
import { assertContentDependencies, parseContent } from './content.js';
import { ArtifactError } from './errors.js';
import { lockPublicationOwner } from './publication.js';
import { scriptNow, type ScriptNow } from './script-reads.js';
import { advanceSelectionRevision, selectionRevision, shotOrderChanged } from './selection.js';
import { currentSheets } from './sheet-reads.js';
import { shotSubjects, storyboardDependencies } from './storyboard-dependencies.js';
import { createArtifactStore } from './store.js';
import { useRoom } from './use-room.js';

type OwnedCheck = Parameters<typeof createArtifactStore>[1];
type Plan = z.infer<typeof savedStoryboardContentSchema>;
/** A panel as the assistant sends it: an empty id is a new panel; a kept id must be one of its Shot's in the base. */
export type AssistantPanelInput = Readonly<{ panelId: string; description: string }>;
/** A Shot as the assistant sends it, in story order: an empty id is a new Shot; a kept id must be one in the base. */
export type AssistantShotInput = Readonly<{
  shotId: string; intent: string; framing?: string; action?: string; cameraNote?: string; durationS?: number;
  dialogue?: readonly z.infer<typeof dialogueLineSchema>[]; references?: readonly z.infer<typeof shotReferenceSchema>[];
  panels: readonly AssistantPanelInput[];
}>;
/** `baseVersionId` is the storyboard version the assistant last read, or null when the video had none. */
export type AssistantStoryboardInput = Readonly<{ baseVersionId: string | null; shots: readonly AssistantShotInput[] }>;
export type AssistantStoryboardSave = Readonly<{ version: Version; use: z.infer<typeof useSchema>; selectionRevision: number }>;

/** At most this many panels in a Shot the assistant saves: its video's first and last frames. */
export const maxShotPanels = 2;
const binding = { purpose: 'storyboard' } as const;

/**
 * Why a storyboard can't be saved, with the field at fault: `not_in_script` for a referenced subject the script
 * doesn't list, `role` for a role that doesn't fit the subject's kind, `invalid` for anything else.
 */
export class StoryboardSaveError extends Error {
  constructor(readonly reason: 'no_script' | 'not_in_script' | 'role' | 'invalid' | 'no_room', readonly field?: string) {
    super(`Storyboard not saved: ${reason}`);
  }
}

const invalid = (field: string) => new StoryboardSaveError('invalid', field);
/** A schema issue's path as a field name, such as `shots[0].framing`. */
const fieldOf = (path: readonly PropertyKey[]) => path.map((part, index) => typeof part === 'number' ? `[${part}]` : `${index ? '.' : ''}${String(part)}`).join('') || 'shots';

/** The plan the assistant asked for, with server-made ids for new Shots and panels and the base's ids kept. */
function plannedShots(input: AssistantStoryboardInput, base: Plan | null, script: ScriptNow['script']): Plan['shots'] {
  if (input.shots.length < 1 || input.shots.length > 100) throw invalid('shots');
  const subjects = new Map(scriptSubjects(script).map(subject => [subject.id, subject]));
  const speakers = new Set(script.scenes.flatMap(scene => scene.characters.map(name => name.trim())));
  const baseShots = new Map((base?.shots ?? []).map(shot => [shot.shotId, shot]));
  const keptShots = new Set<string>();
  return input.shots.map((shot, index) => {
    const at = `shots[${index}]`;
    const given = shot.shotId.trim();
    const old = given ? baseShots.get(given) : undefined;
    // An id the base doesn't have, or one given twice, would silently detach work: refuse it.
    if (given && (!old || keptShots.has(given))) throw invalid(`${at}.shotId`);
    if (given) keptShots.add(given);
    if (shot.panels.length < 1 || shot.panels.length > maxShotPanels) throw invalid(`${at}.panels`);
    const keptPanels = new Set<string>();
    const panels = shot.panels.map((panel, order) => {
      const id = panel.panelId.trim();
      // A panel keeps its id only under its own Shot; one moved under another Shot is refused.
      if (id && (!old?.panels.some(item => item.panelId === id) || keptPanels.has(id))) throw invalid(`${at}.panels[${order}].panelId`);
      if (id) keptPanels.add(id);
      // A kept panel keeps the reference versions a person gave it; a new panel has none.
      return { panelId: id || randomUUID(), order, description: panel.description, references: [...(old?.panels.find(item => item.panelId === id)?.references ?? [])] };
    });
    shot.references?.forEach((reference, position) => {
      const subject = subjects.get(reference.subjectId);
      if (!subject) throw new StoryboardSaveError('not_in_script', `${at}.references[${position}].subjectId`);
      if (!roleKinds[reference.role].includes(subject.kind)) throw new StoryboardSaveError('role', `${at}.references[${position}].role`);
    });
    shot.dialogue?.forEach((line, position) => {
      if (line.delivery !== 'voice_over' && !speakers.has(line.character.trim())) throw invalid(`${at}.dialogue[${position}].character`);
    });
    return {
      shotId: given || randomUUID(), order: index, intent: shot.intent,
      ...(shot.framing !== undefined ? { framing: shot.framing } : {}), ...(shot.action !== undefined ? { action: shot.action } : {}),
      ...(shot.dialogue !== undefined ? { dialogue: [...shot.dialogue] } : {}), ...(shot.cameraNote !== undefined ? { cameraNote: shot.cameraNote } : {}),
      ...(shot.references !== undefined ? { references: [...shot.references] } : {}),
      ...(shot.durationS !== undefined ? { durationS: shot.durationS } : {}),
      panels,
    };
  });
}

/**
 * The assistant's storyboard capability. It saves the video's next storyboard from the script the video uses now and
 * makes it the current storyboard, always as a draft. The base rule is the script save's (`assertBase`). Shots name
 * subjects of that script; the script and each referenced subject's current sheet become the version's dependencies.
 * It writes no journal row (B-036), but advances the selection revision when the Shot sequence changes.
 */
export function createAssistantStoryboards(pool: Pool, checkOwnedConversation: OwnedCheck) {
  const reads = createArtifactStore(pool, checkOwnedConversation);
  return Object.freeze({
    async save(account: string, conversation: string, input: AssistantStoryboardInput): Promise<AssistantStoryboardSave> {
      if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new ArtifactError('invalid_input');
      const owned = await checkOwnedConversation(account, conversation);
      if (owned.kind !== 'owned') throw new ArtifactError(owned.kind === 'not_found' ? 'not_found' : 'integration_failure');
      const named = await namedBase(reads, account, input.baseVersionId);

      return transaction(pool, async client => {
        await lockPublicationOwner(client, account);
        const current = await lockedUse(client, account, conversation, 'storyboard');
        assertBase(current, input.baseVersionId, named, 'storyboard');
        const script = await scriptNow(client, account, conversation);
        if (!script) throw new StoryboardSaveError('no_script');
        const before = current && named.base && 'content' in named.base ? savedStoryboardContentSchema.parse(named.base.content) : null;
        const shots = plannedShots(input, before, script.script);
        let content: Plan;
        try { content = savedStoryboardContentSchema.parse(parseContent('storyboard', { schemaVersion: 1, sourceScriptVersionId: script.versionId, shots })); }
        catch (error) { throw invalid(error instanceof z.ZodError && error.issues[0] ? fieldOf(error.issues[0].path) : 'shots'); }

        // Each referenced subject's current sheet (the first in workspace order) as it is now.
        const sheets = await currentSheets(client, account, conversation);
        const sheetVersions = shotSubjects(content).flatMap(subject => { const sheet = sheets.find(item => item.sheet.subject.id === subject); return sheet ? [sheet.version_id] : []; });
        const dependencies = storyboardDependencies(content, sheetVersions);
        if (dependencies.length > 100) throw invalid('shots');
        // Kept panel references come from the base, whose save already required them to be reference versions.
        assertContentDependencies(content, new Map(dependencies.map(id => [id, { kind: id === script.versionId ? 'script' : 'reference' }] as const)));

        if (!current && await useRoom(client, account, conversation) === 0) throw new StoryboardSaveError('no_room');
        const { version, useId } = await publishDraftUse(client, account, conversation, current, { kind: 'storyboard', content, dependencies, purpose: 'storyboard', binding });
        const revision = shotOrderChanged(before, content) ? await advanceSelectionRevision(client, account, conversation) : await selectionRevision(client, account, conversation);
        return { version, use: useSchema.parse({ id: useId, versionId: version.id, binding, state: 'draft' }), selectionRevision: revision };
      });
    },
  });
}
export type AssistantStoryboards = ReturnType<typeof createAssistantStoryboards>;
