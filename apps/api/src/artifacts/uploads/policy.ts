import type { PoolClient } from 'pg';
import { idSchema, operations } from '@workprint/contracts';
import { createArtifactStore } from '../store.js';
import { UploadError } from './errors.js';
import type { OwnedCheck, UploadRequest, UploadRow } from './types.js';

export const UPLOAD_LIFETIME_SECONDS = 300;
export const UPLOAD_LEASE_SECONDS = 60;
export const MAX_UPLOAD_ATTEMPTS = 10;
export async function authorizeUpload(check: OwnedCheck, account: string, conversation: string): Promise<void> {
  if (!idSchema.safeParse(account).success || !idSchema.safeParse(conversation).success) throw new UploadError('invalid_input');
  const owned = await check(account, conversation);
  if (owned.kind !== 'owned') throw new UploadError(owned.kind === 'not_found' ? 'not_found' : 'integration_failure');
}
export function parseUploadRequest(conversation: string, body: UploadRequest): UploadRequest {
  const parsed = operations.requestUpload.request.safeParse({ params: { id: conversation }, query: {}, body });
  if (!parsed.success) throw new UploadError('invalid_input');
  const input = parsed.data.body;
  if ((input.kind === 'image' && (!['image/png', 'image/jpeg'].includes(input.contentType) || input.byteSize > 10 * 1024 * 1024)) || (input.kind === 'video' && (input.contentType !== 'video/mp4' || input.byteSize > 64 * 1024 * 1024))) throw new UploadError('unsupported');
  const purpose = input.intendedUse?.purpose;
  if (purpose === 'script' || purpose === 'storyboard' || (purpose === 'panel_image' && input.kind !== 'image') || (purpose === 'shot_video' && input.kind !== 'video')) throw new UploadError('invalid_input');
  return input;
}
export async function uploadTarget(reads: ReturnType<typeof createArtifactStore>, account: string, conversation: string, intendedUse: UploadRequest['intendedUse']): Promise<string | null> {
  if (!intendedUse || intendedUse.purpose === 'reference') return null;
  if (intendedUse.purpose !== 'panel_image' && intendedUse.purpose !== 'shot_video') throw new UploadError('invalid_input');
  const workspace = await reads.workspace(account, conversation);
  const shot = workspace.storyboard.shots.find(shot => shot.shotId === intendedUse.shotId);
  if (!shot || (intendedUse.purpose === 'panel_image' && !shot.panels.some(panel => panel.panelId === intendedUse.panelId))) throw new UploadError('not_found');
  const version = workspace.storyboard.work?.version;
  if (!version || version.kind !== 'storyboard') throw new UploadError('not_found');
  return version.id;
}
/** No native/storage collaborator is invoked while locking the admitted exact planning base. */
export async function lockUploadTarget(client: PoolClient, row: Pick<UploadRow, 'owner_id' | 'conversation_id' | 'target_version_id'>): Promise<void> {
  if (!row.target_version_id) return;
  const target = (await client.query<{ version_id: string }>("SELECT version_id FROM artifacts.conversation_uses WHERE owner_id=$1 AND conversation_id=$2 AND purpose='storyboard' FOR SHARE", [row.owner_id, row.conversation_id])).rows;
  if (target.length !== 1 || target[0]?.version_id !== row.target_version_id) throw new UploadError('stale_revision');
}
