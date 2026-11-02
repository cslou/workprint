import { newSubjectId, scriptSubjects, type ScriptSubject, type SubjectKind, type scriptBodySchema, type savedScriptContentSchema } from '@workprint/contracts';
import type { z } from 'zod';

/** A subject as the assistant sends it: an empty, whitespace or "null" id means a new subject. */
export type SubjectInput = Readonly<{ id: string; kind: SubjectKind; name: string }>;
type ScriptBody = z.infer<typeof scriptBodySchema>;
type SavedScript = z.infer<typeof savedScriptContentSchema>;

/** Why the assistant's subjects can't be saved: an id the base doesn't have, or characters that differ from kept subjects. */
export class ScriptSubjectsError extends Error {
  constructor(readonly reason: 'unknown_id' | 'differ') { super(reason === 'unknown_id' ? 'A subject id is not in the base script' : 'The characters and subjects differ'); }
}

const isNew = (id: string) => { const value = id.trim(); return value === '' || value.toLowerCase() === 'null'; };
const characterNames = (subjects: readonly ScriptSubject[]) => subjects.filter(subject => subject.kind === 'character').map(subject => subject.name.trim());

/**
 * The script content to store for an assistant save: the new body with its subjects.
 * An empty list keeps the base's stored subjects, whose characters must match; a first save or a base saved before
 * subjects existed stores the subjects derived from the new script, so ids are fixed from then on.
 * A non-empty list is the full new list: ids from the base are kept, new subjects get server-made ids, and the
 * scene's characters become the character subjects' names. The result is validated by the caller.
 */
export function withSubjects(body: ScriptBody, base: SavedScript | null, subjects: readonly SubjectInput[]): SavedScript {
  if (subjects.length === 0) {
    if (!base?.subjects) return { ...body, subjects: scriptSubjects(body) };
    const named = characterNames(base.subjects), characters = new Set(body.scenes.flatMap(scene => scene.characters.map(name => name.trim())));
    if (named.length !== characters.size || named.some(name => !characters.has(name))) throw new ScriptSubjectsError('differ');
    return { ...body, subjects: base.subjects };
  }
  // The ids the assistant could have read: the base's stored subjects, or those derived from it.
  const known = new Set(base ? scriptSubjects(base).map(subject => subject.id) : []);
  const kept = new Set<string>();
  for (const subject of subjects) {
    if (isNew(subject.id)) continue;
    const id = subject.id.trim();
    if (!known.has(id) || kept.has(id)) throw new ScriptSubjectsError('unknown_id');
    kept.add(id);
  }
  // A new id never reuses one from the base, so work filed under a removed subject never moves to a new one.
  const taken = new Set([...known, ...kept]);
  const resolved = subjects.map(subject => {
    const name = subject.name.trim();
    if (!isNew(subject.id)) return { id: subject.id.trim(), kind: subject.kind, name };
    const id = newSubjectId(name, subject.kind, taken);
    taken.add(id);
    return { id, kind: subject.kind, name };
  });
  const characters = characterNames(resolved);
  return { ...body, subjects: resolved, scenes: body.scenes.map(scene => ({ ...scene, characters })) };
}
