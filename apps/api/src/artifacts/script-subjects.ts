import { characterSubjectsMatch, newSubjectId, scriptSubjects, subjectNameKey, type ScriptSubject, type SubjectKind, type scriptBodySchema, type savedScriptContentSchema } from '@workprint/contracts';
import type { z } from 'zod';

/** A subject as the assistant sends it: an empty or whitespace id means a new subject. */
export type SubjectInput = Readonly<{ id: string; kind: SubjectKind; name: string }>;
type ScriptBody = z.infer<typeof scriptBodySchema>;
type SavedScript = z.infer<typeof savedScriptContentSchema>;

/** Why the assistant's subjects can't be saved: an id the base doesn't have, or characters that differ from kept subjects. */
export class ScriptSubjectsError extends Error {
  constructor(readonly reason: 'unknown_id' | 'differ') { super(reason === 'unknown_id' ? 'A subject id is not in the base script' : 'The characters and subjects differ'); }
}

const isNew = (id: string) => id.trim() === '';

/**
 * The script content to store for an assistant save: the new body with its subjects.
 * An empty list keeps the base's stored subjects, whose characters must match; a first save or a base saved before
 * subjects existed stores the subjects derived from the new script, so ids are fixed from then on. Derived subjects
 * that can't match the characters (names over 80 characters, names differing only in case, more than 50) differ too.
 * A non-empty list is the full new list: ids from the base are kept, new subjects get server-made ids, and the
 * scene's characters become the character subjects' names. A new subject with the name and kind of a base subject
 * the list leaves out is that subject, so a forgotten id is kept. A list that leaves out a character subject the
 * script still names differs, so a partial list never drops characters. The result is validated by the caller.
 */
export function withSubjects(body: ScriptBody, base: SavedScript | null, subjects: readonly SubjectInput[]): SavedScript {
  if (subjects.length === 0) {
    const subjects = base?.subjects ?? scriptSubjects(body);
    if (!characterSubjectsMatch(subjects, body.scenes)) throw new ScriptSubjectsError('differ');
    return { ...body, subjects };
  }
  // The subjects the assistant could have read: the base's stored subjects, or those derived from it.
  const readable: readonly ScriptSubject[] = base ? scriptSubjects(base) : [];
  const known = new Set(readable.map(subject => subject.id));
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
    const same = readable.find(candidate => !kept.has(candidate.id) && candidate.kind === subject.kind && subjectNameKey(candidate.name) === subjectNameKey(name));
    const id = same?.id ?? newSubjectId(name, subject.kind, taken);
    kept.add(id); taken.add(id);
    return { id, kind: subject.kind, name };
  });
  const characters = resolved.filter(subject => subject.kind === 'character').map(subject => subject.name);
  const named = new Set(body.scenes.flatMap(scene => scene.characters.map(subjectNameKey)));
  if (readable.some(subject => subject.kind === 'character' && !kept.has(subject.id) && named.has(subjectNameKey(subject.name)))) throw new ScriptSubjectsError('differ');
  return { ...body, subjects: resolved, scenes: body.scenes.map(scene => ({ ...scene, characters })) };
}
