import { lineVoice } from '@workprint/contracts';

/**
 * A dialogue line's speaker as the Storyboard shows it, by how it is heard (`lineVoice`): "Mara", "Mara (off screen)",
 * "Mara (voice-over)" for her own voice-over, or "Narration".
 */
export function deliveryLabel(line: Readonly<{ character: string; delivery?: 'voice_over' | 'off_screen' | undefined }>, sceneCharacters: ReadonlySet<string>): string {
  const character = line.character.trim();
  switch (lineVoice(line, sceneCharacters)) {
    case 'off_screen': return `${character} (off screen)`;
    case 'voice_over': return `${character} (voice-over)`;
    case 'narration': return 'Narration';
    case 'on_screen': return character;
  }
}
