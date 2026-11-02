/**
 * The plain name of each artifact the video uses as an asset: "Image 2", "Video 1" or "Reference 3".
 * It counts per kind in workspace order, once per artifact, so every version of one artifact keeps its number.
 * The assistant, the chat and the Assets tab all name assets by this rule.
 */
export function assetLabels(assets: readonly Readonly<{ version: Readonly<{ artifactId: string; kind: string }> }>[]): ReadonlyMap<string, string> {
  const labels = new Map<string, string>(), counts = new Map<string, number>();
  for (const { version } of assets) {
    if (labels.has(version.artifactId)) continue;
    const label = version.kind === 'image' ? 'Image' : version.kind === 'video' ? 'Video' : 'Reference';
    const ordinal = (counts.get(label) ?? 0) + 1; counts.set(label, ordinal);
    labels.set(version.artifactId, `${label} ${ordinal}`);
  }
  return labels;
}
