/** Isolated read-only display prerequisites, not domain content schemas or server DTOs. */
export type ImagePresentation = Readonly<{ src: string; alt: string; caption?: string }>;
export type SectionPresentation = Readonly<{ label: string; text: string; field?: string }>;
export type MaterialPresentation = Readonly<{
  versionId: string; revision: number;
  sections?: readonly SectionPresentation[];
  shots?: readonly Readonly<{ shotId: string; title?: string; description: string; dialogue?: string }>[];
  duration?: string; look?: readonly string[];
  name?: string; description?: string; thumbnail?: ImagePresentation;
  /** `views`: a saved sheet's images in order, each by exact version id with its view. */
  sheet?: Readonly<{ kicker: string; name: string; summary: string; sections: readonly Readonly<{ title: string; text?: string; layout?: 'hero' | 'wide'; figures?: readonly ImagePresentation[] }>[]; views?: readonly Readonly<{ versionId: string; view: string }>[] }>;
}>;
export type MaterialPrerequisites = Readonly<{ presentations: readonly MaterialPresentation[]; history?: readonly import('@workprint/contracts').Version[] }>;
