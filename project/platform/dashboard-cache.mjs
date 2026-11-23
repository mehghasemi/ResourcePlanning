// Bounded process-local caches. Callers validate authorization and the current
// publication identity before looking up a report. No timers or stale TTLs.
export function createDashboardCache({maxBytes=64000000,maxEntries=64}={}){
 const values=new Map(),pending=new Map();let bytes=0
 return {
  async get(key,load){
   const cached=values.get(key)
   if(cached){values.delete(key);values.set(key,cached);return cached.value}
   if(pending.has(key))return pending.get(key)
   const task=(async()=>{const value=await load(),size=Buffer.byteLength(JSON.stringify(value));if(size<=maxBytes){values.set(key,{value,size});bytes+=size;while(bytes>maxBytes||values.size>maxEntries){const [old,entry]=values.entries().next().value;values.delete(old);bytes-=entry.size}}return value})()
   pending.set(key,task)
   try{return await task}finally{if(pending.get(key)===task)pending.delete(key)}
  },
  clear(){values.clear();bytes=0}
 }
}
export async function mapDashboardReads(items,load){
 const result=[]
 // Limit concurrent decryptors and peak memory on large publications.
 for(let start=0;start<items.length;start+=2)result.push(...await Promise.all(items.slice(start,start+2).map(load)))
 return result
}
