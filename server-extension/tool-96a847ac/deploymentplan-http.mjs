import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {requireTool,canManageTool,toolRoles} from '../../../platform-access.mjs'
import {componentVersion} from '../../../component-status.mjs'
import {crmUserGet} from '../../../crm-user.mjs'
import {planningMetadata,fetchPlanningSnapshot,listPlanningViews,verifyPlanningView,temporaryPlanningViewName,authorizedPlanningIds,authorizedPlanningProjects,authorizedPlanningEvidence} from './deploymentplan-crm.mjs'
import {importedPlanningView} from './deploymentplan-import.mjs'
import {sourceReviewEvidenceIds,canReadSourceEvidence} from './deploymentplan-reconciliation.mjs'
import {createPlanState,seedInitialExperts,applyCommand,applySnapshot,archiveWeeks,planView,today,fail} from './deploymentplan-engine.mjs'
// One encrypted workspace in the existing root-bound repository; no second database.
export const planningWorkspace='e3676820-a2db-4185-96d1-7b07e74af276'
export function createDeploymentplanHttp({root,store,repository,send,bodyJson,read=crmUserGet,clock=()=>new Date(),loadMetadata=planningMetadata,fetchSnapshot=fetchPlanningSnapshot,authorizeIds=authorizedPlanningIds,authorizeProjectIds=authorizedPlanningProjects,authorizeEvidenceIds=authorizedPlanningEvidence,readerFor}){
 const schemas=new Map(),jobs=new Map();let flight=null,ticking=false
 const fingerprint=u=>createHash('sha256').update(JSON.stringify([u.organization?.id,u.organization?.disabled,u.organization?.crm])).digest('hex')
 async function fresh(user){const u=await store.get(user?.id);if(!u?.enabled||u.revision!==user.revision)throw fail('نشست یا دسترسی تغییر کرده؛ دوباره وارد شوید.',401);requireTool(u,'tool-96a847ac');return u}
 function connection(u){const c=!u.organization?.disabled&&u.organization?.crm;if(!c?.userId||c.invalidated)throw fail('حساب سازمانی CRM را از تنظیمات مشترک متصل کنید.',428);return c}
 async function reader(u){return readerFor(u)}
 async function metadata(u,r){const k=u.id+fingerprint(u),v=schemas.get(k);if(v&&v.at>Date.now()-300000)return v.data;const data=await loadMetadata(r);schemas.set(k,{at:Date.now(),data});return data}
 async function rawState(){return (await repository.read(planningWorkspace)).deploymentplan||createPlanState()}
 async function state(){let s=await rawState();if(s.initialRosterVersion>=1)return s;await repository.mutate(planningWorkspace,v=>{const draft=v.deploymentplan??=createPlanState();if(seedInitialExperts(draft,clock().toISOString()))draft.revision++});return rawState()}
 async function update(u,revision,fn){return repository.mutate(planningWorkspace,async v=>{const current=await fresh(u);if(fingerprint(current)!==fingerprint(u))throw fail('اتصال حساب سازمانی تغییر کرده است.',409);const draft=v.deploymentplan??=createPlanState();if(revision!==undefined&&draft.revision!==revision)throw fail('برنامه هم‌زمان تغییر کرده؛ دوباره بارگذاری کنید.',409);seedInitialExperts(draft,clock().toISOString());const result=await fn(draft,current);draft.revision++;return {revision:draft.revision,result}})}
 async function archive(){const s=await rawState(),at=clock().toISOString();if(!archiveWeeks(structuredClone(s),at))return;await repository.mutate(planningWorkspace,v=>{const s=v.deploymentplan;if(s&&archiveWeeks(s,at))s.revision++})}
 async function allowed(u,s){const ids=[...new Set([...Object.keys(s.obligations),...Object.keys(s.sourceReferences||{})])],projects=Object.keys(s.sourceProjects||{}),evidence=sourceReviewEvidenceIds(s);if(!ids.length&&!projects.length&&!Object.keys(evidence).length)return {ids:[],projectIds:[],evidenceIds:[]};const r=await reader(u),meta=await metadata(u,r);return {ids:await authorizeIds(r,meta,ids),projectIds:projects.length?await authorizeProjectIds(r,meta,projects):[],evidenceIds:Object.keys(evidence).length?await authorizeEvidenceIds(r,evidence):[]}}
 function view(s,scope,u){const result=planView(s,scope.ids,today(clock()));Object.assign(result,importedPlanningView(s,scope.ids,{userId:u.id,allowedProjectIds:scope.projectIds,allowedEvidenceIds:scope.evidenceIds}));const ordinary=new Set(result.audit.map(a=>a.id)),sources=new Set(result.sourcePrograms.filter(p=>!p.restricted).map(p=>p.id));result.audit=s.audit.filter(a=>a.sourceReview?sources.has(a.sourceProgramId)&&canReadSourceEvidence(a.before?.evidence,scope)&&canReadSourceEvidence(a.after?.evidence,scope):ordinary.has(a.id));return result}
 const publicJob=j=>({id:j.id,state:j.state,message:j.message,startedAt:j.startedAt,finishedAt:j.finishedAt||null,count:j.count??null})
 async function startSync(u,mode='manual'){
  if(flight)throw fail('یک بازخوانی CRM در جریان است؛ پس از پایان دوباره تلاش کنید.',409)
  connection(u);const j={id:randomUUID(),userId:u.id,fingerprint:fingerprint(u),state:'running',message:'بررسی هویت و ساختار CRM',startedAt:clock().toISOString()};jobs.set(j.id,j);flight=j.id
  void (async()=>{try{const r=await reader(u),meta=await metadata(u,r),s=await rawState(),rows=await fetchSnapshot(r,meta,Object.keys(s.obligations),message=>{j.message=message},s.settings.crmView||{type:'auto',name:temporaryPlanningViewName});await fresh(u);await update(u,undefined,d=>applySnapshot(d,rows,u,clock().toISOString()));j.count=rows.length;j.state='success';j.message='دریافت کامل شد؛ تخصیص‌های موجود حفظ شدند.'}catch(e){j.state='failed';j.message=e.status?e.message:'دریافت CRM کامل نشد؛ برنامهٔ قبلی حفظ شد.';await update(u,undefined,d=>{d.lastFailure={at:clock().toISOString(),message:j.message,mode}}).catch(()=>{})}finally{j.finishedAt=clock().toISOString();flight=null;for(const [id,job]of jobs)if(job.state!=='running'&&Date.parse(job.finishedAt)<clock().getTime()-86400000)jobs.delete(id)}})()
  return publicJob(j)
 }
 async function tick(){if(ticking)return;ticking=true;try{await archive();const s=await rawState();if(!s.settings.periodic||flight||!s.settings.syncUserId)return;const last=Math.max(Date.parse(s.lastSync?.at||0)||0,Date.parse(s.lastFailure?.at||0)||0);if(clock().getTime()-last<s.settings.intervalMinutes*60000)return;const u=await store.get(s.settings.syncUserId);if(!u?.enabled||toolRoles(u)["tool-96a847ac"]==='none')return;await startSync(u,'periodic')}finally{ticking=false}}
 return {tick,async handle(req,res,url,user){
  const route=url.pathname;if(!['/deploymentplan','/deploymentplan/','/deploymentplan.html'].includes(route)&&!route.startsWith('/api/tool-96a847ac/'))return false
  user=await fresh(user);res.setHeader('Cache-Control','no-store')
  if(req.method==='GET'&&['/deploymentplan','/deploymentplan/','/deploymentplan.html'].includes(route)){send(res,200,await fs.readFile(path.join(root,'public/deploymentplan.html')),'text/html; charset=utf-8');return true}
  const action=route.slice('/api/tool-96a847ac/'.length)
  if(req.method==='GET'&&action==='meta'){let version=null;try{version=await componentVersion(root,'tool-96a847ac')}catch(e){if(e.message!=='Unknown component')throw e}send(res,200,{name:user.name,manager:canManageTool(user,'tool-96a847ac'),version,crmConnected:Boolean(!user.organization?.disabled&&user.organization?.crm?.userId&&!user.organization?.crm?.invalidated),crmIdentity:user.organization?.crm?.displayName||null});return true}
  if(req.method==='POST'&&action==='connection/check'){const p=await bodyJson(req);if(Object.keys(p).length)throw fail('تست فقط برای حساب سازمانی فعلی انجام می‌شود.');await reader(user);send(res,200,{state:'connected',identity:connection(user).displayName,checkedAt:clock().toISOString()});return true}
  if(req.method==='GET'&&action==='view/catalog'){send(res,200,{views:await listPlanningViews(await reader(user))});return true}
  if(req.method==='POST'&&action==='view/check'){if(!canManageTool(user,'tool-96a847ac'))throw fail('این اقدام فقط برای مدیر ابزار مجاز است.',403);const p=await bodyJson(req);if(!p||Object.keys(p).some(k=>!['type','reference'].includes(k)))throw fail('مشخصات ویو معتبر نیست.');send(res,200,await verifyPlanningView(await reader(user),p));return true}
  if(req.method==='GET'&&action==='job'){const j=jobs.get(url.searchParams.get('id'));if(!j||j.userId!==user.id||j.fingerprint!==fingerprint(user))throw fail('وضعیت دریافت پیدا نشد.',404);send(res,200,publicJob(j));return true}
  if(req.method==='POST'&&action==='sync'){const p=await bodyJson(req);if(Object.keys(p).some(k=>k!=='mode')||p.mode&&!['manual','entry'].includes(p.mode))throw fail('درخواست بازخوانی معتبر نیست.');const s=await rawState();if(p.mode==='entry'&&!s.settings.syncOnEntry){send(res,200,{state:'disabled'});return true}send(res,202,await startSync(user,p.mode||'manual'));return true}
  if(req.method==='GET'&&action==='state'){await archive();const s=await state(),scope=await allowed(user,s);send(res,200,view(s,scope,user));return true}
  if(req.method==='POST'&&action==='command'){
   const p=await bodyJson(req);if(!p||Object.keys(p).some(k=>!['revision','action','data'].includes(k))||!Number.isSafeInteger(p.revision)||typeof p.action!=='string'||!p.data||typeof p.data!=='object'||Array.isArray(p.data))throw fail('درخواست تغییر معتبر نیست.')
   const s=await state(),scope=await allowed(user,s),ids=new Set(scope.ids),manager=canManageTool(user,'tool-96a847ac'),data=p.data
   const references=new Set();if(data.blockId){const b=s.blocks.find(b=>b.id===data.blockId);if(b)references.add(b.obligationId)}
   for(const id of [data.id,...(Array.isArray(data.ids)?data.ids:[])].filter(Boolean)){const a=s.allocations.find(a=>a.id===id);if(a)references.add(a.obligationId);const r=s.requests.find(r=>r.id===id);if(r)references.add(r.before.obligationId);const c=planView(s,[...ids],today(clock())).conflicts.find(c=>c.id===id);if(c?.obligationId)references.add(c.obligationId)}
   if(data.projectId)for(const o of Object.values(s.obligations).filter(o=>o.projectId===data.projectId))references.add(o.id)
   if([...references].some(id=>!ids.has(id)))throw fail('به یکی از منابع CRM این عملیات دسترسی ندارید.',403)
   if(data.customerId&&!Object.values(s.obligations).some(o=>o.customerId===data.customerId&&ids.has(o.id)))throw fail('مشتری در دامنهٔ مجاز فعلی نیست.',403)
   try{send(res,200,await update(user,p.revision,(draft,current)=>applyCommand(draft,p.action,data,current,{manager,now:clock()})))}catch(e){if(e.status===409&&e.details?.warnings){send(res,409,{error:e.message,warnings:e.details.warnings});return true}throw e}return true
  }
  throw fail('مسیر ابزار پیدا نشد.',404)
 }}
}


