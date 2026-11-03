/** How a dialogue line is heard: by its character on screen or off screen, as that character's voice-over, or as narration. */
export type LineVoice = 'on_screen' | 'off_screen' | 'voice_over' | 'narration';

/**
 * The one rule for how a line is heard. The agent decides by the speaker it names: a `voice_over` line by a character
 * in the scene is that character's own voice-over, and any other is narration.
 */
export function lineVoice(line: Readonly<{ character: string; delivery?: 'voice_over' | 'off_screen' | undefined }>, sceneCharacters: ReadonlySet<string>): LineVoice {
  if (line.delivery === 'off_screen') return 'off_screen';
  if (line.delivery === 'voice_over') return sceneCharacters.has(line.character.trim()) ? 'voice_over' : 'narration';
  return 'on_screen';
}
