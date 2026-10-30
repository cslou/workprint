import { savedReferenceContentSchema, savedScriptContentSchema, type Version } from '@workprint/contracts';
import type { MaterialPresentation } from './presentation.js';

/** Public validated content only; opaque fields and identifiers never supply display facts. */
export function savedMaterialPresentation(version: Version): MaterialPresentation | null {
  if (version.kind === 'script') {
    const parsed = savedScriptContentSchema.safeParse(version.content);
    if (!parsed.success) return null;
    const text = parsed.data.scenes.flatMap(scene => scene.script.map(entry => 'action' in entry ? entry.action : `${entry.dialogue.character}${entry.dialogue.delivery === 'voice_over' ? ' (voice-over)' : entry.dialogue.delivery === 'off_screen' ? ' (off-screen)' : ''}: “${entry.dialogue.text}”`)).join('\n\n');
    return { versionId: version.id, revision: version.revision, sections: [{ label: 'What happens', text }] };
  }
  if (version.kind === 'reference') {
    const parsed = savedReferenceContentSchema.safeParse(version.content);
    if (!parsed.success) return null;
    const subject = parsed.data.subject;
    const kind = { character: 'Character reference', environment: 'Environment reference', prop: 'Prop reference', style: 'Style reference' }[subject.kind];
    return { versionId: version.id, revision: version.revision, name: subject.name, description: kind,
      sheet: { kicker: kind, name: subject.name, summary: subject.description, sections: [
        { title: 'Identity', text: subject.continuityNotes.join('\n\n') },
        { title: 'Missing views', text: 'No images are supplied.' },
      ] } };
  }
  return null;
}
