import {createHash,randomUUID} from 'node:crypto'
import {fail} from './deploymentplan-engine.mjs'
export const sourceReviewStates=['resolved','unassigned','blocked','decision']
const guid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
export function applySourceReviews(s,records,user,{at=new Date().toISOString()}={}){
 if(!Array.isArray(records)||!records.length||new Set(records.map(r=>r.id)).size!==records.length)throw fail('نتیجهٔ بررسی معتبر و یکتا نیست.')
 let changed=0
 for(const r of records){
  const p=s.sourcePrograms?.find(p=>p.id===r.id)
  if(!p||!sourceReviewStates.includes(r.state)||typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>4000||r.state==='decision'&&!/^[A-Z][A-Z0-9-]{0,35}$/.test(r.questionKey||''))throw fail('وضعیت و دلیل تعیین تکلیف کامل نیست.')
  const evidence=r.evidence||[]
  if(!Array.isArray(evidence)||evidence.some(e=>!['workbook','incident','project','serviceappointment','annotation'].includes(e.type)||e.type!=='workbook'&&!guid.test(e.id||'')||e.type==='workbook'&&!/^[A-Z]+\d+$/.test(e.cell||'')))throw fail('شاهد تعیین تکلیف معتبر نیست.')
  for(const e of evidence){if(e.type==='incident'&&!s.sourceReferences?.[e.id]&&!s.obligations[e.id])throw fail('تعهد شاهد در مراجع بررسی‌شده نیست.');if(e.type==='project'&&!s.sourceProjects?.[e.id])throw fail('پروژهٔ شاهد در مراجع بررسی‌شده نیست.')}
  const body={state:r.state,reason:r.reason.trim(),questionKey:r.state==='decision'?r.questionKey:null,evidence:structuredClone(evidence)},fingerprint=createHash('sha256').update(JSON.stringify(body)).digest('hex')
  if(p.reconciliation?.fingerprint===fingerprint)continue
  const before=structuredClone(p.reconciliation||null);p.reconciliation={...body,fingerprint,at,by:{id:user.id,name:user.name}};changed++
  s.audit.push({id:randomUUID(),sourceReview:true,sourceProgramId:p.id,at,actor:{id:user.id,name:user.name},action:'تعیین تکلیف تطبیق اکسل',before,after:{sourceCell:p.sourceCell,...p.reconciliation},obligationIds:[...new Set(evidence.filter(e=>e.type==='incident').map(e=>e.id))]})
 }
 return {changed,counts:Object.fromEntries(sourceReviewStates.map(state=>[state,s.sourcePrograms.filter(p=>p.reconciliation?.state===state).length]))}
}
export function sourceReviewEvidenceIds(s){const out={};for(const p of s.sourcePrograms||[])for(const e of p.reconciliation?.evidence||[])if(['serviceappointment','annotation'].includes(e.type))(out[e.type]??=new Set()).add(e.id);return Object.fromEntries(Object.entries(out).map(([k,v])=>[k,[...v]]))}
export function canReadSourceEvidence(list,{ids=[],projectIds=[],evidenceIds=[]}={}){const cases=new Set(ids),projects=new Set(projectIds),other=new Set(evidenceIds);return (list||[]).every(e=>e.type==='workbook'||e.type==='incident'&&cases.has(e.id)||e.type==='project'&&projects.has(e.id)||other.has(e.type+':'+e.id))}
