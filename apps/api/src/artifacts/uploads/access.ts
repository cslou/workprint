import type { Pool } from 'pg';
import { operations, type OperationResponse } from '@workprint/contracts';
import type { PrivateObjectStorage } from '../../storage/index.js';
import { protectedMediaObjects } from '../media-objects.js';
import { BUILT_IN_OWNER, type ArtifactStore } from '../store.js';
import { UploadError,uploadError } from './errors.js';

/** Exact version/origin ownership before private pointers; signing never spans a SQL transaction. */
export function createMediaAccess(pool:Pool,reads:ArtifactStore,storage?:PrivateObjectStorage){
  return async(account:string,id:string):Promise<OperationResponse<'media'>>=>{
    try{
      const version=await reads.version(account,id);
      if(version.kind!=='image' && version.kind!=='video')throw new UploadError('not_found');
      const [row]=await protectedMediaObjects(pool,[id],version.builtIn?BUILT_IN_OWNER:account);
      if(!row)throw new UploadError('not_found');
      if(!storage)throw new UploadError('not_implemented','Private storage is not available');
      const issuedAt=new Date(Math.floor(Date.now()/1000)*1000),expiresAt=new Date(issuedAt.getTime()+60000);
      const [url,poster]=await Promise.all([storage.presignRead({key:row.objectKey,issuedAt,expiresAt}),row.posterKey?storage.presignRead({key:row.posterKey,issuedAt,expiresAt}):undefined]);
      const {width,height,durationMs,hasAudio}=version.media;
      return operations.media.response.parse({url,expiresAt:expiresAt.toISOString(),...(poster?{poster}:{}),measured:{width,height,...(durationMs!==undefined?{durationMs}:{}),...(hasAudio!==undefined?{hasAudio}:{})}});
    }catch(error){throw uploadError(error);}
  };
}
