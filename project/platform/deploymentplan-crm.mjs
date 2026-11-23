import {readCrmPages} from './crm-read-policy.mjs'
import {fail,kinds,openStatuses,approvalStatuses,crmViewReference,day,week,today,plusDays} from './deploymentplan-engine.mjs'
const guid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const norm=s=>String(s||'').toLowerCase().replace(/[ي]/g,'ی').replace(/ك/g,'ک').replace(/[\s_\-‌]/g,'')
const labels=x=>[x?.UserLocalizedLabel?.Label,...(x?.LocalizedLabels||[]).map(l=>l.Label)].filter(Boolean)
const label=(r,k)=>r[k+'@OData.Community.Display.V1.FormattedValue']||''
const key=f=>f?.AttributeType==='Lookup'||f?.AttributeType==='Customer'||f?.AttributeType==='Owner'?'_'+f.LogicalName+'_value':f?.LogicalName
const value=(r,f)=>f?r[key(f)]:null
const display=(r,f)=>f?label(r,key(f))||String(value(r,f)??''):''
const sourceDay=value=>{if(typeof value!=='string')return null;if(value.includes('T')){const date=new Date(value);return Number.isFinite(date.getTime())?today(date):null}return day(value)}
export function planningSprintDate(start,end,name){
 const from=sourceDay(start),to=sourceDay(end)
 if(from&&new Date(from).getUTCDay()===5&&/هفته|\bweek\b/i.test(name||'')){
  const saturday=plusDays(from,1),length=to?(Date.parse(to)-Date.parse(from))/86400000:null
  if(to&&length>=5&&length<=7&&week(to)===saturday)return {date:saturday,sourceDate:from,endDate:to,basis:'weekly-friday-boundary'}
  return {date:null,sourceDate:from,endDate:to,warning:'مرجع هفتگی از جمعه شروع شده اما پایان هم‌هفته تأیید نشده است؛ تاریخ برنامه‌ریزی نیازمند بررسی است.'}
 }
 return {date:from||to,sourceDate:from,endDate:to,basis:'source-date'}
}
const inList=(f,names)=>names.map(norm).includes(norm(f.LogicalName))||labels(f.DisplayName).some(l=>names.map(norm).includes(norm(l)))
function field(e,names,required=false){const f=e.fields.find(f=>inList(f,names));if(required&&!f)throw fail('فیلد لازم در CRM تأیید نشد: '+names[0],422);return f}
const select=(...fields)=>[...new Set(fields.flat().filter(Boolean).map(f=>typeof f==='string'?f:key(f)))].join(',')
const pages=(read,r,p)=>readCrmPages(read,r,p,{requireComplete:true,maxPages:1000,maxRows:50000,maxMs:540000})
export const temporaryPlanningViewName='همه بکلاگ های استقرار و کانورت پروژه های اتوماسیون'
const viewName=value=>String(value||'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\s\u200c]+/g,' ').trim()
export async function resolvePlanningView(read,input){
 if(input?.name){if(!['auto','system','personal'].includes(input.type)||viewName(input.name)!==viewName(temporaryPlanningViewName))throw fail('نام ویوی موقت CRM معتبر نیست.');const types=input.type==='auto'?['system','personal']:[input.type];for(const type of types){const idField=type==='system'?'savedqueryid':'userqueryid',resource=type==='system'?'savedqueries':'userqueries';let result;try{result=await pages(read,resource,{'$select':`${idField},name,returnedtypecode,statecode`,'$filter':"returnedtypecode eq 'incident' and statecode eq 0"})}catch(e){if(input.type==='auto'&&e.status===403)continue;throw e}const matches=result.value.filter(row=>viewName(row.name)===viewName(input.name));if(matches.length>1)throw fail('چند ویو با این نام پیدا شد؛ شناسهٔ ویو را ثبت کنید.',422);if(matches.length)return {type,id:matches[0][idField]?.toLowerCase(),name:matches[0].name}}throw fail('ویوی موقت تعهدات در CRM پیدا نشد؛ لینک یا شناسهٔ آن را ثبت کنید.',422)}
 return verifyPlanningView(read,{type:input?.type,reference:input?.id||input?.reference})
}
export async function verifyPlanningView(read,input){
 const view=crmViewReference(input),resource=view?.type==='personal'?'userqueries':'savedqueries',idField=view?.type==='personal'?'userqueryid':'savedqueryid'
 if(!view)throw fail('لینک یا شناسهٔ ویو را وارد کنید.')
 const response=await read(resource,{'$select':`${idField},name,returnedtypecode,statecode`,'$filter':`${idField} eq ${view.id}`,'$top':1}),record=response.value?.[0]
 if(!record||record[idField]?.toLowerCase()!==view.id)throw fail('ویو با حساب سازمانی فعلی پیدا نشد یا دسترسی به آن ندارید.',404)
 if(record.returnedtypecode!=='incident')throw fail('این ویو باید از نوع تعهدات CRM (incident) باشد.',422)
 if(record.statecode!==0)throw fail('ویوی CRM فعال نیست.',422)
 return {...view,name:record.name||'ویوی بدون نام'}
}
async function entity(read,name){
 const result=await pages(read,'EntityDefinitions',{'$select':'LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute','$filter':"LogicalName eq '"+name+"'"}),e=result.value[0];if(!e||!/^[a-z][a-z0-9_]*$/i.test(e.EntitySetName))throw fail('ساختار موجودیت CRM تأیید نشد: '+name,422)
 const a=await pages(read,"EntityDefinitions(LogicalName='"+name+"')/Attributes",{'$select':'LogicalName,AttributeType,DisplayName,IsValidForRead,IsSecured'});e.fields=a.value.filter(f=>f.IsValidForRead===true&&!f.IsSecured);return e
}
async function options(read,e,f){
 const type={Picklist:'Picklist',Status:'Status',State:'State'}[f.AttributeType];if(!type)return []
 const o=await read("EntityDefinitions(LogicalName='"+e.LogicalName+"')/Attributes(LogicalName='"+f.LogicalName+"')/Microsoft.Dynamics.CRM."+type+"AttributeMetadata",{'$expand':'OptionSet'});return (o.OptionSet?.Options||[]).map(x=>({value:x.Value,labels:labels(x.Label)}))
}
async function lookupTargets(read,e,f){if(!f||!['Lookup','Customer'].includes(f.AttributeType))return [];const r=await pages(read,"EntityDefinitions(LogicalName='"+e.LogicalName+"')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata",{'$select':'LogicalName,Targets','$filter':"LogicalName eq '"+f.LogicalName+"'"});return r.value[0]?.Targets||[]}
export async function planningMetadata(read){
 const incident=await entity(read,'incident'),f={state:field(incident,['statecode'],true),kind:field(incident,['brd_employeebacklogtype','Employee Backlog Type'],true),size:field(incident,['brd_estimatedsize','brd_estimate','Estimated Size'],true),sprint:field(incident,['brd_sprinttime','Sprint Time'],true),backlog:field(incident,['brd_backlogdate','BacklogDate'],true),priorityNumber:field(incident,['brd_projectprioritynumber','brd_projectpriority','Project Priority Number'],true),project:field(incident,['brd_project','Project'],true),customer:field(incident,['brd_account','customerid','Account'],true),priority:field(incident,['prioritycode','Priority']),title:field(incident,['title'],true),number:field(incident,['ticketnumber'],true)}
 if(!(await lookupTargets(read,incident,f.project)).includes('brd_project'))throw fail('رابطهٔ بک‌لاگ با پروژه در CRM تأیید نشد.',422)
 const kindOptions=await options(read,incident,f.kind),kindValues={};for(const name of kinds){const matches=kindOptions.filter(o=>o.labels.some(l=>norm(l)===norm(name)));if(matches.length!==1)throw fail('نگاشت نوع '+name+' در CRM یکتا نیست.',422);kindValues[name]=matches[0].value}
 const statusFields=incident.fields.filter(a=>['statuscode','brd_backlogstatusreason'].includes(a.LogicalName)),statusMaps={}
 for(const sf of statusFields)statusMaps[sf.LogicalName]=await options(read,incident,sf)
 const aliases={'Planned':['Planned','برنامه‌ریزی‌شده'],'Request To Plan Sprint':['Request To Plan Sprint','درخواست برنامه‌ریزی اسپرینت'],'Waiting for Customer':['Waiting for Customer','منتظر مشتری'],'Submit':['Submit','ثبت‌شده']},statusValues={}
 for(const status of openStatuses){const matched=statusFields.flatMap(sf=>(statusMaps[sf.LogicalName]||[]).filter(o=>o.labels.some(l=>aliases[status].map(norm).includes(norm(l)))).map(o=>({field:sf.LogicalName,value:o.value})));if(!matched.length)throw fail('وضعیت '+status+' در CRM تأیید نشد.',422);statusValues[status]=matched}
 const stateOptions=await options(read,incident,f.state),active=stateOptions.filter(o=>o.labels.some(l=>['active','فعال'].includes(norm(l))));if(active.length!==1)throw fail('وضعیت فعال در metadata CRM تأیید نشد.',422);const activeState=active[0].value;
 const planningStatusField=statusFields.find(sf=>openStatuses.every(status=>(statusValues[status]||[]).some(x=>x.field===sf.LogicalName)))?.LogicalName||null;if(planningStatusField)for(const status of openStatuses)statusValues[status]=statusValues[status].filter(x=>x.field===planningStatusField);
 const project=await entity(read,'brd_project'),pf={name:field(project,[project.PrimaryNameAttribute],true),manager:field(project,['brd_projectmanager','Project Manager']),customer:field(project,['brd_account','brd_customer','Account']),province:field(project,['brd_province','address1_stateorprovince','Province']),city:field(project,['brd_city','address1_city','City'])}
 let sprint=null;if(f.sprint.AttributeType==='Lookup'){const targets=await lookupTargets(read,incident,f.sprint);if(targets.length!==1)throw fail('رابطهٔ هفتهٔ مرجع در CRM یکتا نیست.',422);const e=await entity(read,targets[0]);sprint={...e,date:field(e,['brd_startdate','brd_starttime','brd_fromdate','brd_start','Start Date','تاریخ شروع']),end:field(e,['brd_enddate','brd_endtime','brd_todate','End Date','To Date','تاریخ پایان'])}}
 let account=null;try{account=await entity(read,'account')}catch(e){if(e.status!==403)throw e}
 return {incident,f,kindValues,kindOptions,statusFields,statusMaps,statusValues,activeState,stateOptions,planningStatusField,project,pf,sprint,account}
}
async function byIds(read,e,ids,fields){const all=[];for(let i=0;i<ids.length;i+=40){const part=ids.slice(i,i+40);if(part.some(id=>!guid.test(id)))throw fail('شناسهٔ مرجع معتبر نیست.',502);const r=await pages(read,e.EntitySetName,{'$select':select(e.PrimaryIdAttribute,fields),'$filter':part.map(id=>e.PrimaryIdAttribute+' eq '+id).join(' or ')});all.push(...r.value)}return all}
function normalizeRows(rows,meta,projects,sprints,accounts){
 const {f,pf}=meta,projectMap=new Map(projects.map(r=>[r[meta.project.PrimaryIdAttribute],r])),sprintMap=new Map(sprints.map(r=>[r[meta.sprint?.PrimaryIdAttribute],r])),accountMap=new Map(accounts.map(r=>[r[meta.account?.PrimaryIdAttribute],r]))
 return rows.map(r=>{
  const id=r[meta.incident.PrimaryIdAttribute];if(!guid.test(id||''))throw fail('شناسهٔ بک‌لاگ معتبر نیست.',502)
  const rawProject=value(r,f.project);if(rawProject&&!guid.test(rawProject))throw fail('شناسهٔ پروژهٔ CRM معتبر نیست؛ دریافت اعمال نشد.',502);const projectId=rawProject||null,pr=projectMap.get(projectId)
  const kind=kinds.find(k=>meta.kindValues[k]===value(r,f.kind))||display(r,f.kind),sizeRaw=value(r,f.size),sizeUnits=sizeRaw==null?null:Number(sizeRaw);if(sizeUnits!==null&&(!Number.isSafeInteger(sizeUnits)||sizeUnits<0))throw fail('اندازهٔ CRM باید تعداد دقیق نیم‌روز باشد؛ گردکردن انجام نشد.',422)
  const matches=openStatuses.filter(status=>meta.statusValues[status].some(x=>r[x.field]===x.value)),statusText=meta.statusFields.map(sf=>display(r,sf)).join(' / '),primaryStatus=meta.planningStatusField?display(r,meta.statusFields.find(sf=>sf.LogicalName===meta.planningStatusField)):statusText,closed=/done|resolved|cancel|problem solved|بسته|لغو|انجام شد/i.test(primaryStatus)||r[key(f.state)]!==undefined&&r[key(f.state)]!==meta.activeState,status=closed?'Closed':matches.length===1?matches[0]:statusText
  let sprintDate=null,sprintSourceDate=null,sprintEndDate=null,sprintBasis=null,mappingWarning=projectId?'':'لینک پروژه در CRM ثبت نشده است؛ تعهد تا تکمیل مرجع قابل تخصیص نیست.';const raw=value(r,f.sprint),sp=meta.sprint&&sprintMap.get(raw)
  if(meta.sprint){const start=sp&&value(sp,meta.sprint.date),end=sp&&value(sp,meta.sprint.end),resolved=planningSprintDate(start,end,sp?.[meta.sprint.PrimaryNameAttribute]||display(r,f.sprint));sprintDate=resolved.date;sprintSourceDate=resolved.sourceDate;sprintEndDate=resolved.endDate;sprintBasis=resolved.basis||null;if(raw&&!sprintDate)mappingWarning=[mappingWarning,resolved.warning||'تاریخ هفتهٔ Sprint Time از مرجع CRM قابل تأیید نیست.'].filter(Boolean).join(' ')}
  else if(f.sprint.AttributeType==='DateTime')sprintDate=sourceDay(raw)
  if(sprintDate&&['2029-03-19','2029-03-29'].includes(sprintDate)){sprintDate=null;mappingWarning=[mappingWarning,'تاریخ نمادین مورد اختلاف در سند؛ هفته نیازمند بررسی مرجع CRM است.'].filter(Boolean).join(' ')}
  const customerId=value(pr||{},pf.customer)||value(r,f.customer);if(!guid.test(customerId||''))throw fail('شناسهٔ مشتری بک‌لاگ در CRM تأیید نشد؛ دریافت اعمال نشد.',422);const account=accountMap.get(customerId),geo=(names)=>{const af=meta.account&&field(meta.account,names);return account&&af?display(account,af):''}
  return {id:id.toLowerCase(),number:display(r,f.number),title:display(r,f.title),kind,sizeUnits,status,sourceStatus:statusText,closed,projectId,project:pr?display(pr,pf.name):display(r,f.project),customerId,customer:pr&&pf.customer?display(pr,pf.customer)||display(r,f.customer):display(r,f.customer),manager:pr?display(pr,pf.manager):'',province:pr&&display(pr,pf.province)||geo(['brd_province','address1_stateorprovince','Province']),city:pr&&display(pr,pf.city)||geo(['brd_city','address1_city','City']),week:sprintDate?week(sprintDate):null,sprintDate,sprintSourceDate,sprintEndDate,sprintBasis,sprint:display(r,f.sprint),backlogDate:sourceDay(value(r,f.backlog)),priorityNumber:value(r,f.priorityNumber)==null?null:Number(value(r,f.priorityNumber)),priority:display(r,f.priority),mappingWarning,url:'https://crm.baridsoft.ir/Main/main.aspx?pagetype=entityrecord&etn=incident&id='+id}
 })
}
export async function fetchPlanningSnapshot(read,meta,knownIds=[],progress=()=>{},viewReference=null){
 if(viewReference){progress('یافتن ویوی تعهدات CRM');const view=await resolvePlanningView(read,viewReference);if(!guid.test(view.id||''))throw fail('شناسهٔ ویوی CRM معتبر نیست.',422);progress('دریافت همهٔ صفحه‌های ویوی '+view.name);const query=view.type==='personal'?{'userQuery':view.id}:{'savedQuery':view.id},results=await pages(read,meta.incident.EntitySetName,query),ids=[...new Set(results.value.map(row=>row[meta.incident.PrimaryIdAttribute]))];if(ids.some(id=>!guid.test(id||'')))throw fail('ویوی CRM شناسهٔ معتبر تعهد برنمی‌گرداند.',422);const fields=select(meta.incident.PrimaryIdAttribute,Object.values(meta.f),meta.statusFields,'statecode'),records=await byIds(read,meta.incident,[...new Set([...ids,...knownIds])],fields),inView=new Set(ids.map(id=>id.toLowerCase()));return hydratePlanningRecords(read,meta,records.filter(row=>inView.has(row[meta.incident.PrimaryIdAttribute]?.toLowerCase())||knownIds.includes(row[meta.incident.PrimaryIdAttribute]?.toLowerCase())),progress)}
 progress('دریافت همهٔ صفحه‌های تعهدات مجاز CRM')
 const kindFilter='('+Object.values(meta.kindValues).map(v=>key(meta.f.kind)+' eq '+Number(v)).join(' or ')+')',states=[...new Set(Object.values(meta.statusValues).flat().map(x=>x.field+' eq '+Number(x.value)))],fields=select(meta.incident.PrimaryIdAttribute,Object.values(meta.f),meta.statusFields,'statecode'),incoming=await pages(read,meta.incident.EntitySetName,{'$select':fields,'$filter':key(meta.f.state)+' eq '+Number(meta.activeState)+' and '+kindFilter+' and ('+states.join(' or ')+')','$orderby':meta.incident.PrimaryIdAttribute+' asc'})
 const map=new Map(incoming.value.map(r=>[r[meta.incident.PrimaryIdAttribute],r])),tracked=knownIds.filter(id=>!map.has(id));if(tracked.length){progress('بررسی وضعیت شناسه‌های قبلی بدون بازخوانی تاریخچه');for(const r of await byIds(read,meta.incident,tracked,fields))map.set(r[meta.incident.PrimaryIdAttribute],r)}
 const rows=[...map.values()];return hydratePlanningRecords(read,meta,rows,progress)
}
export async function hydratePlanningRecords(read,meta,rows,progress=()=>{}){
 const projectIds=[...new Set(rows.map(r=>value(r,meta.f.project)).filter(Boolean))];progress('خواندن پروژه، مرکز و هفتهٔ مرجع')
 const projects=await byIds(read,meta.project,projectIds,Object.values(meta.pf)),sprintIds=meta.sprint?[...new Set(rows.map(r=>value(r,meta.f.sprint)).filter(Boolean))]:[],sprints=meta.sprint?await byIds(read,meta.sprint,sprintIds,[meta.sprint.PrimaryNameAttribute,meta.sprint.date,meta.sprint.end]):[]
 const accountIds=[...new Set([...rows.map(r=>value(r,meta.f.customer)),...projects.map(r=>value(r,meta.pf.customer))].filter(Boolean))],af=meta.account?[field(meta.account,['brd_province','address1_stateorprovince','Province']),field(meta.account,['brd_city','address1_city','City'])].filter(Boolean):[],accounts=meta.account&&af.length?await byIds(read,meta.account,accountIds,af):[]
 return normalizeRows(rows,meta,projects,sprints,accounts)
}
export async function authorizedPlanningIds(read,meta,ids){if(!ids.length)return [];const rows=await byIds(read,meta.incident,[...new Set(ids)],[]);return rows.map(r=>r[meta.incident.PrimaryIdAttribute].toLowerCase())}
export async function authorizedPlanningProjects(read,meta,ids){if(!ids.length)return [];const rows=await byIds(read,meta.project,[...new Set(ids)],[]);return rows.map(r=>r[meta.project.PrimaryIdAttribute].toLowerCase())}
export async function authorizedPlanningEvidence(read,groups){
 const out=[]
 for(const [name,ids] of Object.entries(groups||{})){
  if(!['serviceappointment','annotation'].includes(name)||!Array.isArray(ids)||ids.some(id=>!guid.test(id)))throw fail('شناسهٔ شاهد CRM معتبر نیست.',422)
  if(!ids.length)continue
  const defs=await pages(read,'EntityDefinitions',{'$select':'LogicalName,EntitySetName,PrimaryIdAttribute','$filter':`LogicalName eq '${name}'`}),e=defs.value[0]
  if(!e||!/^[a-z][a-z0-9_]*$/i.test(e.EntitySetName))throw fail('ساختار شاهد CRM تأیید نشد.',422)
  for(const row of await byIds(read,e,ids,[]))out.push(name+':'+row[e.PrimaryIdAttribute].toLowerCase())
 }
 return out
}
