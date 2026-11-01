import { savedReferenceContentSchema, type Version } from '@workprint/contracts';
import type { ManualTextTarget } from '@workprint/api-client';

type Content = ReturnType<typeof savedReferenceContentSchema.parse>;
export type ReferenceDraft = Pick<Content, 'references'> & { description: string };
export function readReferenceDraft(text: string): ReferenceDraft {
  return JSON.parse(text) as ReferenceDraft;
}
const content = (version: Version) => version.kind === 'reference' ? savedReferenceContentSchema.safeParse(version.content) : null;
/** Structured UI fields use the existing immutable manual-save lifecycle, not a second writer. */
export const referenceTarget: ManualTextTarget = {
  read(version) {
    const parsed = content(version);
    return parsed?.success ? JSON.stringify({ description: parsed.data.subject.description, references: parsed.data.references }) : null;
  },
  replace(version, text) {
    const parsed = content(version);
    if (!parsed?.success) return null;
    try {
      const draft = readReferenceDraft(text);
      const next = savedReferenceContentSchema.safeParse({ ...parsed.data, subject: { ...parsed.data.subject, description: draft.description }, references: draft.references });
      return next.success ? next.data : null;
    } catch { return null; }
  },
  dependencies(_base, next) { return savedReferenceContentSchema.parse(next).references.map(reference => reference.versionId); },
  compatible(base, latest) {
    const a = content(base), b = content(latest);
    return base.artifactId === latest.artifactId && !!a?.success && !!b?.success && JSON.stringify({ ...a.data.subject, description: '' }) === JSON.stringify({ ...b.data.subject, description: '' });
  },
};
