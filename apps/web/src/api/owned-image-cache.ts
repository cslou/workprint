import { readPrivateImage } from '@workprint/api-client';
import type { Version } from '@workprint/contracts';
import type { BrowserClient } from './client.js';

type Client = Extract<BrowserClient, { kind: 'configured' }>['client'];
type MediaVersion = Extract<Version, { kind: 'image' | 'video' }>;
export type OwnedImageRead = { ok: true; blob: Blob } | { ok: false; phase: 'error' | 'expired' };
type Entry = { read: Promise<OwnedImageRead>; bytes: number };

/** Kept images, most recently used last, up to this many bytes in all. */
const MAX_KEPT_BYTES = 64 * 1024 * 1024;
/** How long one read may take, its turn in the download queue included. */
const READ_LIMIT_MS = 60_000;
const kept = new WeakMap<Client, Map<string, Entry>>();

async function load(client: Client, version: MediaVersion): Promise<OwnedImageRead> {
  const signal = AbortSignal.timeout(READ_LIMIT_MS), media = version.media;
  try {
    const access = await client.media({ params: { id: version.id }, query: {}, body: {} }, { signal });
    if (!access.ok || access.value.measured.width !== media.width || access.value.measured.height !== media.height || access.value.measured.durationMs !== media.durationMs || access.value.measured.hasAudio !== media.hasAudio) return { ok: false, phase: 'error' };
    const url = version.kind === 'video' ? access.value.poster : access.value.url;
    if (!url) return { ok: false, phase: 'error' };
    const result = await readPrivateImage(url, signal);
    if (!result.ok) return { ok: false, phase: Date.parse(access.value.expiresAt) <= Date.now() ? 'expired' : 'error' };
    return { ok: true, blob: result.value };
  } catch { return { ok: false, phase: 'error' }; }
}

/**
 * One read per exact version for this page and client: a version never changes, so its image is read once and
 * shared by every place that shows it. Failures are not kept, so trying again reads again.
 */
export function readOwnedImage(client: Client, version: MediaVersion): Promise<OwnedImageRead> {
  let images = kept.get(client);
  if (!images) kept.set(client, images = new Map());
  const found = images.get(version.id);
  if (found) { images.delete(version.id); images.set(version.id, found); return found.read; }
  const entry: Entry = { read: load(client, version), bytes: 0 };
  images.set(version.id, entry);
  const owned = images;
  void entry.read.then(result => {
    if (!result.ok) { if (owned.get(version.id) === entry) owned.delete(version.id); return; }
    entry.bytes = result.blob.size;
    let total = [...owned.values()].reduce((sum, item) => sum + item.bytes, 0);
    for (const [id, item] of owned) {
      if (total <= MAX_KEPT_BYTES) break;
      if (item !== entry && item.bytes) { owned.delete(id); total -= item.bytes; }
    }
  });
  return entry.read;
}

/** Forgets one version's copy, so the next read fetches it again: for an image that failed to show. */
export function forgetOwnedImage(client: Client, versionId: string): void { kept.get(client)?.delete(versionId); }

/** Forgets every copy read through this client: an account change must not keep the last account's images. */
export function forgetOwnedImages(client: Client): void { kept.delete(client); }
