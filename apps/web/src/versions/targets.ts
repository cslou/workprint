import { contentSchema, savedReferenceContentSchema, savedScriptContentSchema, savedStoryboardContentSchema, type Version } from '@workprint/contracts';
import type { ManualTextTarget } from '@workprint/api-client';

export type SavedTextTarget = { kind: 'script-action' } | { kind: 'reference-description' } | { kind: 'shot'; shotId: string } | { kind: 'panel'; shotId: string; panelId: string };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function parsed(version: Version) {
  if (!('content' in version)) return null;
  const result = version.kind === 'script' ? savedScriptContentSchema.safeParse(version.content) : version.kind === 'reference' ? savedReferenceContentSchema.safeParse(version.content) : savedStoryboardContentSchema.safeParse(version.content);
  return result.success ? result.data : null;
}
function shape(version: Version) {
  const content = parsed(version);
  if (!content) return null;
  if ('scenes' in content) return { ...content, scenes: content.scenes.map(scene => ({ ...scene, script: scene.script.map(entry => 'action' in entry ? { action: '' } : { dialogue: { ...entry.dialogue, text: '' } }) })) };
  if ('subject' in content) return { ...content, subject: { ...content.subject, description: '' } };
  return { ...content, shots: content.shots.map(shot => ({ ...shot, intent: '', panels: shot.panels.map(panel => ({ ...panel, description: '' })) })) };
}
/** Only inspected existing leaves: no arbitrary paths, compound-Script flattening or index inference. */
export function savedTextTarget(target: SavedTextTarget): ManualTextTarget {
  const read: ManualTextTarget['read'] = version => {
    const content = parsed(version);
    if (!content) return null;
    if (target.kind === 'script-action' && 'scenes' in content) {
      const scene = content.scenes[0], entry = scene?.script[0];
      return content.scenes.length === 1 && scene?.script.length === 1 && entry && 'action' in entry ? entry.action : null;
    }
    if (target.kind === 'reference-description' && 'subject' in content) return content.subject.description;
    if ((target.kind === 'shot' || target.kind === 'panel') && 'shots' in content) {
      const shot = content.shots.find(shot => shot.shotId === target.shotId);
      return target.kind === 'shot' ? shot?.intent ?? null : shot?.panels.find(panel => panel.panelId === target.panelId)?.description ?? null;
    }
    return null;
  };
  return {
    read,
    replace(version, text) {
      if (!('content' in version) || read(version) === null) return null;
      const content = parsed(version);
      if (!content) return null;
      if (target.kind === 'script-action' && 'scenes' in content) { const entry = content.scenes[0]?.script[0]; if (!entry || !('action' in entry)) return null; entry.action = text; }
      else if (target.kind === 'reference-description' && 'subject' in content) content.subject.description = text;
      else if ((target.kind === 'shot' || target.kind === 'panel') && 'shots' in content) {
        const shot = content.shots.find(shot => shot.shotId === target.shotId);
        if (!shot) return null;
        if (target.kind === 'shot') shot.intent = text;
        else { const panel = shot.panels.find(panel => panel.panelId === target.panelId); if (!panel) return null; panel.description = text; }
      } else return null;
      const json = contentSchema.safeParse(JSON.parse(JSON.stringify(content)));
      if (!json.success) return null;
      return read({ ...version, content: json.data }) !== null ? json.data : null;
    },
    compatible(base, latest) {
      return base.artifactId === latest.artifactId && base.kind === latest.kind && read(base) !== null && read(latest) !== null && equal(base.dependencies, latest.dependencies) && equal(shape(base), shape(latest));
    },
  };
}
