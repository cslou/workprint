import type { UploadSession,UploadState } from '@workprint/api-client';
import type { OperationResponse } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { Button } from '../ui/controls.js';
import { MediaReceipt } from '../ui/media-receipt.js';
import '../ui/upload-feedback.css';

const stopCopy='Stopping only stops waiting here; it cannot revoke issued transfer access or undo a saved version.';
const labels={authorizing:'Checking permission for this conversation. The selected file is not saved yet.',uploading:'The file is transferring. It is not a saved version yet.',verifying:'Checking the file before saving it. Receiving bytes is not a successful save.',expired:'No saved version has been confirmed. Your selected file is kept. Upload again to request a new link.',interrupted:'Some bytes may have reached storage. No saved version has been confirmed. Try the same upload again while its link is valid.',unknown:'The upload may already be saved. Retry checks the same upload; closing does not undo a completed save.',stopped:'Stored bytes or a completed save may still exist. Check this same upload before starting another.','scope-cleared':'The previous file and feedback are cleared here. Already issued transfers or saved work are not undone.','rejected-damaged':'The file is damaged, incomplete or does not match its declared type. No version was saved.'};
export function UploadStatus({state,session,connection,choose,close,onSaved}:{state:UploadState;session:UploadSession;connection:BrowserClient|undefined;choose():void;close():void;onSaved?(result:OperationResponse<'confirmUpload'>):void}){
  if(['idle','blocked'].includes(state.phase))return null;
  const {phase,file,saved}=state,video=file?.kind==='video';
  if(phase==='saved'&&saved&&saved.version.kind==='image')return <MediaReceipt connection={connection} version={saved.version} {...(file?{file}:{})} close={close}/>;
  const busy=['authorizing','uploading','verifying'].includes(phase),noun=file?.type.startsWith('video/')?'video':file?.type.startsWith('image/')?'image':'file';
  const title=phase==='rejected-format'&&video?'Video uploads are temporarily unavailable':phase==='authorizing'?`Preparing ${file?.name}…`:phase==='uploading'?`Uploading ${file?.name}…`:phase==='verifying'?'Verifying upload…':phase==='expired'?'Upload link expired':phase==='interrupted'?'Upload interrupted':phase==='unknown'?'Save could not be confirmed':phase==='stopped'?'Stopped waiting for this upload':phase==='scope-cleared'?'Upload closed after scope change':phase==='rejected-damaged'?'This file could not be verified':`This ${noun} is ${phase==='rejected-size'?'too large':'not supported'}`;
  const copy=phase in labels?labels[phase as keyof typeof labels]:video?'Choose a JPEG or PNG image up to 10 MiB and 4096 × 4096 pixels. Earlier transfers or saved work are not undone.':'Use JPEG or PNG up to 10 MiB and 4096 × 4096 pixels. No version was saved.';
  const retry=async()=>{const saved=await session.retry();if(saved)onSaved?.(saved);},again=async()=>{const saved=await session.authorizeAgain();if(saved)onSaved?.(saved);};
  return <section className="wp-upload-status" aria-label="Upload status"><h3>{title}</h3>{file&&<span className="wp-upload-meta">{file.name} · {file.size>=1024**2?`${(file.size/1024**2).toFixed(1)} MiB`:`${(file.size/1024).toFixed(1)} KiB`}</span>}<p role="status">{copy}</p><div className="wp-upload-actions">
    {busy?<Button variant="secondary" onPress={()=>session.stop()}>Stop waiting</Button>:phase==='unknown'||phase==='stopped'?<><Button onPress={()=>void retry()}>{phase==='unknown'?'Retry confirmation':'Check upload'}</Button><Button variant="secondary" onPress={close}>Close</Button></>:phase==='scope-cleared'?<Button onPress={choose}>Choose a file</Button>:<>{phase==='expired'?<Button onPress={()=>void again()}>Upload again</Button>:phase==='interrupted'?<Button onPress={()=>void retry()}>Try again</Button>:null}<Button variant="secondary" onPress={choose}>{video?'Choose an image':'Choose another file'}</Button></>}
  </div>{busy&&<p className="wp-upload-meta">{stopCopy}</p>}</section>;
}
