import {randomUUID} from 'node:crypto'
export const accessSections=[['matrix','ماتریس برنامه‌ریزی'],['demands','تعهدات و بلوک‌ها'],['crm-changes','تغییرات CRM'],['conflicts','تناقضات و سوئیچ'],['experts','کارشناسان و عدم دسترسی'],['archive','آرشیو هفتگی'],['audit','تاریخچهٔ تغییرات'],['settings','پیکربندی'],['help','راهنما']]
export const accessActions=[['plan','ثبت و جابه‌جایی برنامه'],['sync','بازخوانی CRM'],['absence','ثبت عدم دسترسی'],['crmReview','ثبت بررسی تغییرات CRM']]
const keys=new Set([...accessSections,...accessActions].map(([id])=>id))
const defaults=()=>Object.fromEntries([...keys].map(k=>[k,!['archive','audit','settings'].includes(k)]))
const error=(message,status=403)=>Object.assign(Error(message),{status})
export function appAccess(state,user,legacyManager=false){
 const member=state.appAccess?.members?.[user.id],configured=Boolean(state.appAccess?.initialized),role=member?.role||(!configured&&legacyManager?'admin':'user');
 return {role,manager:role==='admin',permissions:role==='admin'?Object.fromEntries([...keys].map(k=>[k,true])):{...defaults(),...member?.permissions},configured}
}
export function initializeAppAccess(state,user,at){
 if(state.appAccess?.initialized||String(user.login||user.username||'').trim().toLowerCase()!=='ghasemi')return false
 state.appAccess={initialized:true,members:{[user.id]:{role:'admin',permissions:{},name:user.name,login:user.login||user.username}},initializedAt:at}
 state.audit.push({id:randomUUID(),at,actor:{id:user.id,name:user.name},action:'تعیین مدیر اولیهٔ داخلی برنامه',before:null,after:{userId:user.id,login:user.login||user.username,role:'admin'},obligationIds:[]});return true
}
export function requireAppPermission(state,user,permission,legacyManager=false){const a=appAccess(state,user,legacyManager);if(!a.permissions[permission]||permission==='plan'&&!a.permissions.matrix&&!a.permissions.demands||permission==='absence'&&!a.permissions.experts||permission==='crmReview'&&!a.permissions['crm-changes'])throw error('به این بخش یا عملیات در برنامه دسترسی ندارید.');return a}
export function setAppMember(state,actor,target,data,at,legacyManager=false){
 if(!appAccess(state,actor,legacyManager).manager)throw error('مدیریت دسترسی‌ها فقط برای مدیر داخلی برنامه مجاز است.')
 if(!state.appAccess?.initialized)throw error('ابتدا حساب ghasemi باید وارد برنامه شود تا مدیر اولیه ثبت شود.',409)
 if(!target?.enabled||!target.id||!['admin','user'].includes(data.role)||!data.permissions||typeof data.permissions!=='object'||Array.isArray(data.permissions)||Object.entries(data.permissions).some(([k,v])=>!keys.has(k)||typeof v!=='boolean'))throw error('نقش یا مجوزها معتبر نیست.',400)
 const members=state.appAccess.members,before=members[target.id]||null;
 if(before?.role==='admin'&&data.role!=='admin'&&Object.values(members).filter(m=>m.role==='admin').length<=1)throw error('دسترسی آخرین مدیر برنامه را نمی‌توان حذف کرد.',409)
 const after={role:data.role,permissions:data.role==='admin'?{}:{...defaults(),...data.permissions},name:target.name,login:target.login||target.username||''};members[target.id]=after;
 state.audit.push({id:randomUUID(),at,actor:{id:actor.id,name:actor.name},action:'تغییر دسترسی داخلی کاربر',before,after:{userId:target.id,...after},obligationIds:[]});return after
}
export const commandPermission=action=>['allocate','allocate-group','allocate-fitting','preview-fitting','return-group','delete-allocation','move-group','undo-planning'].includes(action)?'plan':['absence','delete-absence'].includes(action)?'absence':action==='crm-change-review'?'crmReview':'admin'
