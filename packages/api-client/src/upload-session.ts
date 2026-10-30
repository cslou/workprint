import { MAX_UPLOAD_IMAGE_BYTES,MAX_UPLOAD_VIDEO_BYTES,type OperationRequest,type OperationResponse } from '@workprint/contracts';
import type { ClientError,ClientResult } from './result.js';
import { transferUpload } from './upload-transfer.js';

type UploadClient={requestUpload(input:OperationRequest<'requestUpload'>,options?:{signal?:AbortSignal}):Promise<ClientResult<OperationResponse<'requestUpload'>>>;confirmUpload(input:OperationRequest<'confirmUpload'>,options?:{signal?:AbortSignal}):Promise<ClientResult<OperationResponse<'confirmUpload'>>>};
export type UploadScope=Readonly<{accountId:string;conversationId?:string}>;
export type UploadPhase='idle'|'scope-cleared'|'authorizing'|'uploading'|'verifying'|'saved'|'expired'|'interrupted'|'unknown'|'stopped'|'rejected-format'|'rejected-size'|'rejected-damaged'|'blocked';
export type UploadState=Readonly<{scopeKey:string|null;phase:UploadPhase;file:Readonly<{name:string;size:number;type:string;kind:'image'|'video'}>|null;failure:ClientError['code']|null;confirmationStarted:boolean;saved:OperationResponse<'confirmUpload'>|null}>;
type Capture={file:File;request:OperationRequest<'requestUpload'>;confirmation:string;grant?:OperationResponse<'requestUpload'>};
const keyOf=(scope:UploadScope|null)=>scope?JSON.stringify([scope.accountId,scope.conversationId??null]):null;
/** Explicit single-file lifecycle. No queue, reconnect work, automatic retries or mutation replay. */
export function createUploadSession(transfer:typeof transferUpload=transferUpload){
  let scope:UploadScope|null=null,client:UploadClient|undefined,captured:Capture|null=null,alive=true,generation=0,observer:AbortController|null=null;
  let state:UploadState={scopeKey:null,phase:'idle',file:null,failure:null,confirmationStarted:false,saved:null};const listeners=new Set<()=>void>();
  const update=(patch:Partial<UploadState>)=>{if(!alive)return;state={...state,...patch};for(const notify of listeners)notify();};
  const invalidate=()=>{generation++;observer?.abort();observer=null;};
  const busy=()=>['authorizing','uploading','verifying'].includes(state.phase);
  const uncertain=(code:ClientError['code'])=>['transport_failure','timed_out','cancelled','invalid_response','integration_failure'].includes(code);
  async function execute(mode:'authorize'|'transfer'|'confirm',onlyCheck=false):Promise<OperationResponse<'confirmUpload'>|undefined>{
    if(!alive || busy() || !captured)return;const command=captured,current=++generation,api=client;observer?.abort();const controller=new AbortController();observer=controller;
    const live=()=>alive && current===generation && captured===command;
    if(!api || !scope?.conversationId){update({phase:'blocked',failure:'not_implemented'});return;}
    try{
      if(mode==='authorize'){
        update({phase:'authorizing',failure:null});const result=await api.requestUpload(structuredClone(command.request),{signal:controller.signal});if(!live())return;
        if(!result.ok){const code=result.error.code;update({phase:uncertain(code)?'stopped':code==='not_found'?'expired':code==='unsupported'?'rejected-format':'blocked',failure:code});return;}
        if(result.value.maxBytes!==command.file.size){update({phase:'stopped',failure:'invalid_response'});return;}command.grant=Object.freeze({...result.value});
        if(onlyCheck){update({phase:'interrupted',failure:null});return;}mode='transfer';
      }
      const grant=command.grant;if(!grant){update({phase:'stopped',failure:'invalid_response'});return;}
      if(mode==='transfer'){
        if(Date.parse(grant.expiresAt)<=Date.now()){update({phase:'expired'});return;}
        update({phase:'uploading',failure:null});const result=await transfer(grant,command.file,{signal:controller.signal});if(!live())return;
        if(!result.ok){update({phase:Date.parse(grant.expiresAt)<=Date.now()?'expired':'interrupted',failure:result.error.code});return;}
      }
      update({phase:'verifying',failure:null,confirmationStarted:true});const result=await api.confirmUpload({params:{id:grant.uploadId},query:{},body:{operationId:command.confirmation}},{signal:controller.signal});if(!live())return;
      if(!result.ok){const code=result.error.code;update({phase:uncertain(code)?'unknown':code==='unsupported'?'rejected-format':code==='invalid_input'?'rejected-damaged':code==='not_found'?(Date.parse(grant.expiresAt)<=Date.now()?'expired':'interrupted'):code==='not_implemented'?'blocked':'unknown',failure:code});return;}
      const version=result.value.version,use=result.value.use;
      if((version.kind!=='image' && version.kind!=='video') || version.kind!==command.request.body.kind || version.createdBy!=='human' || version.media.byteSize!==command.file.size || version.media.contentType!==command.file.type || !use || use.versionId!==version.id || use.binding.purpose!=='reference' || use.state!=='draft'){update({phase:'unknown',failure:'invalid_response'});return;}
      const saved=structuredClone(result.value);update({phase:'saved',saved,failure:null});return saved;
    }catch{if(live())update({phase:mode==='confirm' || state.phase==='verifying'?'unknown':mode==='authorize'?'stopped':'interrupted',failure:'transport_failure'});}
  }
  return{
    getSnapshot:()=>state,
    subscribe(notify:()=>void){listeners.add(notify);return()=>{listeners.delete(notify);};},
    configure(next:UploadScope|null,nextClient?:UploadClient){if(!alive)return;const key=keyOf(next);if(key!==state.scopeKey){const hadFile=state.file!==null;invalidate();captured=null;scope=next?{...next}:null;client=nextClient;update({scopeKey:key,phase:hadFile?'scope-cleared':'idle',file:null,saved:null,failure:null,confirmationStarted:false});}else{scope=next?{...next}:null;client=nextClient;}},
    async select(file:File){if(!alive || busy())return;invalidate();const kind=file.type.startsWith('video/')?'video':'image';captured=null;update({phase:'idle',file:{name:file.name,size:file.size,type:file.type,kind},saved:null,failure:null,confirmationStarted:false});
      if(!['image/png','image/jpeg','video/mp4'].includes(file.type)){update({phase:'rejected-format'});return;}
      if(!file.size){update({phase:'rejected-damaged'});return;}if(file.size>(kind==='image'?MAX_UPLOAD_IMAGE_BYTES:MAX_UPLOAD_VIDEO_BYTES)){update({phase:'rejected-size'});return;}
      captured={file,request:{params:{id:scope?.conversationId??''},query:{},body:{operationId:crypto.randomUUID(),kind,filename:file.name,contentType:file.type,byteSize:file.size,intendedUse:{purpose:'reference'}}},confirmation:crypto.randomUUID()};return execute('authorize');
    },
    retry(){if(!alive || busy() || !captured)return Promise.resolve(undefined);return state.phase==='unknown'?execute('confirm'):state.phase==='interrupted'?execute('transfer'):state.phase==='stopped'?execute(captured.grant?'confirm':'authorize',!captured.grant):Promise.resolve(undefined);},
    authorizeAgain(){if(!alive || state.phase!=='expired' || !captured)return Promise.resolve(undefined);captured={...captured,request:{...captured.request,body:{...captured.request.body,operationId:crypto.randomUUID()}},confirmation:crypto.randomUUID()};delete captured.grant;return execute('authorize');},
    stop(){if(!alive || !busy())return;invalidate();update({phase:'stopped'});},
    close(){if(!alive)return;invalidate();captured=null;update({phase:'idle',file:null,saved:null,failure:null,confirmationStarted:false});},
    dispose(){if(!alive)return;invalidate();alive=false;captured=null;listeners.clear();},
  };
}
export type UploadSession=ReturnType<typeof createUploadSession>;
