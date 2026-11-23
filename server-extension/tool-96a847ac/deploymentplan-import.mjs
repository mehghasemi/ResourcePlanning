import {createHash,randomUUID} from 'node:crypto'
import {applyCommand,week,today,plusDays,kinds,openStatuses,coverage,fail} from './deploymentplan-engine.mjs'

export const normalizeName=value=>String(value||'').normalize('NFKC').replace(/ي|ى/g,'ی').replace(/ك/g,'ک').replace(/[\s‌\u200e\u200f]+/g,' ').trim()
const months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']
const digest=value=>createHash('sha256').update(value).digest('hex')
const numberText=value=>String(value).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
function calendar(year){
 const map=new Map(),f=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'})
 for(let date=`${year+621}-03-01`,i=0;i<390;i++,date=plusDays(date,1)){const p=Object.fromEntries(f.formatToParts(new Date(date)).map(p=>[p.type,p.value]));if(Number(p.year)===year)map.set(`${p.month}/${p.day}`,date)}
 return (month,day)=>{const d=map.get(`${month}/${day}`);if(!d)throw fail('تاریخ شمسی منبع معتبر نیست.');return d}
}

// The workbook gives weekly customer reservations. Exact CRM allocations are kept
// separately, so a multi-customer cell never invents a daily split or CRM estimate.
export function extractPlanningSource(source,{year,current=today(),groups=[{from:2,to:19,kind:'Implementation'},{from:20,to:24,kind:'Converter'}]}={}){
 if(!/^[a-f0-9]{64}$/.test(source.sha256||'')||source.sheet!=='استقرار'||!Number.isSafeInteger(year))throw fail('منبع و سال شیت استقرار را مشخص کنید.')
 const toDate=calendar(year),headers=new Map(),experts=[],programs=[],notes=[],cells=source.rows.flatMap(r=>r.cells),cellMap=new Map(cells.map(c=>[c.cell,c]))
 for(const h of source.rows.find(r=>r.row===1)?.cells||[]){
  if(h.cell==='A1'||!h.value.includes('هفته'))continue
  const label=numberText(h.value),month=months.findIndex(m=>label.includes(m))+1,range=label.match(/(\d{1,2})\s*-\s*(\d{1,2})/)
  if(!month||!range)throw fail('سرستون هفته قابل خواندن نیست: '+h.cell)
  const crossing=Number(range[1])>Number(range[2]),candidates=(crossing?[month,month-1]:[month]).flatMap(m=>{try{return [{month:m,date:toDate(m,Number(range[1]))}]}catch{return []}}),valid=candidates.filter(c=>week(c.date)===c.date)
  if(candidates.every(c=>c.date<week(current)))continue
  if(valid.length!==1)throw fail('شروع هفتهٔ منبع شنبه و یکتا نیست: '+h.cell)
  const start=valid[0].date,end=toDate(crossing?valid[0].month+1:month,Number(range[2]))
  if(start<week(current))continue
  headers.set(h.cell.replace(/\d+$/,''),{start,end,label:h.value,warning:Date.parse(end)-Date.parse(start)!==4*86400000?'بازهٔ سرستون با پنج روز معمول استقرار متفاوت است.':null})
 }
 for(const group of groups){if(!kinds.includes(group.kind))throw fail('گروه منبع معتبر نیست.');for(let row=group.from;row<=group.to;row++){const c=cellMap.get('A'+row);if(!c?.value?.trim())throw fail('نام کارشناس منبع خالی است: A'+row);experts.push({sourceCell:c.cell,name:c.value.trim(),kind:group.kind,order:row})}}
 for(const c of cells){const [,col,rowText]=c.cell.match(/^([A-Z]+)(\d+)$/)||[],row=Number(rowText),h=headers.get(col);if(!h||row===1||h.start<week(current)||!c.value.trim())continue;const ex=experts.find(e=>e.sourceCell==='A'+row),blue=c.fontColor?.theme==='4'||/^FF(0000FF|0070C0|4472C4)$/i.test(c.fontColor?.rgb||'');programs.push({sourceCell:c.cell,text:c.value.trim(),expertSource:ex?.sourceCell||null,kind:ex?.kind||'Implementation',week:h.start,header:h.label,sourceStatus:blue?'proposed':'confirmed',sourceStage:c.fillColor?.rgb&&!/^FF(FFFFFF|000000)$/i.test(c.fillColor.rgb)?'after':'before',style:{font:c.fontColor,fill:c.fillColor},issues:h.warning?[h.warning]:[]})}
 for(const c of cells.filter(c=>/^A\d+$/.test(c.cell)&&Number(c.cell.slice(1))>Math.max(...groups.map(g=>g.to))&&c.value.trim())){
  const text=numberText(c.value),month=months.findIndex(m=>text.includes(m))+1,match=text.match(/^(\d{1,2}(?:\s*-\s*\d{1,2})+)\s/),ds=month&&match?match[1].split('-').map(d=>toDate(month,Number(d.trim()))):[]
  if(ds.length&&ds.at(-1)<week(current))continue
  notes.push({sourceCell:c.cell,text:c.value.trim(),kind:'Implementation',week:ds.length?week(ds[0]):null,sourceDates:ds,sourceStatus:'confirmed',sourceStage:'unknown',expertSource:null,issues:ds.length?['یادداشت تاریخ‌دار بدون تعیین کارشناس.']:['یادداشت بدون تاریخ و کارشناس؛ جاری یا آینده‌بودن مشخص نیست.']})
 }
 return {source:{file:source.path.split(/[\\/]/).at(-1),sha256:source.sha256,sheet:source.sheet,year},experts,programs,notes}
}

export function importPlanningSource(state,batch,{projects=[],references=[],mapping},user,{now=new Date(),allocate=true}={}){
 if(!mapping||!batch?.source?.sha256||!Array.isArray(batch.programs))throw fail('دادهٔ انتقال کامل نیست.')
 const at=now.toISOString(),id=digest(batch.source.sha256+'|'+batch.source.sheet),previous=state.imports?.find(x=>x.id===id)
 if(previous)return {alreadyImported:true,...previous.summary}
 const projectMap=new Map(projects.map(p=>[p.id,p])),refMap=new Map(references.map(r=>[r.id,r])),expertMap=new Map()
 // Match exact normalized names only. Preserve existing experts and assignments.
 for(const e of batch.experts){const same=state.experts.filter(x=>normalizeName(x.name)===normalizeName(e.name));if(same.length>1||same[0]&&same[0].kind!==e.kind)throw fail('نام یا گروه کارشناس نیازمند رفع ابهام است: '+e.name);let target=same[0];if(!target)target=applyCommand(state,'expert',{name:e.name,kind:e.kind,active:true,order:e.order},user,{manager:true,now});expertMap.set(e.sourceCell,target.id)}
 state.sourceProjects??={};state.sourceReferences??={};state.sourcePrograms??=[];state.imports??=[]
 for(const row of [...batch.programs,...batch.notes]){
  const rule=mapping[row.sourceCell]||mapping[normalizeName(row.text)];if(!rule)throw fail('قاعدهٔ تطبیق سلول تعیین نشده است: '+row.sourceCell+' / '+row.text)
  const projectIds=[...new Set(rule.projectIds||[])],referenceIds=[...new Set(rule.referenceIds||[])];for(const pid of projectIds){const p=projectMap.get(pid);if(!p)throw fail('مرجع پروژه تأیید نشده است: '+row.sourceCell);state.sourceProjects[pid]=structuredClone(p)}
  for(const rid of referenceIds){const r=refMap.get(rid);if(!r)throw fail('مرجع تعهد تأیید نشده است: '+row.sourceCell);state.sourceReferences[rid]=structuredClone(r)}
  const candidates=[...new Set([...referenceIds,...references.filter(r=>projectIds.includes(r.projectId)&&r.kind===row.kind).map(r=>r.id)])];for(const rid of candidates)state.sourceReferences[rid]=structuredClone(refMap.get(rid))
  state.sourcePrograms.push({...structuredClone(row),id:digest(id+'|'+row.sourceCell),importId:id,ownerId:user.id,expertId:expertMap.get(row.expertSource)||null,projectIds,referenceIds:candidates,issues:[...row.issues,...(rule.issues||[])],internal:Boolean(rule.internal),allocationIds:[],allocationPolicy:null})
 }
 const imported=state.sourcePrograms.filter(p=>p.importId===id)
 if(allocate)allocateExactWeeks(state,imported,user,now)
 const summary={experts:batch.experts.length,weeklyPrograms:batch.programs.length,notes:batch.notes.length,assignedPrograms:batch.programs.filter(p=>p.expertSource).length,unassignedPrograms:batch.programs.filter(p=>!p.expertSource).length,allocations:imported.reduce((n,p)=>n+p.allocationIds.length,0),confirmedAllocations:state.allocations.filter(a=>imported.some(p=>p.allocationIds.includes(a.id))&&a.status==='confirmed').length}
 state.imports.push({id,at,by:{id:user.id,name:user.name},source:batch.source,summary})
 state.audit.push({id:randomUUID(),at,actor:{id:user.id,name:user.name},action:'انتقال و تطبیق شیت استقرار',before:null,after:{source:batch.source,...summary},obligationIds:[]})
 return summary
}

function allocateExactWeeks(s,programs,user,now){
 const groups=new Map()
 for(const p of programs){
  if(p.internal)continue
  if(!p.week||!p.expertId){p.issues.push(p.expertId?'هفته مشخص نیست.':'کارشناس در اکسل تعیین نشده است.');continue}
  if(p.projectIds.length!==1||p.issues.length){p.issues.push('تخصیص روزانه تا رفع ابهام منبع ثبت نمی‌شود.');continue}
  const key=[p.projectIds[0],p.kind,p.week].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p)
 }
 for(const group of groups.values()){
  const first=group[0],rows=Object.values(s.obligations).filter(o=>o.projectId===first.projectIds[0]&&o.kind===first.kind&&o.week===first.week&&!o.closed&&openStatuses.includes(o.status)&&o.sizeUnits>0).sort((a,b)=>(a.priorityNumber??Infinity)-(b.priorityNumber??Infinity)||a.id.localeCompare(b.id))
  if(!rows.length){for(const p of group)p.issues.push('تعهد قابل تخصیص با گروه و هفتهٔ یکسان در CRM وجود ندارد.');continue}
  if(first.kind==='Converter'){for(const p of group)p.issues.push('برنامهٔ هفتگی کانورت ثبت شد؛ روزهای دقیق و تقسیم میان تعهدات در اکسل مشخص نیست.');continue}
  if(rows.length>1&&(rows.some(r=>r.priorityNumber===null)||new Set(rows.map(r=>r.priorityNumber)).size!==rows.length)){for(const p of group)p.issues.push('ترتیب تعهدات هم‌هفته در CRM یکتا نیست.');continue}
  const blocks=rows.flatMap(o=>s.blocks.filter(b=>b.obligationId===o.id&&!s.allocations.some(a=>a.blockId===b.id))),needed=blocks.reduce((n,b)=>n+b.units,0)
  if(group.length>1&&(blocks.length!==group.length||blocks.some(b=>b.units!==10)||new Set(blocks.map(b=>b.obligationId)).size!==1)){for(const p of group)p.issues.push('چند کارشناس در اکسل و بلوک‌های CRM تناظر یک‌به‌یک ندارند؛ انتخاب کارشناس برای تعهد نیازمند تعیین صریح است.');continue}
  let bi=0
  for(const p of group){
   let cursor=0,units=0
   while(bi<blocks.length&&cursor<10){const b=blocks[bi];if(cursor+b.units>10)break
    const days=[];for(let left=b.units;left>0;){const amount=Math.min(2-cursor%2,left),date=plusDays(p.week,Math.floor(cursor/2)),last=days.at(-1);if(last?.date===date)last.units+=amount;else days.push({date,units:amount});cursor+=amount;left-=amount}
    const a=applyCommand(s,'allocate',{blockId:b.id,expertId:p.expertId,days,note:`انتقال از اکسل، شیت استقرار، ${p.sourceCell}. روزها به ترتیب اولویت CRM در شنبه تا چهارشنبه چیده شدند؛ منبع فقط هفته را مشخص کرده است.`},user,{manager:true,now});p.allocationIds.push(a.id);units+=b.units;bi++
   }
   p.allocationPolicy=p.allocationIds.length?'crm-priority-saturday-wednesday':null
   if(!units)p.issues.push('نیاز CRM برای این کارشناس/هفته بلوک آزاد ندارد؛ برنامهٔ اکسل حفظ شد.')
   if(needed>group.length*10)p.issues.push('ظرفیت کارشناسان اکسل برای پوشش کامل نیاز CRM این هفته کافی نیست.')
  }
 }
 // Source black text is evidence, not an override of current CRM rules. Confirm
 // only where the whole obligation is covered and normal approval has no warnings.
 for(const p of programs.filter(p=>p.sourceStatus==='confirmed'&&p.allocationIds.length))for(const aid of p.allocationIds){const a=s.allocations.find(a=>a.id===aid);try{const copy=structuredClone(s);applyCommand(copy,'approve',{ids:[aid]},user,{manager:true,now});s.allocations=copy.allocations;s.audit=copy.audit;s.exceptions=copy.exceptions}catch(e){p.issues.push('قطعی در اکسل؛ تأیید ابزار نیازمند بررسی است: '+e.message)}}
}

export function importedPlanningView(state,allowedIds,{userId,allowedProjectIds=[],allowedEvidenceIds=[]}={}){
 const allowed=new Set(allowedIds),projectAllowed=new Set(allowedProjectIds),other=new Set(allowedEvidenceIds),canEvidence=e=>e.type==='workbook'||e.type==='incident'&&allowed.has(e.id)||e.type==='project'&&projectAllowed.has(e.id)||other.has(e.type+':'+e.id),programs=(state.sourcePrograms||[]).filter(p=>p.ownerId===userId||(!p.issues.length||['resolved','unassigned','blocked'].includes(p.reconciliation?.state))&&!p.internal&&p.projectIds.length&&p.projectIds.every(id=>projectAllowed.has(id))&&p.referenceIds.every(id=>allowed.has(id))&&(p.reconciliation?.evidence||[]).every(canEvidence))
 const visible=programs.map(p=>{const row=structuredClone(p),denied=p.projectIds.some(id=>!projectAllowed.has(id))||p.referenceIds.some(id=>!allowed.has(id))||(p.reconciliation?.evidence||[]).some(e=>!canEvidence(e));row.projectIds=row.projectIds.filter(id=>projectAllowed.has(id));row.referenceIds=row.referenceIds.filter(id=>allowed.has(id));row.allocationIds=row.allocationIds.filter(id=>state.allocations.some(a=>a.id===id&&allowed.has(a.obligationId)));if(denied){row.issues=['برای مشاهدهٔ نتیجهٔ کامل تطبیق، دسترسی فعلی CRM لازم است.'];row.restricted=true;if(row.derivedDates&&row.originalSource){row.week=row.originalSource.week;row.expertId=row.originalSource.expertId;row.sourceDates=structuredClone(row.originalSource.sourceDates);row.derivedDates=false}if(row.reconciliation)row.reconciliation={state:'restricted',reason:row.issues[0]}}return row})
 const refs=new Set(visible.flatMap(p=>p.referenceIds)),projects=new Set(visible.flatMap(p=>p.projectIds))
 return {sourcePrograms:visible,sourceReferences:Object.fromEntries(Object.entries({...state.sourceReferences,...state.obligations}).filter(([id])=>refs.has(id)&&allowed.has(id))),sourceProjects:Object.fromEntries(Object.entries(state.sourceProjects||{}).filter(([id])=>projects.has(id)&&projectAllowed.has(id))),imports:(state.imports||[]).filter(i=>i.by.id===userId)}
}
