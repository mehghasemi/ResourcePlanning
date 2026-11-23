import {createDashboardChunkStore,chunkedManifest} from './dashboard-chunk-store.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomUUID,createHash} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
import {dpapi} from './history.mjs'
import {windowsSid} from './crm-profile.mjs'
import {createDashboardCache} from './dashboard-cache.mjs'
export const dashboardFingerprint=connection=>createHash('sha256').update(JSON.stringify(connection||null)).digest('hex')
export const reportKey=(report,period={})=>report+':'+JSON.stringify(period)
const fail=()=>Object.assign(new Error('ایندکس داشبورد قابل خواندن نیست؛ نسخهٔ قبلی حفظ شده است.'),{status:503})
export function createDashboardIndex({scope,directory=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'BaridKnowledgeHub','dashboard-index'),codec=dpapi,identity=windowsSid}={}){
 if(!/^[a-f0-9]{64}$/.test(scope||''))throw Error('Index scope required')
 const locks=new Map()
 const metadataCache=createDashboardCache({maxBytes:8000000,maxEntries:32}),reportCache=createDashboardCache()
 let ownerPromise
 const ownerIdentity=()=>identity===windowsSid?(ownerPromise??=identity().catch(e=>{ownerPromise=null;throw e})):identity()
 const location=id=>{if(!/^[a-f0-9-]{36}$/.test(id||''))throw fail();return path.join(directory,scope,id)}
 const entryPath=(id,file)=>{if(!/^[a-f0-9-]{36}\.json$/.test(file||''))throw fail();return path.join(location(id),file)}
 async function unpack(file,metadata=false){try{const [bytes,owner]=await Promise.all([fs.readFile(file,'utf8'),ownerIdentity()]);const decode=async()=>{const box=JSON.parse(bytes);if(box.version!==1||typeof box.encrypted!=='string')throw fail();const value=JSON.parse(gunzipSync(Buffer.from(await codec(box.encrypted,true),'base64'),{maxOutputLength:100000000}).toString('utf8'));if(value.owner!==owner||value.scope!==scope)throw fail();return value};return metadata?structuredClone(await metadataCache.get(file+'\0'+owner+'\0'+bytes,decode)):await decode()}catch(e){if(e.code==='ENOENT')return null;throw fail()}}
 async function write(file,data){const value={...data,owner:await ownerIdentity(),scope},encrypted=await codec(gzipSync(Buffer.from(JSON.stringify(value))).toString('base64'));await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp',text=JSON.stringify({version:1,encrypted});try{await fs.writeFile(temp,text,{mode:0o600});await fs.rename(temp,file);if(path.basename(file)==='index.json')await metadataCache.get(file+'\0'+value.owner+'\0'+text,async()=>structuredClone(value))}finally{await fs.unlink(temp).catch(()=>{})}}
 async function metadata(id){const data=await unpack(path.join(location(id),'index.json'),true);if(!data)return {userId:id,reports:[],requested:[],state:'empty'};if(data.userId!==id||!Array.isArray(data.reports)||!Array.isArray(data.requested)||data.reports.length>50||data.requested.length>50)throw fail();return data}
 async function mutate(id,fn){const previous=locks.get(id)||Promise.resolve(),run=previous.catch(()=>{}).then(async()=>{const data=await metadata(id),result=await fn(data);await write(path.join(location(id),'index.json'),data);return result});locks.set(id,run);try{return await run}finally{if(locks.get(id)===run)locks.delete(id)}}
 async function discard(id,entries){
  reportCache.clear();
  const data=await metadata(id),live=new Set();
  for(const entry of [...data.reports,...(data.backups||[])]){live.add(entry.file);for(const file of entry.chunkFiles||[])live.add(file)}
  for(const draft of Object.values(data.chunkDrafts||{}))for(const chunk of draft.chunks||[])live.add(chunk.file);
  for(const entry of entries)for(const file of [entry.file,...(entry.chunkFiles||[])].filter(Boolean))if(!live.has(file))await fs.unlink(entryPath(id,file)).catch(e=>{if(e.code!=='ENOENT')throw e});
 }
 const chunks=createDashboardChunkStore({write,unpack,entryPath,metadata,mutate,discard});
 return {metadata,mutate,
  openChunks:(id,fingerprint,coverage,version,resume)=>chunks.open(id,fingerprint,coverage,version,resume),
  async stage(id,fingerprint,report,period,data,at){
   if(data.chunked){if(report!=='snapshot-sales-opportunity-lines')throw fail();data=chunkedManifest(data)}
   const bytes=Buffer.byteLength(JSON.stringify(data));if(bytes>32000000)throw Object.assign(new Error('گزارش بیش از حد بزرگ است.'),{status:502});
   const file=randomUUID()+'.json';await write(entryPath(id,file),{userId:id,fingerprint,report,period,data,at});
   return {key:reportKey(report,period),fingerprint,report,period,file,at,bytes:data.chunked?data.chunked.files.reduce((n,c)=>n+c.bytes,0):bytes,...(data.chunked?{chunkFiles:data.chunked.files.map(c=>c.file)}:{})};
  },
  async read(id,entry){
   const file=entryPath(id,entry.file),owner=await ownerIdentity(),key=JSON.stringify([id,owner,entry.file,entry.fingerprint,entry.key,entry.at]);
   const data=await reportCache.get(key,async()=>{
    const value=await unpack(file);
    if(!value||value.userId!==id||value.fingerprint!==entry.fingerprint||reportKey(value.report,value.period)!==entry.key||value.at!==entry.at)throw fail();
    value.data=await chunks.hydrate(id,entry,value.data);return value;
   });return data.data;
  },discard
 };
}
