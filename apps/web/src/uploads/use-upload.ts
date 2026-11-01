import { useLayoutEffect,useState,useSyncExternalStore } from 'react';
import { createUploadSession,type UploadSession } from '@workprint/api-client';
import type { BrowserClient } from '../api/client.js';
import type { ReadScope } from '../api/use-scoped-read.js';

export function useUpload(connection:BrowserClient|undefined,scope:ReadScope|null|undefined,supplied?:UploadSession){
  const [owned]=useState(()=>createUploadSession());const session=supplied??owned;const client=connection?.kind==='configured'?connection.client:undefined;
  const key=scope?JSON.stringify([scope.accountId,scope.conversationId??null]):null;
  useLayoutEffect(()=>{session.configure(scope??null,client);},[session,key,client,scope]);
  useLayoutEffect(()=>()=>{if(!supplied)owned.dispose();},[owned,supplied]);
  const state=useSyncExternalStore(session.subscribe,session.getSnapshot);
  return{session,state:state.scopeKey===key?state:{...state,scopeKey:key,phase:state.file?'scope-cleared' as const:'idle' as const,file:null,saved:null,failure:null}};
}
