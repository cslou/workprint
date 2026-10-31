import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireStableAvc } from '../src/artifacts/uploads/media-avc.js';

// Structural-only fixture isolates range accounting; actual codec/publication proof
// is in media-adversarial.security.test.ts. These bytes are not a decode verdict.
function sampleRanges(){
  const ints=(...values:number[])=>{const out=Buffer.alloc(values.length*4);values.forEach((value,i)=>out.writeUInt32BE(value,i*4));return out;};
  const box=(name:string,payload:Buffer)=>Buffer.concat([ints(payload.length+8),Buffer.from(name),payload]);
  const full=(name:string,payload:Buffer)=>box(name,Buffer.concat([ints(0),payload]));
  const sps=Buffer.from([0x67,0x42,0xc0,0x0b,0x80]),pps=Buffer.from([0x68,0x80]);
  const short=(value:number)=>{const out=Buffer.alloc(2);out.writeUInt16BE(value);return out;};
  const avcc=box('avcC',Buffer.concat([Buffer.from([1,66,192,11,255,225]),short(sps.length),sps,Buffer.from([1]),short(pps.length),pps]));
  const description=full('stsd',Buffer.concat([ints(1),box('avc1',Buffer.concat([Buffer.alloc(78),avcc]))]));
  const packet=Buffer.from([0,0,0,2,0x41,0x80]);
  const moov=(offset:number)=>box('moov',box('trak',box('mdia',Buffer.concat([
    full('hdlr',Buffer.concat([ints(0),Buffer.from('vide'),Buffer.alloc(12)])),
    box('minf',box('stbl',Buffer.concat([description,full('stsz',ints(packet.length,2)),full('stsc',ints(1,1,1,1)),full('stco',ints(2,offset,offset+packet.length))]))),
  ]))));
  const metadata=moov(moov(0).length+8);
  return Buffer.concat([metadata,box('mdat',Buffer.concat([packet,packet]))]);
}

test('AVC sample ranges cannot alias or run backward and amplify byte inspection',()=>{
  const valid=sampleRanges();assert.doesNotThrow(()=>requireStableAvc(valid));
  const alias=Buffer.from(valid),offset=alias.indexOf(Buffer.from('stco'));assert.ok(offset>0);
  alias.writeUInt32BE(alias.readUInt32BE(offset+12),offset+16);
  assert.throws(()=>requireStableAvc(alias),{code:'invalid_input'});
});
