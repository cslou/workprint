/** Labelled, exact-version-bound read-only facts for isolated display compositions only. */
export type StoryboardPrerequisites = Readonly<{
  versionId: string; revision: number; title?: string;
  shots?: readonly Readonly<{ shotId: string; camera?: string; duration?: string; status?: 'Draft' | 'Ready' }>[];
  images?: readonly Readonly<{ versionId: string; revision: number; src: string; alt: string }>[];
}>;
