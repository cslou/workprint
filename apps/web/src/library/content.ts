import { savedReferenceContentSchema, savedScriptContentSchema, savedStoryboardContentSchema, type Version } from '@workprint/contracts';

export const kindLabel = { script: 'Script', reference: 'Reference', storyboard: 'Storyboard', image: 'Image', video: 'Video' } as const;
/** Display names come only from closed, validated public content, never opaque JSON or IDs. */
export function libraryDisplay(version: Version) {
  if (version.kind === 'reference') {
    const parsed = savedReferenceContentSchema.safeParse(version.content);
    if (parsed.success) return { name: parsed.data.subject.name, sub: `Version ${version.revision} · ${parsed.data.subject.kind}` };
  }
  if (version.kind === 'script') {
    const parsed = savedScriptContentSchema.safeParse(version.content);
    if (parsed.success) return { name: `${parsed.data.scenes[0]!.heading.location} script`, sub: `Version ${version.revision} · Script` };
  }
  if (version.kind === 'storyboard' && savedStoryboardContentSchema.safeParse(version.content).success) return { name: 'Storyboard', sub: `Version ${version.revision} · Storyboard` };
  if (version.kind === 'image' || version.kind === 'video') return { name: kindLabel[version.kind], sub: `Version ${version.revision} · ${version.media.width} × ${version.media.height}` };
  return { name: kindLabel[version.kind], sub: `Version ${version.revision}` };
}
export const bindingFor = (version: Pick<Version, 'kind'>) => version.kind === 'script' ? { purpose: 'script' as const } : version.kind === 'storyboard' ? { purpose: 'storyboard' as const } : { purpose: 'reference' as const };
