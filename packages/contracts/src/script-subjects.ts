import type { z } from 'zod';
import { subjectKinds, subjectNameKey, type scriptBodySchema, type scriptSubjectSchema } from './saved-content.js';

export type ScriptSubject = z.infer<typeof scriptSubjectSchema>;
export type SubjectKind = ScriptSubject['kind'];
type ScriptLike = Readonly<{ subjects?: readonly ScriptSubject[] | undefined; scenes: z.infer<typeof scriptBodySchema>['scenes'] }>;

const maxSubjects = 50, maxName = 80, maxSlug = 190;

/** A subject id made from its name: a lowercase slug, or its kind when the name has no letters or digits. */
function slugOf(name: string, kind: SubjectKind) {
  const base = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, maxSlug).replace(/^-+|-+$/g, '');
  return base || kind;
}

/** A new subject id from its name that is not in `taken`: the name's slug, then `-2`, `-3` and so on. */
export function newSubjectId(name: string, kind: SubjectKind, taken: ReadonlySet<string>): string {
  const base = slugOf(name, kind);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

const kindOrder = (subjects: readonly ScriptSubject[]) => subjectKinds.flatMap(kind => subjects.filter(subject => subject.kind === kind));

/**
 * The video's subjects, in Assets order: characters, then places, then props, each in script order.
 * A script lists them in `subjects`; one saved before subjects existed gets them derived: each character,
 * then the heading's location as one place, with ids made from their names. This is the one rule for Assets,
 * the tools and the agent.
 */
export function scriptSubjects(script: ScriptLike): ScriptSubject[] {
  if (script.subjects) return kindOrder(script.subjects);
  const subjects: ScriptSubject[] = [], names = new Set<string>(), ids = new Set<string>();
  const add = (raw: string, kind: SubjectKind) => {
    const name = raw.trim().slice(0, maxName).trim();
    if (!name || names.has(subjectNameKey(name)) || subjects.length >= maxSubjects) return;
    const id = newSubjectId(name, kind, ids);
    names.add(subjectNameKey(name)); ids.add(id);
    subjects.push({ id, kind, name });
  };
  for (const scene of script.scenes) for (const name of scene.characters) add(name, 'character');
  for (const scene of script.scenes) add(scene.heading.location, 'place');
  return subjects;
}
