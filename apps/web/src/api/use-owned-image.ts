import { useEffect,useMemo,useState } from 'react';
import type { Version } from '@workprint/contracts';
import type { BrowserClient } from './client.js';
import { readOwnedImage } from './owned-image-cache.js';

export function useOwnedImage(connection:BrowserClient|undefined,current:Version|null){
  // A version never changes, so the first object seen for an id is kept: each workspace refresh hands over a new
  // object for the same version, which would otherwise read the image again and blank it meanwhile.
  const version=useMemo(()=>current,[current?.id]);
  const client=connection?.kind==='configured'?connection.client:null,media=version&&(version.kind==='image'||version.kind==='video')?version:null;
  const [revision,setRevision]=useState(0);const [snapshot,setSnapshot]=useState<{id:string;revision:number;client:typeof client;phase:'loading'|'ready'|'error'|'expired';url?:string}>();
  useEffect(()=>{
    if(!client||!media)return;let alive=true,object:string|undefined;const id=media.id;
    const settle=(value:{phase:'loading'|'ready'|'error'|'expired';url?:string})=>setSnapshot({id,revision,client,...value});settle({phase:'loading'});
    // The bytes are shared by every place showing this version; each place keeps its own object URL.
    void readOwnedImage(client,media).then(result=>{
      if(!alive)return;
      if(!result.ok){settle({phase:result.phase});return;}
      object=URL.createObjectURL(result.blob);settle({phase:'ready',url:object});
    });
    return()=>{alive=false;if(object)URL.revokeObjectURL(object);};
  },[client,media,revision]);
  const state=snapshot?.id===version?.id&&snapshot?.revision===revision&&snapshot?.client===client?snapshot:{phase:'loading' as const};
  return{...state,retry:()=>setRevision(n=>n+1),fail:()=>{if(version)setSnapshot({id:version.id,revision,client,phase:'error'});}};
}
