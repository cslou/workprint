import { UploadError } from './errors.js';

type Box = { type: string; data: number; end: number };
const invalid = () => new UploadError('invalid_input');
const unsupported = () => new UploadError('unsupported');

/** Closed non-fragmented avc1: every decoded sample uses one immutable SPS/PPS pair.
 * Initial ffprobe geometry alone cannot authorize later in-band parameter changes.
 * Walk bounded sample tables, not raw mdat bytes (which can also contain AAC).
 */
export function requireStableAvc(bytes: Buffer) {
  let boxCount=0,nalCount=0;
  // Native avcC can retain Annex-B trailing_zero_8bits that samples omit.
  // SPS/PPS RBSP stop bits end in a nonzero byte; only zero padding is ignored.
  const parameterBytes=(nal:Buffer)=>{let end=nal.length;while(end>1&&nal[end-1]===0)end--;return nal.subarray(0,end);};
  const boxes=(start:number,end:number):Box[]=>{
    const found:Box[]=[];
    while(start<end){
      if(++boxCount>4096||start+8>end)throw invalid();
      const size=bytes.readUInt32BE(start);if(size<8||size>end-start)throw invalid();
      found.push({type:bytes.toString('ascii',start+4,start+8),data:start+8,end:start+size});start+=size;
    }
    return found;
  };
  const one=(list:Box[],type:string)=>{const found=list.filter(box=>box.type===type);if(found.length!==1)throw unsupported();return found[0]!;};
  const children=(box:Box)=>boxes(box.data,box.end);
  const table=(box:Box,stride:number)=>{
    if(box.data+8>box.end||bytes.readUInt32BE(box.data)!==0)throw invalid();
    const count=bytes.readUInt32BE(box.data+4);if(!count||count>7200||box.data+8+stride*count!==box.end)throw unsupported();
    return{count,start:box.data+8};
  };
  const top=boxes(0,bytes.length),mdat=one(top,'mdat'),tracks=children(one(top,'moov')).filter(box=>box.type==='trak');
  if(!tracks.length||tracks.length>2)throw unsupported();let videos=0;
  for(const track of tracks){
    const mdia=children(one(children(track),'mdia')),handler=one(mdia,'hdlr');
    if(handler.data+12>handler.end)throw invalid();
    if(bytes.toString('ascii',handler.data+8,handler.data+12)!=='vide')continue;
    if(++videos!==1)throw unsupported();
    const stbl=children(one(children(one(mdia,'minf')),'stbl')),stsd=one(stbl,'stsd');
    if(stsd.data+8>stsd.end||bytes.readUInt32BE(stsd.data)!==0||bytes.readUInt32BE(stsd.data+4)!==1)throw unsupported();
    const descriptions=boxes(stsd.data+8,stsd.end);if(descriptions.length!==1)throw unsupported();
    const entry=one(descriptions,'avc1');
    if(entry.data+78>entry.end)throw invalid();
    const avcc=one(boxes(entry.data+78,entry.end),'avcC');let p=avcc.data;
    if(p+7>avcc.end||bytes[p]!==1||(bytes[p+5]!&31)!==1)throw unsupported();
    const lengthBytes=(bytes[p+4]!&3)+1;if(lengthBytes===3)throw unsupported();p+=6;
    const parameter=(type:number)=>{
      if(p+2>avcc.end)throw invalid();const size=bytes.readUInt16BE(p);p+=2;
      if(!size||p+size>avcc.end||(bytes[p]!&31)!==type)throw invalid();
      const value=parameterBytes(bytes.subarray(p,p+size));p+=size;return value;
    };
    const sps=parameter(7);if(p>=avcc.end||bytes[p++]!==1)throw unsupported();const pps=parameter(8);if(p!==avcc.end)throw unsupported();
    const stsz=one(stbl,'stsz');
    if(stsz.data+12>stsz.end||bytes.readUInt32BE(stsz.data)!==0)throw invalid();
    const fixed=bytes.readUInt32BE(stsz.data+4),samples=bytes.readUInt32BE(stsz.data+8);
    if(!samples||samples>7200||stsz.data+12+(fixed?0:samples*4)!==stsz.end)throw unsupported();
    const offsets=stbl.filter(box=>box.type==='stco'||box.type==='co64');if(offsets.length!==1)throw unsupported();
    const offsetBox=offsets[0]!,stride=offsetBox.type==='stco'?4:8,chunks=table(offsetBox,stride),mapping=table(one(stbl,'stsc'),12);
    const maps=Array.from({length:mapping.count},(_,i)=>{
      const start=mapping.start+i*12,first=bytes.readUInt32BE(start),count=bytes.readUInt32BE(start+4);
      if(!first||first>chunks.count||!count||count>7200||bytes.readUInt32BE(start+8)!==1)throw unsupported();return{first,count};
    });
    if(maps[0]!.first!==1||maps.some((row,i)=>i>0&&row.first<=maps[i-1]!.first))throw invalid();
    let sample=0,map=0;
    for(let chunk=1;chunk<=chunks.count;chunk++){
      while(map+1<maps.length&&maps[map+1]!.first<=chunk)map++;
      const at=chunks.start+(chunk-1)*stride,raw=stride===4?BigInt(bytes.readUInt32BE(at)):bytes.readBigUInt64BE(at);
      if(raw>BigInt(bytes.length))throw invalid();let offset=Number(raw);
      for(let i=0;i<maps[map]!.count;i++){
        if(sample>=samples)throw invalid();const size=fixed||bytes.readUInt32BE(stsz.data+12+sample*4);sample++;
        const end=offset+size;if(!size||offset<mdat.data||end>mdat.end)throw invalid();
        while(offset<end){
          if(++nalCount>65536||offset+lengthBytes>end)throw invalid();const size=bytes.readUIntBE(offset,lengthBytes);offset+=lengthBytes;
          if(!size||size>end-offset||bytes[offset]!&128)throw invalid();const type=bytes[offset]!&31,nal=bytes.subarray(offset,offset+size);
          if(type===7?!parameterBytes(nal).equals(sps):type===8?!parameterBytes(nal).equals(pps):![1,5,6,9,10,11,12].includes(type))throw unsupported();
          offset+=size;
        }
      }
    }
    if(sample!==samples)throw invalid();
  }
  if(videos!==1)throw unsupported();
}
