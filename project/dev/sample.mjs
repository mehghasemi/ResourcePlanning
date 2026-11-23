// Synthetic development fixtures. No production records or credentials.
import {createPlanState,applySnapshot,applyCommand,plusDays,week,today} from '../platform/deploymentplan-engine.mjs'
import {importPlanningSource} from '../platform/deploymentplan-import.mjs'
import {applySourceReviews} from '../platform/deploymentplan-reconciliation.mjs'
export const sampleCrmId='11111111-1111-4111-8111-111111111111'
export function sampleRows(now=new Date()) {
  const w=week(today(now))
  return [
    ['22222222-2222-4222-8222-222222222222','Implementation',30,'پروژهٔ نمونهٔ اول','مشتری نمونهٔ اول'],
    ['33333333-3333-4333-8333-333333333333','Implementation',8,'پروژهٔ نمونهٔ دوم','مشتری نمونهٔ دوم'],
    ['44444444-4444-4444-8444-444444444444','Converter',20,'کانورت نمونه','مشتری نمونهٔ دوم']
  ].map(([id,kind,sizeUnits,project,customer],i)=>({id,title:kind==='Converter'?'تبدیل اطلاعات اولیه':'آموزش و استقرار پرگار',number:'DEMO-'+(i+1),kind,sizeUnits,projectId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa'+i,project,customerId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb'+i,customer,manager:'مدیر نمونه',province:'تهران',city:'تهران',week:w,sprintDate:w,backlogDate:w,status:'Planned',sourceStatus:'Planned',closed:false,priorityNumber:i,url:null}))
}
export function createSample(user,now=new Date()) {
  const rows=sampleRows(now),s=createPlanState(),w=rows[0].week
  applySnapshot(s,rows,user,now.toISOString())
  for(const [name,kind,order] of [['کارشناس استقرار الف','Implementation',1],['کارشناس استقرار ب','Implementation',2],['کارشناس استقرار ج','Implementation',3],['کارشناس کانورت الف','Converter',4],['کارشناس کانورت ب','Converter',5]]) applyCommand(s,'expert',{name,kind,order,active:true},user,{manager:true,now})
  const batch={source:{file:'SYNTHETIC-DEMO.xlsx',sheet:'استقرار',sha256:'a'.repeat(64),year:Number(new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric'}).format(now))},experts:[{sourceCell:'A2',name:'کارشناس استقرار ب',kind:'Implementation',order:2}],programs:[['Y2','مشتری نمونهٔ اول',w,'A2'],['Z2','برنامهٔ آیندهٔ نمونه',plusDays(w,7),'A2'],['Y27','برنامهٔ بدون کارشناس نمونه',w,null]].map(([sourceCell,text,week,expertSource])=>({sourceCell,text,week,expertSource,kind:'Implementation',sourceStatus:'proposed',sourceStage:'before',header:'هفتهٔ نمونه',style:{},issues:[]})),notes:[]}
  importPlanningSource(s,batch,{projects:rows.map(r=>({id:r.projectId,name:r.project})),references:rows,mapping:{Y2:{projectIds:[rows[0].projectId]},Z2:{projectIds:[rows[1].projectId]},Y27:{projectIds:[rows[1].projectId]}}},user,{now})
  applySourceReviews(s,s.sourcePrograms.map(p=>({id:p.id,state:p.sourceCell==='Z2'?'decision':p.expertId?'resolved':'unassigned',questionKey:p.sourceCell==='Z2'?'DEMO-1':null,reason:p.sourceCell==='Z2'?'نمونهٔ پرسش مدیر: کارشناس تعهد تعیین شود.':p.expertId?'نمونه: پروژه و هفته تطبیق شد.':'نمونه: کارشناس در منبع تعیین نشده است.',evidence:[{type:'workbook',cell:p.sourceCell}]})),user)
  const block=s.blocks.find(b=>b.obligationId===rows[0].id&&!s.allocations.some(a=>a.blockId===b.id))
  if(block) applyCommand(s,'allocate',{blockId:block.id,expertId:s.experts[0].id,days:Array.from({length:5},(_,i)=>({date:plusDays(w,i),units:2})),note:'تخصیص ساختگی برای آزمایش رابط'},user,{manager:true,now})
  return s
}
