import { currentSheets, savedScriptContentSchema, scriptSubjects, subjectNameKey, type CurrentSheet, type ScriptSubject } from '@workprint/contracts';
import { maxSheetViewName, maxSheetViews, usedImageVersions } from '../artifacts/index.js';
import { MetaImageError, type MetaImageClient } from '../generation/index.js';
import type { AssistantSheets } from './assistant-references.js';
import { metaImageFailure, saveFailure, type ImageFailure, type ReadImageInputs, type SaveGeneratedImage } from './generated-images.js';
import type { ReadOwnedWorkspace } from './workspace-reads.js';

/** One view to put in a sheet: an existing image (`image`) or one made from `prompt`. Empty means none. */
export type SheetViewRequest = Readonly<{ view: string; prompt: string; image: string; notes: readonly string[]; size: string }>;
/** A subject's sheet as the assistant asks for it; `identity` is an image the views keep, empty for none. */
export type SheetRequest = Readonly<{ subject: string; description: string; continuityNotes: readonly string[]; views: readonly SheetViewRequest[]; identity: string }>;
export type SheetView = Readonly<{ view: string; versionId: string }>;
export type SheetOutcome =
  /** `given` views were asked for and `landed` of them are in the sheet; `missing` names the others and why. */
  | { kind: 'saved'; versionId: string; revision: number; subjectName: string; views: SheetView[]; given: number; landed: number; missing: (ImageFailure & { view: string })[] }
  | { kind: 'refused'; reason: 'unsaveable' | 'no_script' | 'not_in_script' | 'image_not_found' | 'too_many_views' | 'no_room' | 'work_unavailable' }
  | { kind: 'invalid'; field: 'views' }
  | { kind: 'too_long'; subjectName: string }
  /** A view the base keeps has a name longer than an assistant sheet allows, so a person must edit the sheet. */
  | { kind: 'unrevisable'; subjectName: string }
  | { kind: 'in_other_sheet'; subjectName: string }
  /** Nothing was saved: the first view of a new sheet failed, or no view was made at all. */
  | { kind: 'view_failed'; failure: ImageFailure }
  /** Views were made and kept as draft images, but the sheet save was refused for `reason`. */
  | { kind: 'not_saved'; reason: 'stale' | 'not_in_script' | 'not_found' | 'invalid' | 'in_other_sheet' | 'no_room' | 'unavailable'; subjectName?: string; kept: SheetView[] };

/** What making a sheet needs; agent composition supplies these. Without `images` nothing is sent. */
export type SheetMakers = Readonly<{
  readWorkspace: ReadOwnedWorkspace; readImageInputs: ReadImageInputs; saveGeneratedImage: SaveGeneratedImage; sheets: AssistantSheets;
  images?: Pick<MetaImageClient, 'generate' | 'edit'> | undefined;
}>;

/** The most views a sheet the assistant makes holds in total: the sheet save's own limit. */
export const sheetViewCap = maxSheetViews;
/** The longest view name the sheet save takes. */
export const sheetViewNameCap = maxSheetViewName;

/** An optional id: empty, whitespace or "null" means none. */
const none = (value: string) => { const trimmed = value.trim(); return trimmed.toLowerCase() === 'null' ? '' : trimmed; };

/** What a made view keeps from its identity image, by the subject's kind. */
const keepLines: Readonly<Record<ScriptSubject['kind'], string>> = {
  character: 'Keep the same person as the input image: the same face, build, hair and clothing.',
  place: 'Keep the same place as the input image: the same layout, architecture and light.',
  prop: 'Keep the same object as the input image: the same design, shape and materials.',
};

/** The fixed sheet-view frame of every made view's prompt. */
function sheetViewFrame(subject: ScriptSubject, view: string, description: string, notes: readonly string[]) {
  return [
    `One reference view of ${subject.name}, a ${subject.kind}, for a reference sheet: ${view}.`,
    description.trim(),
    notes.length ? `Keep consistent: ${notes.map(note => note.trim()).join('; ')}.` : '',
    'Show this single view only, on a plain neutral background with even light, with no text, labels, borders or other views.',
  ].filter(Boolean).join(' ');
}

/** The prompt sent to Meta for one view: the keep line when there is an identity input, then the frame, then the view's prompt. */
export function sheetViewPrompt(subject: ScriptSubject, request: Pick<SheetRequest, 'description' | 'continuityNotes'>, view: Pick<SheetViewRequest, 'view' | 'prompt'>, withIdentity: boolean) {
  return [withIdentity ? keepLines[subject.kind] : '', sheetViewFrame(subject, view.view, request.description, request.continuityNotes), view.prompt.trim()].filter(Boolean).join('\n\n');
}

type Sheet = CurrentSheet;

/** One planned view: kept from the base or an existing image (`versionId`), or one to make. `replaces` is the base view it remakes. */
type Planned = { view: string; notes: string[]; versionId?: string; make?: SheetViewRequest; replaces?: string };
type Identity = { versionId: string; dataUrl: string };

/** The script subject a sheet is for, with the video's current sheets, or why there is none. */
async function resolve(makers: SheetMakers, accountId: string, videoId: string, subjectId: string) {
  const read = await makers.readWorkspace(accountId, videoId);
  if (read.kind !== 'found') return { kind: 'refused', reason: 'work_unavailable' } as const;
  const script = read.workspace.script && 'content' in read.workspace.script.version ? savedScriptContentSchema.safeParse(read.workspace.script.version.content) : null;
  if (!script?.success) return { kind: 'refused', reason: 'no_script' } as const;
  const subjects = scriptSubjects(script.data);
  const subject = subjects.find(candidate => candidate.id === subjectId.trim());
  if (!subject) return { kind: 'refused', reason: 'not_in_script' } as const;
  return { kind: 'found', workspace: read.workspace, subject } as const;
}

/**
 * The views of the next sheet: the base's views in order, a given view with a base view's name (trimmed, ignoring
 * case) in its place with the base's spelling, and other given views at the end. Undefined when a given view has
 * no name, neither an image nor a prompt, shares a name with another, or repeats an image.
 */
function plan(base: Sheet | undefined, views: readonly SheetViewRequest[]): Planned[] | undefined {
  const given = views.map(view => ({ ...view, view: view.view.trim(), image: none(view.image) }));
  if (given.some(view => !view.view || (!view.image && !view.prompt.trim())) || new Set(given.map(view => subjectNameKey(view.view))).size !== given.length) return undefined;
  const planned: Planned[] = (base?.views ?? []).map(reference => ({ view: reference.view, notes: [...reference.notes], versionId: reference.versionId }));
  for (const view of given) {
    const at = planned.findIndex(item => subjectNameKey(item.view) === subjectNameKey(view.view));
    const old = at >= 0 ? planned[at] : undefined;
    const next: Planned = { view: old?.view ?? view.view, notes: [...view.notes], ...(view.image ? { versionId: view.image } : { make: view }), ...(old?.versionId ? { replaces: old.versionId } : {}) };
    if (at >= 0) planned[at] = next; else planned.push(next);
  }
  const kept = planned.flatMap(item => item.versionId ? [item.versionId] : []);
  return new Set(kept).size === kept.length ? planned : undefined;
}

/**
 * Makes or extends a script subject's sheet. Everything is resolved and checked before any paid call; then the views
 * are made one at a time with one identity image, each saved as a draft image, and the sheet is saved last. Account
 * and video come from the trusted run scope. Stop throws from the signal; views saved before it stay as draft images.
 */
export async function makeSheet(makers: SheetMakers, accountId: string, videoId: string, request: SheetRequest, { signal }: { signal: AbortSignal }): Promise<SheetOutcome> {
  const { images, sheets } = makers;
  if (!images) return { kind: 'refused', reason: 'unsaveable' };
  const found = await resolve(makers, accountId, videoId, request.subject);
  if (found.kind !== 'found') return found;
  const { workspace, subject } = found;
  const all = currentSheets(workspace), current = all.find(sheet => sheet.subjectId === subject.id);
  const planned = plan(current, request.views);
  if (!planned) return { kind: 'invalid', field: 'views' };
  if (current && current.views.length > sheetViewCap) return { kind: 'too_long', subjectName: subject.name };
  if (planned.length > sheetViewCap) return { kind: 'refused', reason: 'too_many_views' };
  // A person's sheet can hold names the save refuses, and a remade view keeps its name; checked before any paid view.
  if (planned.some(item => item.view.trim().length > sheetViewNameCap)) return { kind: 'unrevisable', subjectName: subject.name };

  // Existing images must be ones the video uses, and each is in one sheet only.
  const used = usedImageVersions(workspace), identity = none(request.identity);
  const placed = planned.flatMap(item => item.versionId && !current?.views.some(reference => reference.versionId === item.versionId) ? [item.versionId] : []);
  if ([identity, ...placed].some(id => id && !used.has(id))) return { kind: 'refused', reason: 'image_not_found' };
  // Every view's image, kept ones too, is in this sheet only: people's sheets can share an image.
  // A failed remake puts its base image back, so that image counts too.
  const listed = planned.flatMap(item => [item.versionId, item.replaces].filter((id): id is string => Boolean(id)));
  const holder = all.find(sheet => sheet !== current && sheet.views.some(reference => listed.includes(reference.versionId)));
  if (holder) return { kind: 'in_other_sheet', subjectName: holder.subjectName };
  const toMake = planned.filter(item => item.make).length;
  const room = await sheets.useRoom(accountId, videoId);
  if (room.kind !== 'room') return { kind: 'refused', reason: 'work_unavailable' };
  if (room.room < toMake + (current ? 0 : 1)) return { kind: 'refused', reason: 'no_room' };

  // The identity input: `identity`, else the sheet's first view (for a next version, the base's first view even when
  // it is remade). A new sheet whose first view is made has none until that view is made.
  const identityId = identity || current?.views[0]?.versionId || (planned[0]?.make ? '' : planned[0]?.versionId ?? '');
  let input: Identity | undefined;
  if (identityId) {
    const read = await makers.readImageInputs(accountId, videoId, [identityId]);
    if (read.kind === 'not_found') return { kind: 'refused', reason: 'image_not_found' };
    if (read.kind !== 'read' || !read.images[0]) return { kind: 'refused', reason: 'work_unavailable' };
    input = read.images[0];
  }

  const made: SheetView[] = [], missing: (ImageFailure & { view: string })[] = [];
  for (const item of planned) {
    if (!item.make) continue;
    signal.throwIfAborted();
    const meta = { prompt: sheetViewPrompt(subject, request, item.make, Boolean(input)), n: 1, size: item.make.size, outputFormat: 'png' as const, reasoningStrength: 'high' as const, tools: { imageSearch: true, webSearch: true, shell: true } };
    let failure: ImageFailure | undefined;
    try {
      const result = input ? await images.edit({ ...meta, images: [{ dataUrl: input.dataUrl }] }, signal) : await images.generate(meta, signal);
      const image = result.images[0];
      // Nothing from a response is saved after Stop.
      signal.throwIfAborted();
      if (!image) failure = { reason: 'unavailable' };
      else {
        const saved = await makers.saveGeneratedImage(accountId, videoId, { bytes: image.bytes, contentType: image.contentType, inputs: input ? [input.versionId] : [] }, signal);
        signal.throwIfAborted();
        if (saved.kind === 'saved') {
          item.versionId = saved.versionId;
          made.push({ view: item.view, versionId: saved.versionId });
          // A new sheet's first made view, with no identity given, is the identity of the views after it.
          input ??= { versionId: saved.versionId, dataUrl: `data:${image.contentType};base64,${Buffer.from(image.bytes).toString('base64')}` };
        } else failure = saveFailure(saved);
      }
    } catch (error) {
      if (error instanceof MetaImageError && error.code === 'aborted') signal.throwIfAborted();
      failure = metaImageFailure(error);
    }
    delete item.make;
    if (!failure) continue;
    // The first view of a new sheet with no identity failed: nothing more is made, and nothing is saved.
    if (!input) return { kind: 'view_failed', failure };
    missing.push({ view: item.view, ...failure });
    // A failed replacement keeps the base's view in place; a failed addition is left out.
    if (item.replaces) item.versionId = item.replaces;
  }
  // With views to make and none made, nothing is saved: the line is the first failure's.
  if (toMake > 0 && made.length === 0) return { kind: 'view_failed', failure: missing[0]! };
  const views = planned.flatMap(item => item.versionId ? [{ view: item.view, versionId: item.versionId, notes: item.notes }] : []);
  const outcome = await sheets.save(accountId, videoId, {
    subjectId: subject.id, description: request.description, continuityNotes: request.continuityNotes, views, baseVersionId: current?.versionId ?? null,
  });
  if (outcome.kind === 'saved') {
    return { kind: 'saved', versionId: outcome.versionId, revision: outcome.revision, subjectName: outcome.subjectName, views: views.map(({ view, versionId }) => ({ view, versionId })), given: request.views.length, landed: request.views.length - missing.length, missing };
  }
  if (outcome.kind === 'in_other_sheet') return { kind: 'not_saved', reason: 'in_other_sheet', subjectName: outcome.subjectName, kept: made };
  // The script or the video's work changed while the views were made.
  return { kind: 'not_saved', reason: outcome.kind === 'no_script' ? 'not_in_script' : outcome.kind, kept: made };
}
