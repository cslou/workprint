import type { Pool } from 'pg';
import { operations, type OperationResponse } from '@workprint/contracts';
import type { PrivateObjectStorage } from '../../storage/index.js';
import type { ArtifactStore } from '../store.js';
import { UploadError,uploadError } from './errors.js';

/** Exact version/origin ownership before private pointers; signing never spans a SQL transaction. */
export function createMediaAccess(pool:Pool,reads:ArtifactStore,storage?:PrivateObjectStorage){
  return async(account:string,id:string):Promise<OperationResponse<'media'>>=>{
    try{
      const version=await reads.version(account,id);
      if(version.kind!=='image' && version.kind!=='video')throw new UploadError('not_found');
      const row=(await pool.query<{object_key:string;poster_key:string|null}>(`SELECT m.object_key,m.poster_key FROM artifacts.media_objects m
        JOIN artifacts.upload_objects o ON o.owner_id=m.owner_id AND o.object_key=m.object_key AND o.protected_version_id=m.version_id
        LEFT JOIN artifacts.upload_objects p ON p.owner_id=m.owner_id AND p.object_key=m.poster_key AND p.protected_version_id=m.version_id
        WHERE m.owner_id=$1 AND m.version_id=$2 AND (m.poster_key IS NULL OR p.object_key IS NOT NULL)`,[account,id])).rows[0];
      if(!row)throw new UploadError('not_found');
      if(!storage)throw new UploadError('not_implemented','Private storage is not available');
      const issuedAt=new Date(Math.floor(Date.now()/1000)*1000),expiresAt=new Date(issuedAt.getTime()+60000);
      const [url,poster]=await Promise.all([storage.presignRead({key:row.object_key,issuedAt,expiresAt}),row.poster_key?storage.presignRead({key:row.poster_key,issuedAt,expiresAt}):undefined]);
      const {width,height,durationMs,hasAudio}=version.media;
      return operations.media.response.parse({url,expiresAt:expiresAt.toISOString(),...(poster?{poster}:{}),measured:{width,height,...(durationMs!==undefined?{durationMs}:{}),...(hasAudio!==undefined?{hasAudio}:{})}});
    }catch(error){throw uploadError(error);}
  };
}
