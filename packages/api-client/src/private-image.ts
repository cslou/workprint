import { MAX_UPLOAD_IMAGE_BYTES, MAX_UPLOAD_VIDEO_BYTES } from '@workprint/contracts';
import type { ClientResult } from './types.js';
type Slots={active:number;max:number;waiting:(()=>void)[]};
type Policy={types:readonly string[];maxBytes:number;exactBytes?:number;timeoutMs:number;slots:Slots};
const images:Slots={active:0,max:2,waiting:[]},downloads:Slots={active:0,max:1,waiting:[]};
/** Reads past the cap wait their turn in order, at most this many; leaving (abort) gives up the place. */
const MAX_WAITING=64;
function acquire(slots:Slots,signal:AbortSignal):Promise<boolean>{
  if(signal.aborted)return Promise.resolve(false);
  if(slots.active<slots.max){slots.active++;return Promise.resolve(true);}
  if(slots.waiting.length>=MAX_WAITING)return Promise.resolve(false);
  return new Promise(resolve=>{
    const grant=()=>{signal.removeEventListener('abort',leave);slots.active++;resolve(true);};
    const leave=()=>{const index=slots.waiting.indexOf(grant);if(index>=0)slots.waiting.splice(index,1);resolve(false);};
    slots.waiting.push(grant);signal.addEventListener('abort',leave,{once:true});
  });
}
const release=(slots:Slots)=>{slots.active--;slots.waiting.shift()?.();};
const fail=():ClientResult<never>=>({ok:false,error:{code:'transport_failure',message:'Private object unavailable'}});
/** Bounded signed-object GET. Never forwards API credentials or automatically reacquires access. */
async function readPrivateObject(value:string,signal:AbortSignal,policy:Policy):Promise<ClientResult<Blob>>{
  let url:URL;try{url=new URL(value);}catch{return fail();}
  if(signal.aborted || url.username || url.password || url.hash || !url.searchParams.has('X-Amz-Signature') || (url.protocol!=='https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))))return fail();
  // The deadline starts once the read has its turn.
  if(!await acquire(policy.slots,signal))return fail();
  let completed=false;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let onAbort=()=>{};
  const interrupted=new Promise<ClientResult<never>>(resolve=>{onAbort=()=>{controller.abort();resolve(fail());};signal.addEventListener('abort',onAbort,{once:true});timer=setTimeout(onAbort,policy.timeoutMs);});
  const work=async():Promise<ClientResult<Blob>>=>{
    try{
      const response=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
      const type=response.headers.get('content-type'),length=Number(response.headers.get('content-length'));
      if(!response.ok || !policy.types.includes(type??'') || !Number.isSafeInteger(length) || length<=0 || length>policy.maxBytes || (policy.exactBytes!==undefined && length!==policy.exactBytes)){await response.body?.cancel();return fail();}
      const reader=response.body?.getReader();if(!reader)return fail();const chunks:BlobPart[]=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>length || size>policy.maxBytes){await reader.cancel();return fail();}chunks.push(new Uint8Array(value));}}finally{reader.releaseLock();}
      completed=size===length;
      return completed?{ok:true,value:new Blob(chunks,{type:type!})}:fail();
    }catch{return fail();}finally{release(policy.slots);}
  };
  try{return await Promise.race([work(),interrupted]);}finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);if(!completed)controller.abort();}
}
/** Bounded image/poster GET only. */
export function readPrivateImage(value:string,signal:AbortSignal):Promise<ClientResult<Blob>>{
  return readPrivateObject(value,signal,{types:['image/png','image/jpeg'],maxBytes:MAX_UPLOAD_IMAGE_BYTES,timeoutMs:10000,slots:images});
}
/** Downloads tolerate links as slow as 128 KiB/s after a 60 s allowance. */
export const privateVideoDeadlineMs=(byteSize:number)=>60000+Math.ceil(byteSize/131072)*1000;
/** One exact-version video download at a time; the bytes must match the version's measured type and size. */
export function readPrivateVideo(value:string,signal:AbortSignal,expected:{contentType:string;byteSize:number}):Promise<ClientResult<Blob>>{
  return readPrivateObject(value,signal,{types:[expected.contentType],maxBytes:MAX_UPLOAD_VIDEO_BYTES,exactBytes:expected.byteSize,timeoutMs:privateVideoDeadlineMs(expected.byteSize),slots:downloads});
}
