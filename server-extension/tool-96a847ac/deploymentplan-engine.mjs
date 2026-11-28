export const planningAssumptions=s=>({autoSpreadConverter:s.settings?.planningAssumptions?.autoSpreadConverter!==false,converterWorkingDays:s.settings?.planningAssumptions?.converterWorkingDays===7?7:5});

const undoActions=new Set(['allocate','allocate-group','allocate-fitting','return-group','delete-allocation','approve','approve-partial','unapprove','move-group','review']);
export function applyCommand(s,action,p,user,options={}){
 if(action==='undo-planning'){
  const entry=(s.planningUndo||[]).find(e=>e.id===p.undoId&&e.userId===user.id&&!e.undone);if(!entry)throw fail('این تغییر قابل بازگشت نیست.',409);
  if((s.planningUndo||[]).some(e=>e.userId===user.id&&!e.undone&&e.atIndex>entry.atIndex))throw fail('ابتدا تغییر جدیدتر خود را برگردانید.',409);
  const draft=copy(s),refs=new Set();for(const key of ['allocations','requests'])for(const d of entry.changes[key]){const current=draft[key].find(x=>x.id===d.id);if(JSON.stringify(current||null)!==JSON.stringify(d.after))throw fail('این برنامه پس از تغییر شما ویرایش شده؛ بازگشت برای جلوگیری از حذف تغییر دیگری متوقف شد.',409);const a=d.before?.before||d.before||d.after?.before||d.after;if(a?.obligationId)refs.add(a.obligationId);if(!options.manager&&(d.before?.status==='confirmed'||d.after?.status==='confirmed'||key==='requests'&&current?.status!=='pending'))throw fail('بازگشت این تغییر به دسترسی مدیر نیاز دارد.',403);draft[key]=draft[key].filter(x=>x.id!==d.id);if(d.before)draft[key].push(copy(d.before))}
  if(options.allowedIds&&[...refs].some(id=>!options.allowedIds.has(id)))throw fail('به یکی از منابع این برنامه دسترسی ندارید.',403);
  for(const d of entry.changes.allocations){const a=d.before||d.after;if(a&&archived(a,today(options.now||new Date())))throw fail('برنامهٔ گذشته فقط خواندنی است.');if(d.before)validateAllocation(draft,d.before,today(options.now||new Date()),{ignoreId:d.id})}
  enforcePolicies(s,draft,p,user,options.now||new Date());draft.planningUndo.find(e=>e.id===entry.id).undone=true;for(const key of ['allocations','requests','exceptions','planningUndo','audit'])s[key]=draft[key];audit(s,user,'بازگشت تغییر برنامه',null,{undoId:entry.id},(options.now||new Date()).toISOString(),[...refs]);return {undoneId:entry.id,allocationIds:entry.changes.allocations.map(d=>d.id),allocations:entry.changes.allocations.filter(d=>d.before).map(d=>copy(d.before)),requestIds:entry.changes.requests.map(d=>d.id),requests:entry.changes.requests.filter(d=>d.before).map(d=>copy(d.before))}
 }
 if(options.undoNested||!undoActions.has(action))return executePlanningCommand(s,action,p,user,options);
 const before={allocations:copy(s.allocations),requests:copy(s.requests)},result=executePlanningCommand(s,action,p,user,{...options,undoNested:true}),changes={};let count=0;
 for(const key of ['allocations','requests']){const old=new Map(before[key].map(x=>[x.id,x])),next=new Map(s[key].map(x=>[x.id,x]));changes[key]=[...new Set([...old.keys(),...next.keys()])].filter(id=>JSON.stringify(old.get(id))!==JSON.stringify(next.get(id))).map(id=>({id,before:copy(old.get(id)||null),after:copy(next.get(id)||null)}));count+=changes[key].length}
 if(count){s.planningUndo||=[];const atIndex=(s.planningUndo.at(-1)?.atIndex||0)+1;s.planningUndo.push({id:randomUUID(),userId:user.id,atIndex,changes});if(s.planningUndo.length>200)s.planningUndo.splice(0,s.planningUndo.length-200)}return result
}
import {randomUUID,createHash} from 'node:crypto'
export const fail=(message,status=400,details)=>Object.assign(Error(message),{status,details})
export const kinds=['Implementation','Converter']
export const openStatuses=['Planned','Request To Plan Sprint','Waiting for Customer','Submit']
export const approvalStatuses=['Planned','Request To Plan Sprint']
export const absenceTypes=['مرخصی','مأموریت غیرمرتبط','آموزش داخلی','فعالیت داخلی','سایر عدم دسترسی']
export const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null
export const plusDays=(value,count)=>new Date(Date.parse(value)+count*86400000).toISOString().slice(0,10)
export const week=value=>plusDays(value,-((new Date(value).getUTCDay()+1)%7))
export const today=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
export const dates=(from,to)=>{if(!day(from)||!day(to)||to<from||Date.parse(to)-Date.parse(from)>732*86400000)throw fail('بازهٔ تاریخ معتبر نیست؛ حداکثر دو سال انتخاب کنید.');const out=[];for(let d=from;d<=to;d=plusDays(d,1))out.push(d);return out}
export const weeks=(from,to)=>dates(week(from),week(to)).filter(d=>week(d)===d)
const sum=list=>list.reduce((n,x)=>n+x,0)
const copy=value=>structuredClone(value)
const text=(value,max=1000)=>{if(typeof value!=='string'||value.length>max)throw fail('متن واردشده معتبر نیست.');return value.trim()}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20)
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const units=a=>sum(a.days.map(d=>d.units))
const archived=(a,now)=>a.days.some(d=>week(d.date)<week(now))
const noteActor=user=>({id:user.id,name:user.name})
function audit(s,user,action,before,after,now,obligationIds=[]){s.audit.push({id:randomUUID(),at:now,actor:noteActor(user),action,before:copy(before??null),after:copy(after??null),obligationIds:[...new Set(obligationIds)]})}
export const validationRules=[
 {id:'beforeSync',title:'استقرار قبل از سوئیچ، پیش از سینک نهایی',description:'بک‌لاگِ قبل از سوئیچ نباید در روز شروع سینک نهایی یا پس از آن قرار گیرد.',defaultMode:'block'},
 {id:'afterSync',title:'استقرار بعد از سوئیچ، پس از سینک نهایی',description:'بک‌لاگِ بعد از سوئیچ نباید در روز پایان سینک نهایی یا پیش از آن قرار گیرد.',defaultMode:'block'},
 {id:'referenceOrder',title:'حفظ ترتیب هفته‌های بک‌لاگ‌های پروژه',description:'بین دو تعهد مستقلِ هم‌نوع در یک پروژه، بک‌لاگ هفتهٔ دیرترِ CRM نباید در هفته‌ای زودتر شروع شود؛ روزهای داخل یک هفته مقایسه نمی‌شوند. بلوک‌های یک تعهد مستقل می‌مانند.',defaultMode:'block'},
 {id:'crmWeek',title:'اختلاف هفتهٔ تخصیص با CRM',description:'اگر هر روز تخصیص خارج از هفتهٔ Sprint Time باشد هشدار بده؛ تاریخ CRM تغییر نمی‌کند.',defaultMode:'warn'},
 {id:'expertOverlap',title:'تداخل ظرفیت کارشناس',description:'مجموع کار استقرار در هر هفته نباید بیش از پنج نفرروز شود؛ هم‌پوشانی روزها به‌تنهایی تداخل نیست. کانورت‌های موازی طبق قاعدهٔ موجود مجازند.',defaultMode:'warn'},
 {id:'absenceOverlap',title:'تداخل با عدم دسترسی',description:'برنامه با مرخصی، مأموریت یا سایر عدم دسترسی‌های ثبت‌شدهٔ کارشناس مقایسه شود.',defaultMode:'warn'},
 {id:'nonWorkingDay',title:'استقرار در پنجشنبه یا جمعه',description:'روز کاری معمول استقرار شنبه تا چهارشنبه است؛ روز تقویمی کانورت محدود نمی‌شود.',defaultMode:'warn'},
 {id:'conversionDeadline',title:'کانورت پس از سوئیچ مؤثر',description:'پایان تخصیص کانورت با تاریخ سوئیچ مؤثر پروژه کنترل شود.',defaultMode:'warn'},
 {id:'unknownStage',title:'مرحله یا مرجع سینک نامشخص',description:'اگر مرحلهٔ تعهد یا تاریخ سینک نهایی برای کنترل وابستگی معلوم نیست، ابهام اعلام شود.',defaultMode:'off'},
 {id:'projectPriority',title:'ترتیب اولویت‌های CRM پروژه',description:'هفتهٔ پایان تعهد با اولویت عددی پایین‌تر نباید بعد از هفتهٔ شروع تعهد با اولویت بالاتر باشد؛ یک هفتهٔ مشترک مجاز است و اولویت‌های برابر مقایسه نمی‌شوند.',defaultMode:'warn'}
];
export function validationPolicies(s){return Object.fromEntries(validationRules.map(r=>[r.id,s.settings.validationPolicies?.[r.id]??r.defaultMode]))}
const conflictRule={'تداخل کارشناس':'expertOverlap','هم‌پوشانی با عدم دسترسی':'absenceOverlap','استقرار خارج روزهای معمول':'nonWorkingDay','تأخیر کانورت نسبت به سوئیچ':'conversionDeadline','تعارض ترتیب پروژه':'projectPriority'};
const normalizedTitle=o=>String(o.title||'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[‌\s]+/g,' ');
export function syncWindow(s,projectId,{source=false}={}){
 const rows=Object.values(s.obligations).filter(o=>o.projectId===projectId&&o.kind==='Converter'&&/سینک\s*نهایی|final\s*sync/i.test(normalizedTitle(o))&&o.week).sort((a,b)=>a.week.localeCompare(b.week));
 if(!rows.length)return null;const last=rows.at(-1).week,latest=rows.filter(o=>o.week===last),ids=latest.map(o=>o.id),allocations=s.allocations.filter(a=>ids.includes(a.obligationId)),days=source?[]:allocations.flatMap(a=>a.days.map(d=>d.date)).sort();
 const complete=latest.every(o=>o.sizeUnits>0&&allocations.filter(a=>a.obligationId===o.id).reduce((n,a)=>n+units(a),0)>=o.sizeUnits),fallbackEnd=plusDays(last,6);return {start:days[0]||last,end:days.length&&complete?days.at(-1):[fallbackEnd,...days].sort().at(-1),source:days.length&&complete?'allocation':days.length?'partial-allocation-and-crm':'crm',allocationIds:allocations.map(a=>a.id)}
}
export function obligationStage(s,o){
 const title=normalizedTitle(o),before=/قبل\s*از\s*س[وؤیئ]+چ|before\s*switch/i.test(title),after=/بعد\s*از\s*س[وؤیئ]+چ|after\s*switch/i.test(title);
 if(before!==after)return before?'before':'after';if(before&&after)return 'unknown';
 const reference=syncWindow(s,o.projectId,{source:true});if(reference&&o.week)return o.week<reference.start?'before':o.week>reference.end?'after':'unknown';return 'unknown'
}
export function validationIssues(s,current=today()){
 const out=[],policies=validationPolicies(s),add=(ruleId,o,allocationIds,message,details={})=>{if(policies[ruleId]==='off')return;out.push({id:hash([ruleId,policies[ruleId],s.settings.validationMessages?.[ruleId]||'',o.id,allocationIds.map(id=>s.allocations.find(a=>a.id===id)?.blockId||id),{...details,...details.allocations?{allocations:details.allocations.map(id=>s.allocations.find(a=>a.id===id)?.blockId||id)}:{}}]),ruleId,mode:policies[ruleId],type:validationRules.find(r=>r.id===ruleId).title,obligationId:o.id,customer:o.customer||'',project:o.project||'',allocationIds,message:s.settings.validationMessages?.[ruleId]?.trim()||message,details})};
 for(const a of s.allocations){const o=s.obligations[a.obligationId];if(!o)continue;
  if(o.week&&a.days.some(d=>week(d.date)!==o.week))add('crmWeek',o,[a.id],'هفتهٔ تخصیص با هفتهٔ مرجع CRM یکسان نیست.',{reference:o.week,weeks:[...new Set(a.days.map(d=>week(d.date)))]});
  if(o.kind!=='Implementation')continue;const phase=obligationStage(s,o),sync=syncWindow(s,o.projectId);
  if(phase==='unknown'||!sync){add('unknownStage',o,[a.id],!sync?'هیچ سینک نهاییِ دارای هفته برای این پروژه در مرجع موجود نیست؛ کنترل وابستگی قابل تأیید نیست.':'مرحلهٔ این بک‌لاگ از عنوان یا هفتهٔ CRM مشخص نیست؛ کنترل وابستگی قابل تأیید نیست.');continue}
  const ids=[a.id,...sync.allocationIds];if(phase==='before'&&a.days.some(d=>d.date>=sync.start))add('beforeSync',o,ids,'این بک‌لاگ قبل از سوئیچ است و باید پیش از شروع سینک نهایی برنامه‌ریزی شود.',{syncStart:sync.start,syncEnd:sync.end,dates:a.days.map(d=>d.date),basis:sync.source});
  if(phase==='after'&&a.days.some(d=>d.date<=sync.end))add('afterSync',o,ids,'این بک‌لاگ بعد از سوئیچ است و باید پس از پایان سینک نهایی برنامه‌ریزی شود.',{syncStart:sync.start,syncEnd:sync.end,dates:a.days.map(d=>d.date),basis:sync.source});
 }
 const projects=new Set(Object.values(s.obligations).map(o=>o.projectId).filter(Boolean));
 for(const projectId of projects){const rows=Object.values(s.obligations).filter(o=>o.projectId===projectId&&o.week).map(o=>({o,allocations:s.allocations.filter(a=>a.obligationId===o.id)})).filter(x=>x.allocations.length);
  for(const earlier of rows)for(const later of rows){if(earlier.o.kind!==later.o.kind||earlier.o.week>=later.o.week)continue;const first=x=>x.allocations.flatMap(a=>a.days.map(d=>d.date)).sort()[0];if(week(first(later))<week(first(earlier)))add('referenceOrder',later.o,[...earlier.allocations,...later.allocations].map(a=>a.id),'شروع بک‌لاگ هفتهٔ دیرتر، جلوتر از بک‌لاگ هفتهٔ زودترِ همین پروژه قرار گرفته است.',{earlierWeek:earlier.o.week,laterWeek:later.o.week,earlierStart:first(earlier),laterStart:first(later)})}
 }
 for(const c of conflicts(s,current)){const ruleId=conflictRule[c.type],o=s.obligations[c.obligationId];if(!ruleId||!o)continue;const ids=c.allocationId?[c.allocationId,...(c.details.allocations||[])]:s.allocations.filter(a=>a.obligationId===o.id||a.obligationId===c.details.previous).map(a=>a.id);const count=out.length;const related=ids.map(id=>s.allocations.find(a=>a.id===id)).filter(Boolean),dates=[...new Set(related.flatMap(a=>a.days.map(d=>d.date)))].filter(day=>related.filter(a=>a.days.some(d=>d.date===day)).length>1),context=ruleId==='expertOverlap'?'کارشناس: '+(s.experts.find(e=>e.id===related[0]?.expertId)?.name||'نامشخص')+'؛ برنامه‌های هم‌زمان: '+related.map(a=>{const row=s.obligations[a.obligationId];return (row?.customer||row?.project||'')+' — '+(row?.title||'')}).join(' / ')+'؛ تاریخ‌های هم‌پوشان (صرفاً اطلاع): '+dates.map(d=>new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(d+'T12:00:00Z'))).join('، '):'';add(ruleId,o,ids,c.details.message||c.type,{...c.details,...context?{context}:{}});if(out.length>count)out.at(-1).conflictId=c.id}
 return out
}
function enforcePolicies(before,after,p,user,now,precomputed=null){
 const changed=new Set(after.allocations.filter(a=>!same(a,before.allocations.find(b=>b.id===a.id))).map(a=>a.id));for(const a of before.allocations)if(!after.allocations.some(b=>b.id===a.id))changed.add(a.id);
 for(const obligationId of new Set([...before.allocations,...after.allocations].filter(a=>changed.has(a.id)).map(a=>a.obligationId))){const o=after.obligations[obligationId];if(o?.kind!=='Implementation'||o.sizeUnits<=10||o.closed)continue;const team=after.allocations.filter(a=>a.obligationId===obligationId),expertIds=new Set(),teamWeeks=new Set();for(const a of team){if(expertIds.has(a.expertId))throw fail('این بکلاگ استقرار به چند نیرو در همان هفته نیاز دارد؛ هر بلوک را به کارشناس متفاوت تخصیص دهید.',422);expertIds.add(a.expertId);for(const d of a.days)teamWeeks.add(week(d.date))}if(teamWeeks.size>1)throw fail('بلوک‌های یک بکلاگ استقرار چندنیرویی باید در یک هفته باشند؛ برای تغییر هفته، همهٔ بلوک‌های تخصیص‌یافتهٔ آن را با هم جابه‌جا کنید.',422)}
 const changedProjects=new Set(Object.keys(after.plans).filter(id=>!same(after.plans[id],before.plans[id])));
 const syncProjects=new Set([...before.allocations,...after.allocations].filter(a=>changed.has(a.id)).map(a=>after.obligations[a.obligationId]||before.obligations[a.obligationId]).filter(o=>o?.kind==='Converter'&&/سینک\s*نهایی|final\s*sync/i.test(normalizedTitle(o))).map(o=>o.projectId));
 const issues=(precomputed||validationIssues(after,today(now))).filter(i=>syncProjects.has(after.obligations[i.obligationId]?.projectId)&&['beforeSync','afterSync','unknownStage'].includes(i.ruleId)||i.allocationIds.some(id=>changed.has(id))||changedProjects.has(after.obligations[i.obligationId]?.projectId));
 const blocks=issues.filter(i=>i.mode==='block');if(blocks.length)throw fail('این جابه‌جایی با قواعد جلوگیری‌کننده سازگار نیست؛ برنامه ذخیره نشد.',422,{validations:blocks});
 const warnings=issues.filter(i=>i.mode==='warn');if(!warnings.length)return;
 if(!p.confirmWarnings||!Array.isArray(p.warningIds)||warnings.some(i=>!p.warningIds.includes(i.id)))throw fail('هشدارهای زیر به تأیید صریح نیاز دارند؛ برای ادامه آن‌ها را بررسی کنید.',409,{warnings,validations:warnings});
 const reason=text(p.reason||'تأیید هشدار توسط کاربر',1000);for(const i of warnings){const accepted={reason,actor:noteActor(user),at:now.toISOString()};after.exceptions[i.id]=accepted;if(i.conflictId)after.exceptions[i.conflictId]=accepted};audit(after,user,'پذیرش هشدارهای اعتبارسنجی',null,{ruleIds:[...new Set(warnings.map(i=>i.ruleId))],warningIds:warnings.map(i=>i.id),reason},now.toISOString(),warnings.map(i=>i.obligationId))
}
function allocateFitting(s,p,user,options){
 if(Array.isArray(p.items)&&p.items.some(x=>x.week&&x.week!==p.week)){if(p.items.length>50||new Set(p.items.map(x=>x.blockId)).size!==p.items.length)throw fail('بلوک‌های متفاوت انتخاب کنید.');const draft=copy(s),allocated=[],remaining=[];for(const item of p.items){const r=allocateFitting(draft,{...p,week:item.week||p.week,items:[{blockId:item.blockId}]},user,options);allocated.push(...r.allocated);remaining.push(...r.remaining)}for(const key of ['allocations','requests','plans','colors','exceptions','audit'])s[key]=draft[key];return {allocated,remaining,expertId:p.expertId,week:p.week}}
 const current=today(options.now||new Date());
 if(!Array.isArray(p.items)||!p.items.length||p.items.length>50||p.items.some(x=>!x||typeof x.blockId!=='string')||new Set(p.items.map(x=>x.blockId)).size!==p.items.length)throw fail('یک تا پنجاه بلوک متفاوت انتخاب کنید.');
 if(!day(p.week)||week(p.week)!==p.week||p.week<week(current))throw fail('هفتهٔ مقصد معتبر نیست؛ هفتهٔ گذشته قابل تخصیص نیست.');
 const draft=copy(s),ex=draft.experts.find(e=>e.id===p.expertId);if(!ex?.active)throw fail('کارشناس مقصد باید فعال و معتبر باشد.');
 const allocated=[],remaining=[],calendar=dates(p.week,plusDays(p.week,ex.kind==='Converter'&&planningAssumptions(s).autoSpreadConverter?Math.min(104,Math.ceil(Math.max(...p.items.map(item=>draft.blocks.find(b=>b.id===item.blockId)?.units||0))/ (planningAssumptions(s).converterWorkingDays*2))+1)*7-1:6)).filter(date=>ex.kind==='Converter'&&planningAssumptions(s).converterWorkingDays===7||![4,5].includes(new Date(date).getUTCDay()));
 for(const {blockId} of p.items){
  try{
   const b=draft.blocks.find(b=>b.id===blockId),o=b&&draft.obligations[b.obligationId],existing=draft.allocations.find(a=>a.blockId===blockId);
   if(!b||!o)throw fail('بلوک پیدا نشد؛ فهرست تعهدات را تازه کنید.',404);
   if(o.closed||!openStatuses.includes(o.status))throw fail('وضعیت این تعهد اجازهٔ تخصیص نمی‌دهد.');
   if(ex.kind!==o.kind)throw fail('گروه تخصصی کارشناس با این بلوک یکسان نیست.');
   if(existing&&(existing.expertId!==ex.id||existing.status==='confirmed'))throw fail('این بلوک قبلاً تخصیص دارد؛ تکمیل آن فقط برای همان کارشناس و در حالت پیشنهادی مجاز است.',409);
   const required=b.units-(existing?sum(existing.days.map(d=>d.units)):0);
   if(!Number.isSafeInteger(required)||required<=0)throw fail('این بلوک کار تخصیص‌نیافته‌ای ندارد.',409);
   const used=sum(draft.allocations.filter(a=>a.expertId===ex.id).flatMap(a=>a.days.filter(d=>week(d.date)===p.week).map(d=>d.units))),free=Math.max(0,10-used);
   if(ex.kind==='Implementation'&&required>free){remaining.push({blockId,code:'capacity',reason:'این بلوک کامل در ظرفیت آزاد همین هفته جا نمی‌شود.',requiredUnits:required,freeUnits:free,warnings:[],validations:[]});continue}
   let left=required;const candidateDays=copy(existing?.days||[]);
   for(const date of calendar){
    const usedOnDay=ex.kind==='Converter'?(existing?.days.find(d=>d.date===date)?.units||0):sum(draft.allocations.filter(a=>a.expertId===ex.id).flatMap(a=>a.days.filter(d=>d.date===date).map(d=>d.units)));
    const units=Math.min(left,Math.max(0,2-usedOnDay));if(!units)continue;
    const old=candidateDays.find(d=>d.date===date);if(old)old.units+=units;else candidateDays.push({date,units});left-=units;if(!left)break
   }
   if(left){remaining.push({blockId,code:'calendar',reason:'تمام کار باقیمانده در روزهای مجاز همین هفته جا نمی‌شود؛ بلوک شکسته یا به هفتهٔ بعد منتقل نشد.',requiredUnits:required,warnings:[],validations:[]});continue}
   const result=applyCommand(draft,'allocate',{id:existing?.id,blockId,expertId:ex.id,days:candidateDays.sort((a,b)=>a.date.localeCompare(b.date)),note:existing?.note||'',confirmWarnings:p.confirmWarnings,warningIds:p.warningIds,reason:p.reason},user,options);
   if(new Set(candidateDays.map(d=>week(d.date))).size>1){const stored=draft.allocations.find(a=>a.id===result.id);stored.assumedSchedule={source:'automatic-effort-spread',workingDays:ex.kind==='Converter'?planningAssumptions(s).converterWorkingDays:5,createdAt:(options.now||new Date()).toISOString(),originalObligationId:o.id};result.assumedSchedule=copy(stored.assumedSchedule)}
   allocated.push(result)
  }catch(e){if(!e.status)throw e;remaining.push({blockId,code:'validation',reason:e.message,warnings:e.details?.warnings||[],validations:e.details?.validations||[]})}
 }
 for(const key of ['allocations','requests','plans','colors','exceptions','audit'])s[key]=draft[key];
 return {allocated,remaining,expertId:ex.id,week:p.week}
}

function executePlanningCommand(s,action,p,user,options={}){
 if(action==='preview-fitting')return allocateFitting(copy(s),p,user,options);
 if(action==='allocate-fitting')return allocateFitting(s,p,user,options);
 if(action==='approve-partial'){
  if(!options.manager)throw fail('این اقدام فقط برای مدیر ابزار مجاز است.',403);
  if(!Array.isArray(p.ids)||!p.ids.length||p.ids.length>2000||new Set(p.ids).size!==p.ids.length)throw fail('تخصیص‌ها را انتخاب کنید.');
  try{const approved=applyCommand(s,'approve',p,user,options);return {approved,problems:[]}}catch(e){if(!e.status)throw e}
  const preview=copy(s);for(const a of preview.allocations)if(p.ids.includes(a.id))a.status='confirmed';const precomputedValidationIssues=validationIssues(preview,today(options.now||new Date()));
  const approved=[],problems=[];for(const id of p.ids){try{approved.push(...applyCommand(s,'approve',{...p,ids:[id]},user,{...options,precomputedValidationIssues}))}catch(e){if(!e.status)throw e;problems.push({id,message:e.message,warnings:e.details?.warnings||[],validations:e.details?.validations||[]})}}
  return {approved,problems}
 }

 if(!['allocate','allocate-group','delete-allocation','return-group','approve','unapprove','move-group','review','switch'].includes(action))return applyCommandCore(s,action,p,user,options);
 const draft=copy(s),result=applyCommandCore(draft,action,p,user,options),candidate=result?.requestId||result?.requestIds?.length?copy(draft):draft;
 for(const id of [...(result?.requestId?[result.requestId]:[]),...(result?.requestIds||[])]){const request=candidate.requests.find(r=>r.id===id);candidate.allocations=candidate.allocations.filter(a=>a.id!==request.allocationId);if(request.after)candidate.allocations.push(request.after)}
 const auditLength=candidate.audit.length;enforcePolicies(s,candidate,p,user,options.now||new Date(),options.precomputedValidationIssues);if(candidate!==draft){draft.exceptions=candidate.exceptions;draft.audit.push(...candidate.audit.slice(auditLength))}for(const key of ['allocations','requests','plans','colors','exceptions','archives','audit'])s[key]=draft[key];return result
}
export function createPlanState(){return {schema:1,revision:0,experts:[],obligations:{},blocks:[],allocations:[],absences:[],requests:[],plans:{},colors:{},exceptions:{},archives:{},audit:[],settings:{defaultWeeks:null,syncOnEntry:false,periodic:false,intervalMinutes:60,crmView:null,crmViewName:'همه بکلاگ های استقرار و کانورت پروژه های اتوماسیون'},lastSync:null}}
export function crmViewReference(input){
 if(input===null)return null
 if(!input||!['system','personal'].includes(input.type)||typeof input.reference!=='string')throw fail('نوع یا نشانی ویوی CRM معتبر نیست.')
 let reference=input.reference.trim();if(/^https?:\/\//i.test(reference)){let url;try{url=new URL(reference)}catch{throw fail('لینک ویوی CRM معتبر نیست.')}if(url.protocol!=='https:'||url.hostname!=='crm.baridsoft.ir'||!/^\/Main\/main\.aspx$/i.test(url.pathname)||url.username||url.password)throw fail('لینک باید به ویوی CRM سازمان اشاره کند.');reference=url.searchParams.get('viewid')||''}
 const id=reference.replace(/^\{/,'').replace(/\}$/,'').toLowerCase();if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw fail('شناسهٔ ویوی CRM معتبر نیست.');return {type:input.type,id}
}
const initialExpertRoster=[
 ['مهدی عبدالحسین زاده','Implementation'],['امیرحسین مغازه ئی','Implementation'],['سیدسهیل علم الهدائی','Implementation'],['امیر سلیمانی','Implementation'],['محمدمهدی هادی فر','Implementation'],['زهرا رسول شیرازی','Implementation'],['سیدحامد ابراهیم‌ پور','Implementation'],['علی اکبر فرج اللهی','Implementation'],['سجاد گودرزی','Implementation'],['محمد جعفری','Implementation'],['حسین آزادپور مطلق','Implementation'],['علیرضا فیضی','Implementation'],['مجید قمی','Implementation'],['حمید باقریان موحد','Implementation'],
 ['مهران منصوری','Converter'],['امین حضوری','Converter'],['امیر امامی','Converter'],['جواد رهنما','Converter'],['محمد ارومیه','Converter']
]
export function seedInitialExperts(s,at=new Date().toISOString()){
 if(s.initialRosterVersion>=1)return 0
 const normalize=name=>name.normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c]+/g,' ').trim()
 const known=new Set(s.experts.map(e=>normalize(e.name))),added=[];let order=Math.max(0,...s.experts.map(e=>e.order||0))
 for(const [name,kind] of initialExpertRoster){if(known.has(normalize(name)))continue;const expert={id:randomUUID(),name,kind,active:true,order:++order};s.experts.push(expert);added.push(expert);known.add(normalize(name))}
 s.initialRosterVersion=1
 if(added.length)audit(s,{id:'system',name:'سامانه'},'ثبت فهرست اولیهٔ کارشناسان',null,added,at)
 return added.length
}
export function coverage(s,id){const o=s.obligations[id],assigned=sum(s.allocations.filter(a=>a.obligationId===id).map(units));return {required:o?.sizeUnits??null,assigned,missing:o?.sizeUnits==null?null:Math.max(0,o.sizeUnits-assigned),excess:o?.sizeUnits==null?null:Math.max(0,assigned-o.sizeUnits)}}
function rebuild(s,o){
 const allocated=new Set(s.allocations.map(a=>a.blockId)),retained=s.blocks.filter(b=>b.obligationId===o.id&&allocated.has(b.id)),old=s.blocks.filter(b=>b.obligationId===o.id&&!allocated.has(b.id));s.blocks=s.blocks.filter(b=>b.obligationId!==o.id||allocated.has(b.id))
 let remaining=Math.max(0,(o.sizeUnits||0)-sum(retained.map(b=>b.units))),index=0
 if(!o.projectId||!kinds.includes(o.kind)||!openStatuses.includes(o.status)||o.closed)return
 while(remaining>0){const amount=o.kind==='Implementation'?Math.min(10,remaining):remaining,previous=old[index++];s.blocks.push({id:previous?.units===amount?previous.id:randomUUID(),obligationId:o.id,units:amount});remaining-=amount}
}
export function projectPlan(s,projectId){
 if(!projectId)return {projectId:null,reference:null,effective:null,stage:'unknown',stageSource:'unknown',ambiguous:false}
 const rows=Object.values(s.obligations).filter(o=>o.projectId===projectId),manual=s.plans[projectId]||{},syncs=rows.filter(o=>o.kind==='Converter'&&/سینک\s*نهایی|final\s*sync/i.test(o.title)&&o.week).sort((a,b)=>a.week.localeCompare(b.week)),reference=syncs.length?plusDays(syncs.at(-1).week,7):null
 const titles=rows.map(o=>o.title).join(' '),hasAfter=/بعد\s*از\s*س[وؤیئ]+چ|after\s*switch/i.test(titles),hasBefore=/قبل\s*از\s*س[وؤیئ]+چ|before\s*switch/i.test(titles)
 return {...manual,projectId,reference,effective:manual.date||reference,stage:manual.stage||(hasAfter&&!hasBefore?'after':hasBefore&&!hasAfter?'before':'unknown'),stageSource:manual.stage?'manager':hasAfter||hasBefore?'title':'unknown',ambiguous:!manual.stage&&hasAfter&&hasBefore}
}
export function customerColor(s,customerId){return s.colors[customerId]||['#e4f1eb','#f3e6ed','#e5ecf7','#f6ebd8','#eee7f4','#deefef','#eceecf'][parseInt(hash(customerId).slice(0,4),16)%7]}
export function allocationStage(s,a,date){const o=s.obligations[a.obligationId],p=projectPlan(s,o.projectId);return p.effective?(date>=p.effective?'after':'before'):p.stage}
export function applySnapshot(s,rows,user,at,{referenceIds=[]}={}){
 archiveWeeks(s,at)
 if(!Array.isArray(rows)||rows.some(o=>!o.id||o.sizeUnits!==null&&(!Number.isSafeInteger(o.sizeUnits)||o.sizeUnits<0)))throw fail('دادهٔ CRM معتبر نیست؛ برنامهٔ قبلی حفظ شد.',502)
 const seen=new Set();for(const row of rows){if(seen.has(row.id))throw fail('شناسهٔ تکراری در پاسخ CRM؛ داده اعمال نشد.',502);seen.add(row.id)}
 let changed=0;const batchId=randomUUID(),previousAt=s.lastSync?.at||null,auditStart=s.audit.length;const references=new Set(referenceIds)
 for(const row of rows){const before=s.obligations[row.id];if(!before&&(!kinds.includes(row.kind)||!openStatuses.includes(row.status)||row.closed)&&!references.has(row.id))continue;const next={...copy(row),readAt:at};if(!same(before&&Object.fromEntries(Object.entries(before).filter(([k])=>k!=='readAt')),row)){changed++;audit(s,user,'بازخوانی مرجع CRM',before,next,at,[row.id])}s.obligations[row.id]=next;rebuild(s,next)}
 for(const event of s.audit.slice(auditStart))if(event.action==='بازخوانی مرجع CRM')event.syncBatchId=batchId;
 s.lastSync={id:batchId,at,previousAt,by:noteActor(user),count:rows.length,changed,state:'success',source:s.settings.crmView?.name||s.settings.crmViewName||'همه بکلاگ های استقرار و کانورت پروژه های اتوماسیون'};
 s.crmSyncRuns=[...(s.crmSyncRuns||[]),copy(s.lastSync)].slice(-120)
 return s.lastSync
}
export function archiveWeeks(s,at){
 const now=today(new Date(at)),current=week(now),candidates=new Set([...s.allocations.flatMap(a=>a.days.map(d=>week(d.date))),...s.absences.flatMap(a=>dates(a.from,a.to).map(week)),...(s.sourcePrograms||[]).map(p=>p.week).filter(Boolean)].filter(w=>w<current))
 let count=0
 for(const w of candidates){if(s.archives[w])continue;const end=plusDays(w,6),allocations=s.allocations.flatMap(a=>{const ds=a.days.filter(d=>d.date>=w&&d.date<=end);return ds.length?[{...copy(a),days:copy(ds)}]:[]}),ids=new Set(allocations.map(a=>a.obligationId));s.archives[w]={week:w,at,experts:copy(s.experts),allocations,absences:copy(s.absences.filter(a=>a.from<=end&&a.to>=w)),obligations:Object.fromEntries([...ids].map(id=>[id,copy(s.obligations[id])])),coverage:Object.fromEntries([...ids].map(id=>[id,coverage(s,id)])),colors:Object.fromEntries([...new Set([...ids].map(id=>s.obligations[id].customerId))].map(id=>[id,customerColor(s,id)])),plans:Object.fromEntries([...new Set([...ids].map(id=>s.obligations[id].projectId))].map(id=>[id,copy(projectPlan(s,id))]))};count++;audit(s,{id:'system',name:'سامانه'},'آرشیو هفته',null,{week:w},at,[...ids])}
 return count
}
export function conflicts(s,now=today()){
 const out=[],add=(type,o,details,allocationId=null)=>{const key=hash([type,o?.id,allocationId,details]);out.push({id:key,type,obligationId:o?.id||null,allocationId,customer:o?.customer||'',project:o?.project||'',details,exception:s.exceptions[key]||null})}
 for(const o of Object.values(s.obligations)){
  const list=s.allocations.filter(a=>a.obligationId===o.id),c=coverage(s,o.id)
  if(!o.closed&&openStatuses.includes(o.status)&&!o.sizeUnits)add('برآورد صفر یا خالی',o,{size:o.sizeUnits})
  if(o.sprintDate&&o.backlogDate&&week(o.sprintDate)!==week(o.backlogDate))add('اختلاف تاریخ CRM',o,{sprint:o.sprintDate,backlog:o.backlogDate})
  if(o.mappingWarning)add('نیازمند بررسی مرجع',o,{message:o.mappingWarning})
  if(c.excess)add('مازاد پوشش',o,c)
  if(list.length&&c.missing)add('کسری پوشش',o,c)
  if(list.length&&(o.closed||!kinds.includes(o.kind)||!openStatuses.includes(o.status)))add('تغییر وضعیت یا نوع تعهد دارای برنامه',o,{status:o.status,kind:o.kind})
  if(list.some(a=>a.status==='confirmed')&&!approvalStatuses.includes(o.status))add('ناسازگاری وضعیت برنامه قطعی',o,{status:o.status})
  if(!o.closed&&list.some(a=>archived(a,now)))add('تعهد باز با برنامهٔ گذشته',o,{message:'پوشش برنامه‌ریزی‌شده حفظ شده؛ انجام واقعی از گذشت زمان استنتاج نمی‌شود.'})
  const plan=projectPlan(s,o.projectId)
  if(list.length&&(!plan.effective&&plan.stage==='unknown'||plan.ambiguous))add('ابهام مرحلهٔ سوئیچ',o,{stage:plan.stage})
  if(plan.date&&plan.reference&&plan.date!==plan.reference)add('اختلاف سوئیچ مؤثر و مرجع',o,{reference:plan.reference,effective:plan.date})
  for(const a of list){
   const ex=s.experts.find(e=>e.id===a.expertId)
   if(ex?.kind!==o.kind)add('تغییر گروه تخصصی',o,{expert:ex?.name,kind:o.kind},a.id)
   if(a.days.some(d=>week(d.date)!==o.week))add('اختلاف هفتهٔ تخصیص با CRM',o,{reference:o.week,weeks:[...new Set(a.days.map(d=>week(d.date)))]},a.id)
   if(o.kind==='Implementation'&&a.days.some(d=>[4,5].includes(new Date(d.date).getUTCDay())))add('استقرار خارج روزهای معمول',o,{days:a.days.filter(d=>[4,5].includes(new Date(d.date).getUTCDay())).map(d=>d.date)},a.id)
   if(o.kind==='Converter'&&plan.effective&&(plan.completion||a.days.at(-1)?.date)>=plan.effective)add('تأخیر کانورت نسبت به سوئیچ',o,{completion:plan.completion||a.days.at(-1)?.date,switch:plan.effective},a.id)
   const absence=s.absences.filter(x=>x.expertId===a.expertId&&a.days.some(d=>d.date>=x.from&&d.date<=x.to));if(absence.length)add('هم‌پوشانی با عدم دسترسی',o,{absenceIds:absence.map(x=>x.id)},a.id)
   const others=s.allocations.filter(x=>x.id!==a.id&&x.expertId===a.expertId&&a.days.some(d=>x.days.some(e=>d.date===e.date&&d.units+e.units>2)))
   const cumulative=s.allocations.filter(x=>x.id!==a.id&&x.expertId===a.expertId&&a.days.some(d=>x.days.some(e=>week(e.date)===week(d.date))));const overloaded=[...new Set(a.days.map(d=>week(d.date)))].filter(w=>sum([a,...cumulative].flatMap(x=>x.days.filter(d=>week(d.date)===w).map(d=>d.units)))>10);if(o.kind!=='Converter'&&overloaded.length)add('تداخل کارشناس',o,{allocations:cumulative.filter(x=>x.days.some(d=>overloaded.includes(week(d.date)))).map(x=>x.id),message:'مجموع برنامهٔ کارشناس در هفته بیش از ۵ نفرروز است.',weeks:overloaded},a.id)
  }
 }
 for(const projectId of new Set(Object.values(s.obligations).map(o=>o.projectId))){const rows=Object.values(s.obligations).filter(o=>o.projectId===projectId&&Number.isFinite(o.priorityNumber)).sort((a,b)=>a.priorityNumber-b.priorityNumber);for(let i=1;i<rows.length;i++){const earlier=s.allocations.filter(a=>a.obligationId===rows[i-1].id).flatMap(a=>a.days.map(d=>d.date)).sort(),later=s.allocations.filter(a=>a.obligationId===rows[i].id).flatMap(a=>a.days.map(d=>d.date)).sort();if(rows[i-1].priorityNumber<rows[i].priorityNumber&&earlier.length&&later.length&&week(earlier.at(-1))>week(later[0]))add('تعارض ترتیب پروژه',rows[i],{previous:rows[i-1].id,previousEnd:earlier.at(-1),nextStart:later[0]})}}
 return out
}
function validateAllocation(s,p,now,{ignoreId=null}={}){
 const b=s.blocks.find(b=>b.id===p.blockId),o=b&&s.obligations[b.obligationId],ex=s.experts.find(e=>e.id===p.expertId)
 if(!b||!o||o.closed||!openStatuses.includes(o.status))throw fail('بلوک یا وضعیت تعهد برای تخصیص معتبر نیست.')
 if(!o.sizeUnits)throw fail('ابتدا برآورد تعهد را در CRM اصلاح کنید.')
 if(!ex?.active||ex.kind!==o.kind)throw fail('گروه کارشناس باید با تعهد یکسان و کارشناس فعال باشد.')
 if(!Array.isArray(p.days)||!p.days.length||p.days.length>732||p.days.some(d=>!day(d.date)||![1,2].includes(d.units)||week(d.date)<week(now)))throw fail('روزهای تخصیص معتبر نیست؛ برنامهٔ گذشته قابل تغییر نیست.')
 if(new Set(p.days.map(d=>d.date)).size!==p.days.length)throw fail('یک روز را دوباره انتخاب نکنید.')
 const other=s.allocations.find(a=>a.blockId===b.id&&a.id!==ignoreId);if(other)throw fail('این بلوک قبلاً به یک کارشناس تخصیص یافته؛ همان تخصیص را اصلاح کنید.',409)
 if(sum(p.days.map(d=>d.units))>b.units)throw fail('روزهای تخصیص از اندازهٔ بلوک بیشتر است.')
 return {blockId:b.id,obligationId:o.id,expertId:ex.id,days:copy(p.days).sort((a,b)=>a.date.localeCompare(b.date)),note:text(p.note||'',2000)}
}
function hardApproval(s,a,now){const o=s.obligations[a.obligationId],c=coverage(s,o.id),ex=s.experts.find(e=>e.id===a.expertId);if(archived(a,now))throw fail('برنامهٔ آرشیوشده قابل قطعی‌سازی نیست.');if(!approvalStatuses.includes(o.status)||o.closed)throw fail('وضعیت CRM اجازهٔ قطعی‌سازی نمی‌دهد.');if(!o.sizeUnits||c.missing||c.excess||ex?.kind!==o.kind)throw fail('پوشش کامل و معتبر تعهد برای قطعی‌سازی لازم است.')}

function applyCommandCore(s,action,p,user,{manager=false,now=new Date()}={}){
 const at=now.toISOString(),current=today(now);archiveWeeks(s,at)
 const manage=()=>{if(!manager)throw fail('این اقدام فقط برای مدیر ابزار مجاز است.',403)}
 if(action==='crm-change-review'){
  if(Object.keys(p).some(k=>!['id','status','note','confirmWarnings','reason','warningIds'].includes(k))||!['unreviewed','seen','action','accepted'].includes(p.status))throw fail('وضعیت بررسی معتبر نیست.');
  const event=s.audit.find(a=>a.id===p.id&&a.action==='بازخوانی مرجع CRM');if(!event)throw fail('تغییر CRM پیدا نشد.',404);
  s.crmChangeReviews||={};const before=s.crmChangeReviews[p.id]||null,after={status:p.status,note:text(p.note||'',1000),at,actor:noteActor(user)};s.crmChangeReviews[p.id]=after;audit(s,user,'بررسی تغییر CRM',before,{changeId:p.id,...after},at,event.obligationIds);return {changeId:p.id,...after}
 }
 if(action==='expert'){
  manage();const existing=s.experts.find(e=>e.id===p.id),before=existing?copy(existing):null;if(!kinds.includes(p.kind)||typeof p.active!=='boolean'||!Number.isSafeInteger(p.order))throw fail('مشخصات کارشناس معتبر نیست.');if(before&&before.kind!==p.kind&&s.allocations.some(a=>a.expertId===before.id))throw fail('نوع کارشناس دارای برنامه را تغییر ندهید؛ کارشناس قبلی را غیرفعال کنید.');const after={id:before?.id||randomUUID(),name:text(p.name,150),kind:p.kind,active:p.active,order:p.order};if(!after.name)throw fail('نام کارشناس را بنویسید.');if(existing)Object.assign(existing,after);else s.experts.push(after);audit(s,user,'تنظیم کارشناس',before,after,at);return after
 }
 if(action==='planning-assumptions'){manage();if(Object.keys(p).some(k=>!['autoSpreadConverter','converterWorkingDays'].includes(k))||typeof p.autoSpreadConverter!=='boolean'||![5,7].includes(p.converterWorkingDays))throw fail('فرض‌های برنامه‌ریزی معتبر نیست.');const before=planningAssumptions(s);s.settings.planningAssumptions=copy(p);audit(s,user,'پیکربندی فرض‌های برنامه‌ریزی',before,p,at);return copy(p)}
 if(action==='validation-settings'){
  manage();if(!p.policies||typeof p.policies!=='object'||Array.isArray(p.policies)||Object.keys(p).some(k=>!['policies','messages'].includes(k))||Object.keys(p.policies).some(id=>!validationRules.some(r=>r.id===id))||validationRules.some(r=>!['off','warn','block'].includes(p.policies[r.id])))throw fail('حالت همهٔ اعتبارسنجی‌ها باید خاموش، هشدار یا جلوگیری باشد.');
  if(p.messages!==undefined&&(!p.messages||typeof p.messages!=='object'||Array.isArray(p.messages)||Object.entries(p.messages).some(([id,value])=>!validationRules.some(r=>r.id===id)||typeof value!=='string'||value.length>1000)))throw fail('متن هشدارها باید برای قواعد شناخته‌شده و حداکثر هزار نویسه باشد.');
  const before={policies:validationPolicies(s),messages:copy(s.settings.validationMessages||{})};s.settings.validationPolicies=copy(p.policies);if(p.messages!==undefined)s.settings.validationMessages=Object.fromEntries(Object.entries(p.messages).map(([id,value])=>[id,value.trim()]));audit(s,user,'پیکربندی اعتبارسنجی‌ها',before,{policies:s.settings.validationPolicies,messages:s.settings.validationMessages||{}},at);return copy(s.settings.validationPolicies)

 }
 if(action==='settings'){
  manage();const before=copy(s.settings);if(p.defaultWeeks!==null&&(!Number.isSafeInteger(p.defaultWeeks)||p.defaultWeeks<1||p.defaultWeeks>52)||typeof p.syncOnEntry!=='boolean'||typeof p.periodic!=='boolean'||!Number.isSafeInteger(p.intervalMinutes)||p.intervalMinutes<5||p.intervalMinutes>1440)throw fail('تنظیمات بازه و همگام‌سازی معتبر نیست.');s.settings={...s.settings,defaultWeeks:p.defaultWeeks,syncOnEntry:p.syncOnEntry,periodic:p.periodic,intervalMinutes:p.intervalMinutes,syncUserId:user.id,crmView:p.crmView===undefined?s.settings.crmView??null:crmViewReference(p.crmView),crmViewName:p.crmViewName===undefined?s.settings.crmViewName||'':text(p.crmViewName,200)};audit(s,user,'تنظیمات ابزار',before,s.settings,at);return
 }
 if(action==='color'){manage();if(typeof p.customerId!=='string'||!/^#[a-f0-9]{6}$/i.test(p.color))throw fail('رنگ معتبر نیست.');const before=s.colors[p.customerId];s.colors[p.customerId]=p.color;audit(s,user,'رنگ مشتری',before,{customerId:p.customerId,color:p.color},at);return}
 if(action==='switch'){manage();if(!Object.values(s.obligations).some(o=>o.projectId===p.projectId)||p.date!==null&&!day(p.date)||p.completion!==null&&!day(p.completion)||!['before','after','unknown'].includes(p.stage))throw fail('مشخصات سوئیچ معتبر نیست.');const before=copy(s.plans[p.projectId]||{});s.plans[p.projectId]={date:p.date,completion:p.completion,stage:p.stage==='unknown'?null:p.stage,note:text(p.note||'',1000)};if(p.color!==undefined){if(!/^#[a-f0-9]{6}$/i.test(p.color))throw fail('رنگ معتبر نیست.');for(const o of Object.values(s.obligations).filter(o=>o.projectId===p.projectId))s.colors[o.customerId]=p.color}audit(s,user,'تعیین سوئیچ',before,s.plans[p.projectId],at,Object.values(s.obligations).filter(o=>o.projectId===p.projectId).map(o=>o.id));return}
 if(action==='absence'){
  const ex=s.experts.find(e=>e.id===p.expertId);if(!ex||!absenceTypes.includes(p.type)||!day(p.from)||!day(p.to)||p.to<p.from||week(p.from)<week(current))throw fail('عدم دسترسی و بازهٔ آن معتبر نیست.');dates(p.from,p.to);const existing=s.absences.find(a=>a.id===p.id),before=existing?copy(existing):null;if(before&&week(before.from)<week(current))throw fail('عدم دسترسی آرشیوشده قابل تغییر نیست.');const after={id:before?.id||randomUUID(),expertId:p.expertId,type:p.type,from:p.from,to:p.to,note:text(p.note||'',2000)};if(existing)Object.assign(existing,after);else s.absences.push(after);audit(s,user,'ثبت عدم دسترسی',before,after,at);return after
 }
 if(action==='delete-absence'){const a=s.absences.find(a=>a.id===p.id);if(!a)throw fail('عدم دسترسی پیدا نشد.',404);if(week(a.from)<week(current))throw fail('عدم دسترسی آرشیوشده قابل حذف نیست.');s.absences=s.absences.filter(x=>x!==a);audit(s,user,'حذف عدم دسترسی',a,null,at);return}
 if(action==='return-group'){
  if(!Array.isArray(p.ids)||!p.ids.length||p.ids.length>2000||new Set(p.ids).size!==p.ids.length)throw fail('یک یا چند تخصیص متفاوت انتخاب کنید.');const returnedIds=[],requestIds=[];
  for(const id of p.ids){const result=applyCommandCore(s,'delete-allocation',{id},user,{manager,now});if(result?.requestId)requestIds.push(result.requestId);else returnedIds.push(id)}return {returnedIds,requestIds}
 }
 if(action==='allocate-group'){if(!Array.isArray(p.items)||p.items.length<2||p.items.length>50||new Set(p.items.map(item=>item.blockId)).size!==p.items.length)throw fail('برای تخصیص گروهی، دو تا پنجاه بلوک متفاوت انتخاب کنید.');const draft=copy(s),results=[];for(const item of p.items){if(!item||item.id||draft.allocations.some(a=>a.blockId===item.blockId))throw fail('بلوک دارای تخصیص را جداگانه ویرایش کنید.',409);results.push(applyCommandCore(draft,'allocate',item,user,{manager,now}))}Object.assign(s,draft);return results}
 if(action==='allocate'||action==='delete-allocation'){
  const before=s.allocations.find(a=>a.id===p.id);if(p.id&&!before)throw fail('تخصیص پیدا نشد.',404);if(before&&archived(before,current))throw fail('برنامهٔ گذشته فقط خواندنی است.');if(before&&action==='allocate'&&p.blockId!==before.blockId)throw fail('بلوک یک تخصیص موجود قابل تعویض نیست.')
  const after=action==='allocate'?{...validateAllocation(s,p,current,{ignoreId:before?.id}),id:before?.id||randomUUID(),status:before?.status||'proposed',version:(before?.version||0)+1,...before?.assumedSchedule?{assumedSchedule:copy(before.assumedSchedule)}:{}}:null
  if(before?.status==='confirmed'&&!manager){if(s.requests.some(r=>r.allocationId===before.id&&r.status==='pending'))throw fail('درخواست تغییر این برنامه در انتظار بررسی است.',409);const request={id:randomUUID(),allocationId:before.id,baseVersion:before.version,before:copy(before),after,status:'pending',actor:noteActor(user),at};s.requests.push(request);audit(s,user,'درخواست تغییر برنامه قطعی',before,request,at,[before.obligationId]);return {requestId:request.id}}
  if(before)s.allocations=s.allocations.filter(a=>a!==before);if(after)s.allocations.push(after)
  if(after?.status==='confirmed'){hardApproval(s,after,current)}
  audit(s,user,after?'تخصیص یا جابه‌جایی':'حذف تخصیص',before,after,at,[after?.obligationId||before.obligationId]);return after
 }
 if(action==='unapprove'){manage();if(!Array.isArray(p.ids)||!p.ids.length||p.ids.length>2000||new Set(p.ids).size!==p.ids.length)throw fail('تخصیص‌ها را انتخاب کنید.');const list=p.ids.map(id=>s.allocations.find(a=>a.id===id));if(list.some(a=>!a||a.status!=='confirmed'||archived(a,current)))throw fail('فقط برنامه‌های قطعیِ قابل ویرایش را انتخاب کنید.');for(const a of list){const before=copy(a);a.status='proposed';a.version++;audit(s,user,'بازگرداندن به پیشنهادی',before,a,at,[a.obligationId])}return list.map(copy)}
 if(action==='approve'){
  manage();if(!Array.isArray(p.ids)||!p.ids.length||p.ids.length>2000||new Set(p.ids).size!==p.ids.length)throw fail('تخصیص‌ها را انتخاب کنید.');const list=p.ids.map(id=>s.allocations.find(a=>a.id===id));if(list.some(a=>!a))throw fail('یکی از تخصیص‌ها پیدا نشد.',409);for(const a of list)hardApproval(s,a,current);for(const a of list){const before=copy(a);a.status='confirmed';a.version++;audit(s,user,'قطعی‌سازی برنامه',before,a,at,[a.obligationId])}return list.map(copy)
 }
 if(action==='review'){
  manage();const r=s.requests.find(r=>r.id===p.id&&r.status==='pending');if(!r)throw fail('درخواست در انتظار بررسی پیدا نشد.',404);if(!['approve','reject'].includes(p.decision))throw fail('تصمیم معتبر نیست.');if(p.decision==='reject'){r.status='rejected';r.review={actor:noteActor(user),at,note:text(p.note||'',1000)};audit(s,user,'رد درخواست تغییر',r.before,r,at,[r.before.obligationId]);return}
  const old=s.allocations.find(a=>a.id===r.allocationId);if(!old||old.version!==r.baseVersion||archived(old,current))throw fail('برنامهٔ مبنا تغییر کرده یا آرشیو شده؛ درخواست باید دوباره تهیه شود.',409);s.allocations=s.allocations.filter(a=>a!==old);if(r.after){const a={...validateAllocation(s,r.after,current),id:old.id,status:'confirmed',version:old.version+1};s.allocations.push(a);hardApproval(s,a,current)}r.status='approved';r.review={actor:noteActor(user),at};audit(s,user,'تأیید درخواست تغییر',old,r.after,at,[old.obligationId]);return
 }
 if(action==='move-group'){
  manage();if(!Array.isArray(p.ids)||!p.ids.length||p.ids.length>2000||new Set(p.ids).size!==p.ids.length||!Number.isSafeInteger(p.delta)||Math.abs(p.delta)>365)throw fail('انتخاب برنامه و فاصلهٔ جابه‌جایی معتبر نیست.');const list=p.ids.map(id=>s.allocations.find(a=>a.id===id));if(list.some(a=>!a||archived(a,current)))throw fail('برنامهٔ گذشته قابل جابه‌جایی نیست.');for(const a of list){const before=copy(a),candidate={...a,expertId:p.expertId||a.expertId,days:a.days.map(d=>({...d,date:plusDays(d.date,p.delta)}))};Object.assign(a,validateAllocation(s,candidate,current,{ignoreId:a.id}),{version:a.version+1});audit(s,user,'جابه‌جایی گروهی',before,a,at,[a.obligationId])}for(const a of list.filter(a=>a.status==='confirmed'))hardApproval(s,a,current);return s.allocations.filter(a=>p.ids.includes(a.id)).map(copy)
 }
 if(action==='exception'){manage();const c=conflicts(s,current).find(c=>c.id===p.id);if(!c||!p.reason?.trim())throw fail('تناقض و علت پذیرش را مشخص کنید.');s.exceptions[c.id]={reason:text(p.reason,1000),actor:noteActor(user),at};audit(s,user,'پذیرش استثنا',null,{conflict:c.id,...s.exceptions[c.id]},at,c.obligationId?[c.obligationId]:[]);return}
 throw fail('عملیات شناخته نشد.',404)
}
export function planView(s,allowedIds,now=today()){
 const allowed=new Set(allowedIds),out=copy(s);for(const key of ["appAccess","planningUndo","sourcePrograms","sourceReferences","sourceProjects","sourceExpertIdentities","imports"])delete out[key];out.obligations=Object.fromEntries(Object.entries(out.obligations).filter(([id])=>allowed.has(id)));out.blocks=out.blocks.filter(b=>allowed.has(b.obligationId));out.allocations=out.allocations.filter(a=>allowed.has(a.obligationId));out.requests=out.requests.filter(r=>allowed.has(r.before.obligationId));out.audit=out.audit.filter(a=>!a.sourceReview&&(!a.obligationIds.length||a.obligationIds.every(id=>allowed.has(id))));out.crmSyncRuns=(out.crmSyncRuns||[]).map(({id,at,previousAt,source})=>({id,at,previousAt,source}));out.crmChangeReviews=Object.fromEntries(Object.entries(out.crmChangeReviews||{}).filter(([id])=>out.audit.some(a=>a.id===id)));out.archives=Object.fromEntries(Object.entries(out.archives).map(([w,a])=>[w,{...a,obligations:Object.fromEntries(Object.entries(a.obligations).filter(([id])=>allowed.has(id))),allocations:a.allocations.filter(x=>allowed.has(x.obligationId))}]));out.plans=Object.fromEntries([...new Set(Object.values(out.obligations).map(o=>o.projectId).filter(Boolean))].map(id=>[id,projectPlan(out,id)]));out.colors=Object.fromEntries([...new Set(Object.values(out.obligations).map(o=>o.customerId))].map(id=>[id,customerColor(s,id)]));out.conflicts=conflicts(out,now);out.exceptions=Object.fromEntries(out.conflicts.filter(c=>c.exception).map(c=>[c.id,c.exception]));for(const a of Object.values(out.archives)){const projects=new Set(Object.values(a.obligations).map(o=>o.projectId)),customers=new Set(Object.values(a.obligations).map(o=>o.customerId));a.plans=Object.fromEntries(Object.entries(a.plans||{}).filter(([id])=>projects.has(id)));a.colors=Object.fromEntries(Object.entries(a.colors||{}).filter(([id])=>customers.has(id)));a.coverage=Object.fromEntries(Object.entries(a.coverage||{}).filter(([id])=>allowed.has(id)))}out.coverage=Object.fromEntries(Object.keys(out.obligations).map(id=>[id,coverage(out,id)]));for(const o of Object.values(out.obligations)){const list=out.allocations.filter(a=>a.obligationId===o.id),c=out.coverage[o.id],replan=list.length&&(o.closed||!kinds.includes(o.kind)||!openStatuses.includes(o.status)||c.excess||list.some(a=>a.status==='confirmed')&&(c.missing||!approvalStatuses.includes(o.status)));o.displayStatus=o.closed?'بسته‌شده در CRM':replan?'نیازمند بازبرنامه‌ریزی':list.length&&c.missing===0&&list.every(a=>a.status==='confirmed')?'برنامهٔ قطعی':list.length?'دارای برنامهٔ پیشنهادی':!o.sizeUnits||!o.projectId?'در انتظار بررسی':o.status==='Waiting for Customer'?'منتظر مشتری':o.status==='Submit'?'ثبت‌شده':o.status==='Request To Plan Sprint'?'درخواست برنامه‌ریزی':'برنامه‌ریزی‌شده'}out.validationIssues=validationIssues(out,now);out.validationRules=copy(validationRules);out.settings.validationPolicies=validationPolicies(s);out.settings.planningAssumptions=planningAssumptions(s);out.today=now;return out
}
