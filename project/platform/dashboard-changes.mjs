import {dashboardSalesParts} from './dashboard-parts.mjs'
// Conservative dependencies include joined records, not just the report's root table.
export const snapshotDependencies={
 'snapshot-income':['invoicedetails','invoices','products','accounts'],
 'snapshot-cash':['brd_receipts'],
 'snapshot-receivables':['invoices','accounts'],
 'snapshot-sales':['opportunities','quotes','opportunityproducts','quotedetails','quotecloses','accounts','annotations','tasks','products'],
 ...Object.fromEntries(dashboardSalesParts.map(part=>[part.id,[...part.entities,'products']])),
 'snapshot-orders':['salesorders','salesorderdetails','incidents','serviceappointments','invoices','annotations','products','accounts'],
 'snapshot-leads':['leads']
};
const sets={account:'accounts',invoice:'invoices',invoicedetail:'invoicedetails',product:'products',lead:'leads',opportunity:'opportunities',quote:'quotes',incident:'incidents',serviceappointment:'serviceappointments',salesorder:'salesorders'};
export function changeDependencies(part,plans){
 if(snapshotDependencies[part])return snapshotDependencies[part];
 const plan=plans.find(p=>p.kind+'-'+p.name===part);if(!plan)throw Error('Unknown change partition');
 const names=[...plan.template.matchAll(/<(?:entity|link-entity)\s+name=['"]([^'"]+)/g)].map(m=>sets[m[1]]);
 if(names.some(n=>!n))return null;
 return [...new Set([plan.entity,...names])];
}
export function validDeltaUrl(value,entity){
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='crm.baridsoft.ir'&&url.port===''&&!url.username&&!url.password&&!url.hash&&url.pathname==='/Main/api/data/v9.1/'+entity}catch{return false}
}
