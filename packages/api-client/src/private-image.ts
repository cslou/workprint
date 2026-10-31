import { MAX_UPLOAD_IMAGE_BYTES } from '@workprint/contracts';
import type { ClientResult } from './result.js';
let active=0;
const fail=():ClientResult<never>=>({ok:false,error:{code:'transport_failure',message:'Private image unavailable'}});
/** Bounded image/poster GET only. Never forwards API credentials or automatically reacquires access. */
export async function readPrivateImage(value:string,signal:AbortSignal):Promise<ClientResult<Blob>>{
  let url:URL;try{url=new URL(value);}catch{return fail();}
  if(signal.aborted || active>=2 || url.username || url.password || url.hash || !url.searchParams.has('X-Amz-Signature') || (url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))))return fail();
  active++;let completed=false;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let onAbort=()=>{};
  const interrupted=new Promise<ClientResult<never>>(resolve=>{onAbort=()=>{controller.abort();resolve(fail());};signal.addEventListener('abort',onAbort,{once:true});timer=setTimeout(onAbort,10000);});
  const work=async():Promise<ClientResult<Blob>>=>{
    try{
      const response=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
      const type=response.headers.get('content-type'),length=Number(response.headers.get('content-length'));
      if(!response.ok || !['image/png','image/jpeg'].includes(type??'') || !Number.isSafeInteger(length) || length<=0 || length>MAX_UPLOAD_IMAGE_BYTES){await response.body?.cancel();return fail();}
      const reader=response.body?.getReader();if(!reader)return fail();const chunks:BlobPart[]=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>length || size>MAX_UPLOAD_IMAGE_BYTES){await reader.cancel();return fail();}chunks.push(new Uint8Array(value));}}finally{reader.releaseLock();}
      completed=size===length;
      return completed?{ok:true,value:new Blob(chunks,{type:type!})}:fail();
    }catch{return fail();}finally{active--;}
  };
  try{return await Promise.race([work(),interrupted]);}finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);if(!completed)controller.abort();}
}
