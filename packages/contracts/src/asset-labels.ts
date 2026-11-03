import type { SheetViewName } from './sheet-views.js';

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

/**
 * The names of a video's assets and its generated videos together: generated videos count with the assets, so a
 * made clip and any other video never share a number. The assistant and the chat name media by this.
 */
export function workspaceMediaLabels(workspace: Readonly<{ assets: Parameters<typeof assetLabels>[0]; generatedVideos?: Parameters<typeof assetLabels>[0] | undefined }>): ReadonlyMap<string, string> {
  return assetLabels([...workspace.assets, ...(workspace.generatedVideos ?? [])]);
}

/**
 * One exact media version's name, as the assistant, the chat, Assets and Videos show it ("Video 1 · Version 2").
 * A version a current sheet lists (`views`, from `sheetViews`) is named by its subject and view: "Mara · Face close-up".
 */
export function mediaVersionName(labels: ReadonlyMap<string, string>, version: Readonly<{ id: string; artifactId: string; kind: string; revision: number }>, views?: ReadonlyMap<string, SheetViewName>): string {
  const member = views?.get(version.id);
  if (member) return sheetViewLabel(member);
  return `${labels.get(version.artifactId) ?? (version.kind === 'video' ? 'Video' : 'Image')} · Version ${version.revision}`;
}

/** A sheet image's name by its subject and view: "Mara · Face close-up". */
export function sheetViewLabel(member: Pick<SheetViewName, 'subjectName' | 'view'>): string {
  return `${member.subjectName} · ${member.view}`;
}
