import { savedContentSchemas } from '@workprint/contracts';
import { ArtifactError } from './errors.js';

/** Validate before persistence, and again before projecting persisted JSON. */
export function parseContent(kind: string, value: unknown) {
  if (kind !== 'script' && kind !== 'reference' && kind !== 'storyboard') throw new Error('Unsupported saved content kind');
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 256 * 1024) throw new Error('Saved content exceeds its bound');
  return savedContentSchemas[kind].parse(value);
}

/** Dependencies are exact owned versions resolved before entering the transaction. */
export function assertContentDependencies(content: ReturnType<typeof parseContent>, dependencies: ReadonlyMap<string, { kind: string }>) {
  const referenced = 'sourceScriptVersionId' in content ? [content.sourceScriptVersionId, ...content.shots.flatMap(shot => shot.panels.flatMap(panel => panel.references))]
    : 'references' in content ? content.references.map(reference => reference.versionId) : [];
  if (referenced.some(id => !dependencies.has(id))) throw new ArtifactError('invalid_input');
  if ('sourceScriptVersionId' in content && (dependencies.get(content.sourceScriptVersionId)?.kind !== 'script' || content.shots.some(shot => shot.panels.some(panel => panel.references.some(id => dependencies.get(id)?.kind !== 'reference'))))) throw new ArtifactError('invalid_input');
  // Media references cannot be published by this text-only boundary.
  if ('subject' in content && content.references.length > 0) throw new ArtifactError('invalid_input');
}
