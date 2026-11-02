import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { PrivateObjectStorage } from '../storage/index.js';
import { useRoom } from './use-room.js';
import { UploadError, uploadError } from './uploads/errors.js';

export const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** An assistant-made object to store privately before its save commits. */
export type GeneratedObject = Readonly<{ key: string; bytes: Buffer; contentType: string }>;

/**
 * Stores each object, checks the store kept the exact bytes, then runs `save`. If anything fails, every stored
 * object is removed, so none outlives the failed save; a removal that fails too is reported with the cause.
 */
export async function withStoredObjects<T>(storage: PrivateObjectStorage, objects: readonly GeneratedObject[], save: () => Promise<T>, label: string): Promise<T> {
  const stored: string[] = [];
  try {
    for (const object of objects) {
      const published = await storage.publish(object.key, object.bytes, object.contentType);
      stored.push(object.key);
      if (published.sha256 !== digest(object.bytes) || published.byteSize !== object.bytes.length) throw new UploadError('integration_failure');
    }
    return await save();
  } catch (error) {
    const failures: unknown[] = [];
    for (const key of stored) {
      try { await storage.remove(key); } catch (removeError) { failures.push(removeError); }
    }
    if (failures.length) throw new AggregateError([uploadError(error), ...failures.map(uploadError)], `${label} cleanup failed`, { cause: error });
    throw error;
  }
}

/** A save of assistant-made media that adds a use refuses when the video has no room. */
export async function requireUseRoom(client: PoolClient, account: string, conversation: string) {
  if (await useRoom(client, account, conversation) === 0) throw new UploadError('integration_failure');
}
