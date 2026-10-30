import { useEffect,useState } from 'react';
import { readPrivateImage } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';

export function useUploadPreview(connection:BrowserClient|undefined,saved:OperationResponse<'confirmUpload'>|null){
  const client=connection?.kind==='configured'?connection.client:null;
  const version=saved?.version,media=version && (version.kind==='image' || version.kind==='video')?version.media:null;
  const [revision,setRevision]=useState(0);const [snapshot,setSnapshot]=useState<{id:string;revision:number;phase:'loading'|'ready'|'error'|'expired';url?:string}>();
  useEffect(()=>{
    if(!client || !version || !media)return;let alive=true,object:string|undefined;const controller=new AbortController(),id=version.id;
    setSnapshot({id,revision,phase:'loading'});
    void(async()=>{
      const access=await client.media({params:{id},query:{},body:{}},{signal:controller.signal});if(!alive)return;
      if(!access.ok || access.value.measured.width!==media.width || access.value.measured.height!==media.height){setSnapshot({id,revision,phase:'error'});return;}
      const url=version.kind==='video'?access.value.poster:access.value.url;if(!url){setSnapshot({id,revision,phase:'error'});return;}
      const result=await readPrivateImage(url,controller.signal);if(!alive)return;
      if(!result.ok){setSnapshot({id,revision,phase:Date.parse(access.value.expiresAt)<=Date.now()?'expired':'error'});return;}
      object=URL.createObjectURL(result.value);setSnapshot({id,revision,phase:'ready',url:object});
    })().catch(()=>{if(alive)setSnapshot({id,revision,phase:'error'});});
    return()=>{alive=false;controller.abort();if(object)URL.revokeObjectURL(object);};
  },[client,version,media,revision]);
  const state=snapshot?.id===version?.id && snapshot?.revision===revision?snapshot:{phase:'loading' as const};
  return{...state,retry:()=>setRevision(n=>n+1),fail:()=>{if(version)setSnapshot({id:version.id,revision,phase:'error'});}};
}
