import type { Version } from '@workprint/contracts';
import type { BrowserClient } from '../api/client.js';
import { Button } from './controls.js';
import { StatusPill } from './status.js';
import { useOwnedImage } from '../api/use-owned-image.js';
import './upload-feedback.css';

export type MediaVersion=Extract<Version,{kind:'image'|'video'}>;
/** Read-only exact-version receipt, shared by upload and the existing persisted asset viewer. */
export function MediaReceipt({connection,version,file,state='Draft',close}:{connection:BrowserClient|undefined;version:MediaVersion;file?:Readonly<{name:string;size:number}>;state?:'Ready'|'Draft';close():void}){
  const preview=useOwnedImage(connection,version),video=version.kind==='video',media=version.media,noun=video?'poster':'image';
  const title=preview.phase==='ready'?`${video?'Video':'Image'} saved · Version ${version.revision}`:preview.phase==='loading'?`Loading ${noun} · Version ${version.revision}`:preview.phase==='expired'&&video?'Poster link expired':`${video?'Poster':'Image'} could not be loaded`;
  const copy=preview.phase==='ready'?(video?'Saved in this conversation. No Shot video has been chosen.':'Saved in this conversation. This does not approve the image as a reference.'):preview.phase==='loading'?'The saved version is unchanged. The image is not ready to display yet.':preview.phase==='expired'&&video?'The saved video is unchanged. Refresh access to this exact version; no upload is repeated.':'The saved version is unchanged. Try loading this exact version again.';
  const size=file?.size??media.byteSize,label=file?.name??(video?'MP4':media.contentType==='image/jpeg'?'JPEG':'PNG');
  return <section className="wp-upload-status wp-upload-media" aria-label="Saved media" data-media-version-id={version.id}>
    <h3>{title}</h3><span className="wp-upload-meta">{`${label} · ${size>=1024**2?`${(size/1024**2).toFixed(1)} MiB`:`${(size/1024).toFixed(1)} KiB`}`}</span>
    {preview.phase==='ready'&&preview.url?<><img className="wp-upload-image" src={preview.url} alt={video?'Saved video poster':'Saved image'} onError={preview.fail} onLoad={event=>{if(event.currentTarget.naturalWidth!==media.width||event.currentTarget.naturalHeight!==media.height)preview.fail();}}/><StatusPill state={state==='Ready'?'ready':'draft'}/><span className="wp-upload-meta">{` · ${media.width} × ${media.height}${video?` · ${Math.floor((media.durationMs??0)/60000)}:${String(Math.floor(((media.durationMs??0)/1000)%60)).padStart(2,'0')} · ${media.hasAudio?'AAC audio':'No audio'}`:` · ${media.contentType==='image/jpeg'?'JPEG':'PNG'}`}`}</span></>:<div className="wp-upload-well">{preview.phase==='loading'?`Loading ${noun}…`:`${video?'Poster':'Image'} unavailable`}</div>}
    <p role="status">{copy}</p><div className="wp-upload-actions">{preview.phase!=='ready'&&preview.phase!=='loading'&&<Button onPress={preview.retry}>{preview.phase==='expired'&&video?'Refresh poster':'Try again'}</Button>}<Button variant="secondary" onPress={close}>Close</Button></div>
    {video&&preview.phase==='ready'&&<p className="wp-upload-meta">Poster-only inspection here. Private video playback belongs to its later approved slice.</p>}
  </section>;
}
