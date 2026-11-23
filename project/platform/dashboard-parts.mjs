import {dashboardSectionError} from './dashboard-diagnostics.mjs'
export const dashboardSalesParts=[
 {id:'snapshot-sales-opportunities',label:'فروش · فرصت‌ها',keys:['opportunities'],stages:[1,2,16,17,18],entities:['opportunities','quotes','accounts','annotations','tasks']},
 {id:'snapshot-sales-quotes',label:'فروش · پیشنهادها',keys:['quotes'],stages:[1,2,11,16,17,18],entities:['opportunities','quotes','quotecloses','accounts','annotations','tasks']},
 {id:'snapshot-sales-opportunity-lines',label:'فروش · اقلام فرصت',keys:['opportunityLines'],stages:[1,2,8,16,17,18],entities:['opportunities','quotes','opportunityproducts','accounts','annotations','tasks']},
 {id:'snapshot-sales-quote-lines',label:'فروش · اقلام پیشنهاد',keys:['quoteLines'],stages:[1,2,9,11,16,17,18],entities:['opportunities','quotes','quotedetails','quotecloses','accounts','annotations','tasks']}
];
const salesIds=dashboardSalesParts.map(p=>p.id);
export function expandSalesAvailability(availability){
 if(!availability?.sections?.['snapshot-sales'])return availability;
 const sections={...availability.sections},legacy=sections['snapshot-sales'];delete sections['snapshot-sales'];
 for(const part of dashboardSalesParts)sections[part.id]??=(legacy.state==='ready'?{...legacy,label:part.label}:{state:'pending',label:part.label});
 return {...availability,sections};
}
export const dashboardParts=[
 {id:'snapshot-income',label:'درآمد',keys:['invoices']},
 {id:'snapshot-cash',label:'وصول',keys:['receipts']},
 {id:'snapshot-receivables',label:'مطالبات',keys:['collectionInvoices']},
 ...dashboardSalesParts,
 {id:'snapshot-orders',label:'سفارشات',keys:['orders','orderLines','backlogs','serviceActivities','orderInvoices']},
 {id:'snapshot-leads',label:'سرنخ‌ها',keys:['leads']},
 ...['revenue','cases','serviceActivities'].map(name=>({id:'ranking-'+name,kind:'ranking',name,label:'رتبه‌بندی '+({revenue:'درآمد',cases:'کیس‌ها',serviceActivities:'خدمات'}[name])})),
 ...['leads','opportunities','contracts','invoices','serviceActivities'].map(name=>({id:'market-'+name,kind:'market',name,label:'بازار · '+({leads:'سرنخ',opportunities:'فرصت',contracts:'قرارداد',invoices:'درآمد',serviceActivities:'خدمات'}[name])}))
]
const emptySnapshot=()=>Object.fromEntries(dashboardParts.flatMap(p=>p.keys||[]).map(key=>[key,[]]))
export const dashboardViews={
 workspace:['snapshot-sales-opportunities','snapshot-sales-quotes','snapshot-receivables','snapshot-orders'],
 all:['snapshot-income','snapshot-cash','snapshot-orders'],
 product:['snapshot-income',...salesIds],support:['snapshot-income',...salesIds],
 orders:['snapshot-orders'],receivables:['snapshot-receivables','snapshot-cash'],
 'team-development':[...salesIds,'snapshot-leads'],
 'team-services':[...salesIds],
 'bl-office':['snapshot-income',...salesIds,'snapshot-orders'],
 'bl-hr':['snapshot-income',...salesIds,'snapshot-orders'],
 'bl-database':['snapshot-income',...salesIds,'snapshot-orders'],
 'bl-finance':['snapshot-income',...salesIds,'snapshot-orders']
}
export function reportPartitions(report,view){
 if(report==='customer-rankings')return dashboardParts.filter(p=>p.kind==='ranking')
 if(report==='market-analysis')return dashboardParts.filter(p=>p.kind==='market')
 if(report!=='data')throw Object.assign(Error('گزارش موجود نیست.'),{status:404})
 if(view!==undefined&&!Object.hasOwn(dashboardViews,view))throw Object.assign(Error('نمای داشبورد معتبر نیست.'),{status:400})
 return dashboardParts.filter(p=>view?dashboardViews[view].includes(p.id):Boolean(p.keys))
}
export function newPartitionedPack(coverage){return {format:'daily-v1',coverage,generatedAt:new Date().toISOString(),snapshot:{...emptySnapshot(),source:'Microsoft Dynamics 365',organization:'Main',amountDivisor:10000000000},rankings:{revenue:[],cases:[],serviceActivities:[]},markets:{leads:[],opportunities:[],contracts:[],invoices:[],serviceActivities:[]},availability:{partial:true,deniedEntities:[],failedEntities:[],errors:[],sections:Object.fromEntries(dashboardParts.map(p=>[p.id,{state:'pending',label:p.label}]))}}}
export function mergePartition(pack,part,result,error){
 const availability=result?.availability||{partial:false,deniedEntities:[],failedEntities:[],errors:[]};
 pack.availability.sections[part.id]={state:error||availability.partial?'failed':'ready',label:part.label,at:new Date().toISOString(),availability,changeTracking:result?.changeTracking,error:error?dashboardSectionError(error):undefined};
 if(result){pack.culture??=result.culture;if(part.keys){for(const key of part.keys)pack.snapshot[key]=result.snapshot[key]||[];for(const key of ['source','organization','currency','amountDivisor','range'])if(result.snapshot[key]!==undefined)pack.snapshot[key]=result.snapshot[key]}else if(part.kind==='ranking')pack.rankings[part.name]=result.rankings[part.name]||[];else pack.markets[part.name]=result.markets[part.name]||[]}
 const sections=Object.values(pack.availability.sections);
 pack.availability.partial=sections.some(s=>s.state!=='ready'||s.refreshFailed);
 pack.availability.deniedEntities=[...new Set(sections.flatMap(s=>s.availability?.deniedEntities||[]))];
 pack.availability.failedEntities=[...new Set(sections.flatMap(s=>s.availability?.failedEntities||[]))];
 pack.availability.errors=sections.flatMap(s=>s.availability?.errors||[]);
 pack.snapshot.availability=pack.availability;pack.generatedAt=new Date().toISOString();pack.snapshot.generatedAt=pack.generatedAt;return pack;
}
