type ShotLike = Readonly<{ shotId: string; order: number; panels: readonly Readonly<{ panelId: string; order: number }>[] }>;
export type StoryboardNames = Readonly<{ shot: (shotId: string) => string | undefined; panel: (shotId: string, panelId: string) => string | undefined }>;

/**
 * Shots and panels named by story order, as the assistant and the chat name them: "Shot 2" and "Shot 2 · Panel 2.1".
 * Undefined for a Shot or panel the storyboard doesn't have.
 */
export function storyboardNames(shots: readonly ShotLike[]): StoryboardNames {
  const shotNames = new Map<string, string>(), panelNames = new Map<string, Map<string, string>>();
  [...shots].sort((a, b) => a.order - b.order).forEach((shot, shotIndex) => {
    const name = `Shot ${shotIndex + 1}`;
    shotNames.set(shot.shotId, name);
    panelNames.set(shot.shotId, new Map([...shot.panels].sort((a, b) => a.order - b.order).map((panel, panelIndex) => [panel.panelId, `${name} · Panel ${shotIndex + 1}.${panelIndex + 1}`])));
  });
  return { shot: shotId => shotNames.get(shotId), panel: (shotId, panelId) => panelNames.get(shotId)?.get(panelId) };
}
