import { useEffect,useState } from 'react';
import { readPrivateImage } from '@workprint/api-client';
import type { Version } from '@workprint/contracts';
import type { BrowserClient } from './client.js';

export function useOwnedImage(connection:BrowserClient|undefined,version:Version|null){
  const client=connection?.kind==='configured'?connection.client:null,media=version&&(version.kind==='image'||version.kind==='video')?version.media:null;
  const [revision,setRevision]=useState(0);const [snapshot,setSnapshot]=useState<{id:string;revision:number;client:typeof client;phase:'loading'|'ready'|'error'|'expired';url?:string}>();
  useEffect(()=>{
    if(!client||!version||!media)return;let alive=true,object:string|undefined;const controller=new AbortController(),id=version.id;
    const settle=(value:{phase:'loading'|'ready'|'error'|'expired';url?:string})=>setSnapshot({id,revision,client,...value});settle({phase:'loading'});
    void(async()=>{
      const access=await client.media({params:{id},query:{},body:{}},{signal:controller.signal});if(!alive)return;
      if(!access.ok||access.value.measured.width!==media.width||access.value.measured.height!==media.height||access.value.measured.durationMs!==media.durationMs||access.value.measured.hasAudio!==media.hasAudio){settle({phase:'error'});return;}
      const url=version.kind==='video'?access.value.poster:access.value.url;if(!url){settle({phase:'error'});return;}
      const result=await readPrivateImage(url,controller.signal);if(!alive)return;
      if(!result.ok){settle({phase:Date.parse(access.value.expiresAt)<=Date.now()?'expired':'error'});return;}
      object=URL.createObjectURL(result.value);settle({phase:'ready',url:object});
    })().catch(()=>{if(alive)settle({phase:'error'});});
    return()=>{alive=false;controller.abort();if(object)URL.revokeObjectURL(object);};
  },[client,version,media,revision]);
  const state=snapshot?.id===version?.id&&snapshot?.revision===revision&&snapshot?.client===client?snapshot:{phase:'loading' as const};
  return{...state,retry:()=>setRevision(n=>n+1),fail:()=>{if(version)setSnapshot({id:version.id,revision,client,phase:'error'});}};
}
