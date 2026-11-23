import {randomUUID} from 'node:crypto';
import {validDeltaUrl} from './dashboard-changes.mjs';
import {dashboardFailure} from './dashboard-diagnostics.mjs';

const report='snapshot-sales-opportunity-lines',field='opportunityLines',queryVersion='opportunity-pages-v1';
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const fileName=value=>typeof value==='string'&&/^[a-f0-9-]{36}\.json$/.test(value);
const fail=()=>dashboardFailure('chunk_invalid');
const number=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
function validateDescriptor(value){
 if(value?.schema!==1||value.field!==field||!uuid(value.generation)||!Array.isArray(value.files)||value.files.length>1024)throw fail();
 for(const [sequence,item]of value.files.entries())if(!fileName(item.file)||item.sequence!==sequence||!number(item.rows,10000)||!number(item.bytes,8000000))throw fail();
 if(value.files.reduce((n,c)=>n+c.rows,0)>200000)throw fail();
 return value;
}
export function chunkedManifest(data){
 const chunked=validateDescriptor(data.chunked);
 return {...data,snapshot:{...data.snapshot,[field]:[]},chunked};
}
export function createDashboardChunkStore({write,unpack,entryPath,mutate,discard}){
 const summary=(value,coverage)=>{
  if(value?.format!=='daily-v1'||value.coverage?.from!==coverage.from||value.coverage?.to!==coverage.to||!Array.isArray(value.snapshot?.[field])||value.snapshot[field].length||value.availability?.partial!==false||Buffer.byteLength(JSON.stringify(value))>64000)throw fail();
  return value;
 };
 return {
  async open(id,fingerprint,coverage,version,resume=false){
   let draft,oldFiles=[];
   await mutate(id,data=>{
    data.chunkDrafts??={};const old=data.chunkDrafts[report];
    const reusable=resume&&old?.queryVersion===queryVersion&&old.fingerprint===fingerprint&&old.version===version&&old.coverage?.from===coverage.from&&old.coverage?.to===coverage.to&&Date.now()-Date.parse(old.createdAt)<6*3600000;
    if(reusable){
     validateDescriptor({schema:1,field,generation:old.generation,files:old.chunks});
     oldFiles=old.pending?.map(c=>c.file)||[];draft=structuredClone(old);delete draft.pending;
     data.chunkDrafts[report]=structuredClone(draft);
    }
    else{
     oldFiles=[...(old?.chunks||[]),...(old?.pending||[])].map(c=>c.file);
     draft={queryVersion,generation:randomUUID(),fingerprint,version,coverage,createdAt:new Date().toISOString(),chunks:[],cursor:null,pages:0,rows:0,done:false};
     data.chunkDrafts[report]=structuredClone(draft);
    }
   });
   if(oldFiles.length)await discard(id,[{chunkFiles:oldFiles}]);
   let pending=[];
   const result=()=>{
    if(!draft.done||pending.length)throw fail();
    return {...summary(draft.summary,coverage),chunked:{schema:1,field,generation:draft.generation,files:structuredClone(draft.chunks)}};
   };
   return {
    get done(){return draft.done},
    get cursor(){return draft.cursor},get sequence(){return draft.chunks.length},get pages(){return draft.pages},get rows(){return draft.rows},
    result,
    async append(frame){
     const sequence=draft.chunks.length+pending.length;
     if(draft.done||sequence>=1024||frame.seq!==sequence||!Array.isArray(frame.rows)||!frame.rows.length||frame.rows.length>10000)throw fail();
     const value={kind:'dashboard-rows-v1',userId:id,fingerprint,report,generation:draft.generation,field,sequence,rows:frame.rows};
     const bytes=Buffer.byteLength(JSON.stringify(value));if(bytes>8000000)throw dashboardFailure('chunk_limit',{bytes,limitBytes:8000000});
     const file=randomUUID()+'.json';
     pending.push({file,sequence,rows:frame.rows.length,bytes});
     // Reserve names durably so a process crash cannot leave untracked data files.
     await mutate(id,data=>{
      const current=data.chunkDrafts?.[report];
      if(current?.generation!==draft.generation||current.chunks.length!==draft.chunks.length)throw fail();
      current.pending=structuredClone(pending);
     });
     await write(entryPath(id,file),value);
    },
    async checkpoint(frame){
     const count=draft.rows+pending.reduce((n,c)=>n+c.rows,0),cursor=frame.cursor||null;
     if(draft.done||frame.sequence!==draft.chunks.length+pending.length||frame.pages!==draft.pages+1||!number(frame.pages,500)||frame.rows!==count||!number(count,200000)||typeof frame.done!=='boolean'||frame.done!==!cursor||(cursor&&(typeof cursor!=='string'||cursor.length>32000||cursor===draft.cursor||!validDeltaUrl(cursor,'opportunityproducts'))))throw fail();
     const next={...draft,chunks:[...draft.chunks,...pending],cursor,pages:frame.pages,rows:count,done:frame.done};
     if(next.done)next.summary=summary(frame.summary,coverage);
     await mutate(id,data=>{
      const current=data.chunkDrafts?.[report];
      if(current?.generation!==draft.generation||current.fingerprint!==fingerprint||current.chunks.length!==draft.chunks.length)throw fail();
      data.chunkDrafts[report]=next;
     });
     draft=next;pending=[];
    },
    async abort(){
     const files=pending.map(c=>c.file);pending=[];
     if(files.length){
      await mutate(id,data=>{if(data.chunkDrafts?.[report]?.generation===draft.generation)delete data.chunkDrafts[report].pending});
      await discard(id,[{chunkFiles:files}]);
     }
    }
   };
  },
  async hydrate(id,entry,data){
   if(!data.chunked)return data;
   if(entry.report!==report)throw fail();
   const descriptor=validateDescriptor(data.chunked),rows=[];
   for(const ref of descriptor.files){
    const value=await unpack(entryPath(id,ref.file));
    if(value?.kind!=='dashboard-rows-v1'||value.userId!==id||value.fingerprint!==entry.fingerprint||value.report!==report||value.generation!==descriptor.generation||value.field!==field||value.sequence!==ref.sequence||!Array.isArray(value.rows)||value.rows.length!==ref.rows)throw fail();
    rows.push(...value.rows);
   }
   return {...data,snapshot:{...data.snapshot,[field]:rows}};
  }
 };
}
