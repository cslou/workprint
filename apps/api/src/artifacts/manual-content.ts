import type { Version } from '@workprint/contracts';
import { parseContent } from './content.js';
import { ArtifactError } from './errors.js';

/** Stable JSON equality for command identity and closed-domain structural comparisons. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item)).join(',') + '}';
  return JSON.stringify(value);
}
function structure(kind: string, raw: unknown) {
  const content = parseContent(kind, raw);
  if ('scenes' in content) return { ...content, scenes: content.scenes.map(scene => ({ ...scene, script: scene.script.map(entry => 'action' in entry ? { action: '' } : { dialogue: { ...entry.dialogue, text: '' } }) })) };
  if ('subject' in content) return { ...content, subject: { ...content.subject, description: '' } };
  return { ...content, shots: content.shots.map(shot => ({ ...shot, intent: '', panels: shot.panels.map(panel => ({ ...panel, description: '' })) })) };
}
/** Manual saves change existing text, not dependency/selection/order/structure authority. */
export function assertManualTextChange(base: Version, content: unknown, dependencies: readonly string[]) {
  if (!('content' in base) || canonicalJson(base.dependencies) !== canonicalJson(dependencies) || canonicalJson(structure(base.kind, base.content)) !== canonicalJson(structure(base.kind, content))) throw new ArtifactError('invalid_input');
}
