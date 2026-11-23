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
export function createPlanState(){return {schema:1,revision:0,experts:[],obligations:{},blocks:[],allocations:[],absences:[],requests:[],plans:{},colors:{},exceptions:{},archives:{},audit:[],settings:{defaultWeeks:null,syncOnEntry:false,periodic:false,intervalMinutes:60},lastSync:null}}
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
 if(!Array.isArray(rows)||rows.some(o=>!o.id||!kinds.includes(o.kind)&&!s.obligations[o.id]||o.sizeUnits!==null&&(!Number.isSafeInteger(o.sizeUnits)||o.sizeUnits<0)))throw fail('دادهٔ CRM معتبر نیست؛ برنامهٔ قبلی حفظ شد.',502)
 const seen=new Set();for(const row of rows){if(seen.has(row.id))throw fail('شناسهٔ تکراری در پاسخ CRM؛ داده اعمال نشد.',502);seen.add(row.id)}
 let changed=0;const references=new Set(referenceIds)
 for(const row of rows){const before=s.obligations[row.id];if(!before&&(!kinds.includes(row.kind)||!openStatuses.includes(row.status)||row.closed)&&!references.has(row.id))continue;const next={...copy(row),readAt:at};if(!same(before&&Object.fromEntries(Object.entries(before).filter(([k])=>k!=='readAt')),row)){changed++;audit(s,user,'بازخوانی مرجع CRM',before,next,at,[row.id])}s.obligations[row.id]=next;rebuild(s,next)}
 s.lastSync={at,by:noteActor(user),count:rows.length,changed,state:'success'}
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
   const cumulative=s.allocations.filter(x=>x.id!==a.id&&x.expertId===a.expertId&&a.days.some(d=>x.days.some(e=>d.date===e.date)));if(a.days.some(d=>d.units+sum(cumulative.flatMap(x=>x.days.filter(e=>e.date===d.date).map(e=>e.units)))>2)&&cumulative.some(x=>o.kind!=='Converter'||s.obligations[x.obligationId]?.kind!=='Converter'))add('تداخل کارشناس',o,{allocations:cumulative.map(x=>x.id)},a.id)
  }
 }
 for(const projectId of new Set(Object.values(s.obligations).map(o=>o.projectId))){const rows=Object.values(s.obligations).filter(o=>o.projectId===projectId&&Number.isFinite(o.priorityNumber)).sort((a,b)=>a.priorityNumber-b.priorityNumber);for(let i=1;i<rows.length;i++){const earlier=s.allocations.filter(a=>a.obligationId===rows[i-1].id).flatMap(a=>a.days.map(d=>d.date)).sort(),later=s.allocations.filter(a=>a.obligationId===rows[i].id).flatMap(a=>a.days.map(d=>d.date)).sort();if(earlier.length&&later.length&&earlier.at(-1)>later[0])add('تعارض ترتیب پروژه',rows[i],{previous:rows[i-1].id,previousEnd:earlier.at(-1),nextStart:later[0]})}}
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
function acceptWarnings(s,user,ids,p,at){const list=conflicts(s,today(new Date(at))).filter(c=>ids.includes(c.allocationId)||ids.some(id=>s.allocations.find(a=>a.id===id)?.obligationId===c.obligationId)&&['تعارض ترتیب پروژه','ابهام مرحلهٔ سوئیچ'].includes(c.type)),warnings=list.filter(c=>['تداخل کارشناس','هم‌پوشانی با عدم دسترسی','تأخیر کانورت نسبت به سوئیچ','تعارض ترتیب پروژه','استقرار خارج روزهای معمول','ابهام مرحلهٔ سوئیچ'].includes(c.type)&&!c.exception);if(warnings.length){if(!p.confirmWarnings||!p.reason?.trim()||!Array.isArray(p.warningIds)||warnings.some(c=>!p.warningIds.includes(c.id)))throw fail('هشدارها به تأیید صریح مدیر و شرح علت نیاز دارند.',409,{warnings});for(const c of warnings)s.exceptions[c.id]={reason:text(p.reason,1000),actor:noteActor(user),at}}}
export function applyCommand(s,action,p,user,{manager=false,now=new Date()}={}){
 const at=now.toISOString(),current=today(now);archiveWeeks(s,at)
 const manage=()=>{if(!manager)throw fail('این اقدام فقط برای مدیر ابزار مجاز است.',403)}
 if(action==='expert'){
  manage();const existing=s.experts.find(e=>e.id===p.id),before=existing?copy(existing):null;if(!kinds.includes(p.kind)||typeof p.active!=='boolean'||!Number.isSafeInteger(p.order))throw fail('مشخصات کارشناس معتبر نیست.');if(before&&before.kind!==p.kind&&s.allocations.some(a=>a.expertId===before.id))throw fail('نوع کارشناس دارای برنامه را تغییر ندهید؛ کارشناس قبلی را غیرفعال کنید.');const after={id:before?.id||randomUUID(),name:text(p.name,150),kind:p.kind,active:p.active,order:p.order};if(!after.name)throw fail('نام کارشناس را بنویسید.');if(existing)Object.assign(existing,after);else s.experts.push(after);audit(s,user,'تنظیم کارشناس',before,after,at);return after
 }
 if(action==='settings'){
  manage();const before=copy(s.settings);if(p.defaultWeeks!==null&&(!Number.isSafeInteger(p.defaultWeeks)||p.defaultWeeks<1||p.defaultWeeks>52)||typeof p.syncOnEntry!=='boolean'||typeof p.periodic!=='boolean'||!Number.isSafeInteger(p.intervalMinutes)||p.intervalMinutes<5||p.intervalMinutes>1440)throw fail('تنظیمات بازه و همگام‌سازی معتبر نیست.');s.settings={defaultWeeks:p.defaultWeeks,syncOnEntry:p.syncOnEntry,periodic:p.periodic,intervalMinutes:p.intervalMinutes,syncUserId:user.id};audit(s,user,'تنظیمات ابزار',before,s.settings,at);return
 }
 if(action==='color'){manage();if(typeof p.customerId!=='string'||!/^#[a-f0-9]{6}$/i.test(p.color))throw fail('رنگ معتبر نیست.');const before=s.colors[p.customerId];s.colors[p.customerId]=p.color;audit(s,user,'رنگ مشتری',before,{customerId:p.customerId,color:p.color},at);return}
 if(action==='switch'){manage();if(!Object.values(s.obligations).some(o=>o.projectId===p.projectId)||p.date!==null&&!day(p.date)||p.completion!==null&&!day(p.completion)||!['before','after','unknown'].includes(p.stage))throw fail('مشخصات سوئیچ معتبر نیست.');const before=copy(s.plans[p.projectId]||{});s.plans[p.projectId]={date:p.date,completion:p.completion,stage:p.stage==='unknown'?null:p.stage,note:text(p.note||'',1000)};if(p.color!==undefined){if(!/^#[a-f0-9]{6}$/i.test(p.color))throw fail('رنگ معتبر نیست.');for(const o of Object.values(s.obligations).filter(o=>o.projectId===p.projectId))s.colors[o.customerId]=p.color}audit(s,user,'تعیین سوئیچ',before,s.plans[p.projectId],at,Object.values(s.obligations).filter(o=>o.projectId===p.projectId).map(o=>o.id));return}
 if(action==='absence'){
  const ex=s.experts.find(e=>e.id===p.expertId);if(!ex||!absenceTypes.includes(p.type)||!day(p.from)||!day(p.to)||p.to<p.from||week(p.from)<week(current))throw fail('عدم دسترسی و بازهٔ آن معتبر نیست.');dates(p.from,p.to);const existing=s.absences.find(a=>a.id===p.id),before=existing?copy(existing):null;if(before&&week(before.from)<week(current))throw fail('عدم دسترسی آرشیوشده قابل تغییر نیست.');const after={id:before?.id||randomUUID(),expertId:p.expertId,type:p.type,from:p.from,to:p.to,note:text(p.note||'',2000)};if(existing)Object.assign(existing,after);else s.absences.push(after);audit(s,user,'ثبت عدم دسترسی',before,after,at);return after
 }
 if(action==='delete-absence'){const a=s.absences.find(a=>a.id===p.id);if(!a)throw fail('عدم دسترسی پیدا نشد.',404);if(week(a.from)<week(current))throw fail('عدم دسترسی آرشیوشده قابل حذف نیست.');s.absences=s.absences.filter(x=>x!==a);audit(s,user,'حذف عدم دسترسی',a,null,at);return}
 if(action==='allocate'||action==='delete-allocation'){
  const before=s.allocations.find(a=>a.id===p.id);if(p.id&&!before)throw fail('تخصیص پیدا نشد.',404);if(before&&archived(before,current))throw fail('برنامهٔ گذشته فقط خواندنی است.');if(before&&action==='allocate'&&p.blockId!==before.blockId)throw fail('بلوک یک تخصیص موجود قابل تعویض نیست.')
  const after=action==='allocate'?{...validateAllocation(s,p,current,{ignoreId:before?.id}),id:before?.id||randomUUID(),status:before?.status||'proposed',version:(before?.version||0)+1}:null
  if(before?.status==='confirmed'&&!manager){if(s.requests.some(r=>r.allocationId===before.id&&r.status==='pending'))throw fail('درخواست تغییر این برنامه در انتظار بررسی است.',409);const request={id:randomUUID(),allocationId:before.id,baseVersion:before.version,before:copy(before),after,status:'pending',actor:noteActor(user),at};s.requests.push(request);audit(s,user,'درخواست تغییر برنامه قطعی',before,request,at,[before.obligationId]);return {requestId:request.id}}
  if(before)s.allocations=s.allocations.filter(a=>a!==before);if(after)s.allocations.push(after)
  if(after?.status==='confirmed'){hardApproval(s,after,current);acceptWarnings(s,user,[after.id],p,at)}
  audit(s,user,after?'تخصیص یا جابه‌جایی':'حذف تخصیص',before,after,at,[after?.obligationId||before.obligationId]);return after
 }
 if(action==='approve'){
  manage();if(!Array.isArray(p.ids)||!p.ids.length||p.ids.length>2000||new Set(p.ids).size!==p.ids.length)throw fail('تخصیص‌ها را انتخاب کنید.');const list=p.ids.map(id=>s.allocations.find(a=>a.id===id));if(list.some(a=>!a))throw fail('یکی از تخصیص‌ها پیدا نشد.',409);for(const a of list)hardApproval(s,a,current);acceptWarnings(s,user,p.ids,p,at);for(const a of list){const before=copy(a);a.status='confirmed';a.version++;audit(s,user,'قطعی‌سازی برنامه',before,a,at,[a.obligationId])}return
 }
 if(action==='review'){
  manage();const r=s.requests.find(r=>r.id===p.id&&r.status==='pending');if(!r)throw fail('درخواست در انتظار بررسی پیدا نشد.',404);if(!['approve','reject'].includes(p.decision))throw fail('تصمیم معتبر نیست.');if(p.decision==='reject'){r.status='rejected';r.review={actor:noteActor(user),at,note:text(p.note||'',1000)};audit(s,user,'رد درخواست تغییر',r.before,r,at,[r.before.obligationId]);return}
  const old=s.allocations.find(a=>a.id===r.allocationId);if(!old||old.version!==r.baseVersion||archived(old,current))throw fail('برنامهٔ مبنا تغییر کرده یا آرشیو شده؛ درخواست باید دوباره تهیه شود.',409);s.allocations=s.allocations.filter(a=>a!==old);if(r.after){const a={...validateAllocation(s,r.after,current),id:old.id,status:'confirmed',version:old.version+1};s.allocations.push(a);hardApproval(s,a,current);acceptWarnings(s,user,[a.id],p,at)}r.status='approved';r.review={actor:noteActor(user),at};audit(s,user,'تأیید درخواست تغییر',old,r.after,at,[old.obligationId]);return
 }
 if(action==='move-group'){
  manage();if(!Array.isArray(p.ids)||!p.ids.length||!Number.isSafeInteger(p.delta)||Math.abs(p.delta)>365)throw fail('انتخاب برنامه و فاصلهٔ جابه‌جایی معتبر نیست.');const list=p.ids.map(id=>s.allocations.find(a=>a.id===id));if(list.some(a=>!a||archived(a,current)))throw fail('برنامهٔ گذشته قابل جابه‌جایی نیست.');for(const a of list){const before=copy(a),candidate={...a,days:a.days.map(d=>({...d,date:plusDays(d.date,p.delta)}))};Object.assign(a,validateAllocation(s,candidate,current,{ignoreId:a.id}),{version:a.version+1});audit(s,user,'جابه‌جایی گروهی',before,a,at,[a.obligationId])}for(const a of list.filter(a=>a.status==='confirmed'))hardApproval(s,a,current);acceptWarnings(s,user,p.ids,p,at);return
 }
 if(action==='exception'){manage();const c=conflicts(s,current).find(c=>c.id===p.id);if(!c||!p.reason?.trim())throw fail('تناقض و علت پذیرش را مشخص کنید.');s.exceptions[c.id]={reason:text(p.reason,1000),actor:noteActor(user),at};audit(s,user,'پذیرش استثنا',null,{conflict:c.id,...s.exceptions[c.id]},at,c.obligationId?[c.obligationId]:[]);return}
 throw fail('عملیات شناخته نشد.',404)
}
export function planView(s,allowedIds,now=today()){
 const allowed=new Set(allowedIds),out=copy(s);for(const key of ["sourcePrograms","sourceReferences","sourceProjects","sourceExpertIdentities","imports"])delete out[key];out.obligations=Object.fromEntries(Object.entries(out.obligations).filter(([id])=>allowed.has(id)));out.blocks=out.blocks.filter(b=>allowed.has(b.obligationId));out.allocations=out.allocations.filter(a=>allowed.has(a.obligationId));out.requests=out.requests.filter(r=>allowed.has(r.before.obligationId));out.audit=out.audit.filter(a=>!a.sourceReview&&(!a.obligationIds.length||a.obligationIds.every(id=>allowed.has(id))));out.archives=Object.fromEntries(Object.entries(out.archives).map(([w,a])=>[w,{...a,obligations:Object.fromEntries(Object.entries(a.obligations).filter(([id])=>allowed.has(id))),allocations:a.allocations.filter(x=>allowed.has(x.obligationId))}]));out.plans=Object.fromEntries([...new Set(Object.values(out.obligations).map(o=>o.projectId).filter(Boolean))].map(id=>[id,projectPlan(out,id)]));out.colors=Object.fromEntries([...new Set(Object.values(out.obligations).map(o=>o.customerId))].map(id=>[id,customerColor(s,id)]));out.conflicts=conflicts(out,now);out.exceptions=Object.fromEntries(out.conflicts.filter(c=>c.exception).map(c=>[c.id,c.exception]));for(const a of Object.values(out.archives)){const projects=new Set(Object.values(a.obligations).map(o=>o.projectId)),customers=new Set(Object.values(a.obligations).map(o=>o.customerId));a.plans=Object.fromEntries(Object.entries(a.plans||{}).filter(([id])=>projects.has(id)));a.colors=Object.fromEntries(Object.entries(a.colors||{}).filter(([id])=>customers.has(id)));a.coverage=Object.fromEntries(Object.entries(a.coverage||{}).filter(([id])=>allowed.has(id)))}out.coverage=Object.fromEntries(Object.keys(out.obligations).map(id=>[id,coverage(out,id)]));for(const o of Object.values(out.obligations)){const list=out.allocations.filter(a=>a.obligationId===o.id),c=out.coverage[o.id],replan=list.length&&(o.closed||!kinds.includes(o.kind)||!openStatuses.includes(o.status)||c.excess||list.some(a=>a.status==='confirmed')&&(c.missing||!approvalStatuses.includes(o.status)));o.displayStatus=o.closed?'بسته‌شده در CRM':replan?'نیازمند بازبرنامه‌ریزی':list.length&&c.missing===0&&list.every(a=>a.status==='confirmed')?'برنامهٔ قطعی':list.length?'دارای برنامهٔ پیشنهادی':o.status==='Waiting for Customer'?'منتظر مشتری':o.status==='Submit'||!o.sizeUnits||!o.projectId?'در انتظار بررسی':'آمادهٔ برنامه‌ریزی'}out.today=now;return out
}
