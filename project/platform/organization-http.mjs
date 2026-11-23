import {randomUUID} from 'node:crypto'
import {validateCrmConnection} from './crm-user.mjs'
import {readCalendar} from './workspace-connectors.mjs'
import {canConnectOrganizationCrm,organizationSummary} from './organization-account.mjs'
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createOrganizationHttp({store,send,bodyJson,validateCrm=validateCrmConnection,validateCalendar=readCalendar,clock=()=>Date.now()}){
 const flights=new Set(),attempts=new Map();
 return {async handle(req,res,url,user){
  if(url.pathname!=='/api/account/organization')return false;
  const fresh=async()=>{const u=await store.get(user.id);if(!u?.enabled||u.revision!==user.revision)throw fail('نشست پایان یافته است.',401);return u};
  const current=await fresh();
  if(req.method==='GET'){send(res,200,organizationSummary(current));return true;}
  if(!['POST','DELETE'].includes(req.method))throw fail('روش مجاز نیست.',405);
  if(flights.has(user.id))throw fail('بررسی همین حساب در حال اجراست.',409);
  if(req.method==='DELETE'){await store.setOrganization(user.id,{id:randomUUID(),disabled:true},current.organization?.id||null);send(res,200,organizationSummary(await fresh()));return true;}
  const p=await bodyJson(req);if(!p||Array.isArray(p)||Object.keys(p).some(k=>!['username','password','crm','calendar','confirmIdentityChange'].includes(k))||typeof p.username!=='string'||!p.username.trim()||p.username.length>200||p.username.includes(':')||typeof p.password!=='string'||p.password.length>256||typeof p.crm!=='boolean'||typeof p.calendar!=='boolean'||(!p.crm&&!p.calendar)||(p.confirmIdentityChange!==undefined&&typeof p.confirmIdentityChange!=='boolean'))throw fail('اطلاعات حساب سازمانی معتبر نیست.');
  if(p.crm&&!canConnectOrganizationCrm(current))throw fail('هیچ ابزار دارای مجوز CRM برای شما فعال نیست.',403);
  const password=p.password||(current.organization?.username===p.username.trim()&&!current.organization.disabled?current.organization.password:null);if(!password)throw fail('برای حساب جدید رمز را وارد کنید.');
  if(attempts.has(user.id)&&clock()-attempts.get(user.id)<30000)throw fail('برای بررسی دوباره ۳۰ ثانیه صبر کنید.',429);
  attempts.set(user.id,clock());if(attempts.size>2000)for(const [id,at]of attempts)if(clock()-at>30000)attempts.delete(id);
  flights.add(user.id);
  try{
   const account={username:p.username.trim(),password},at=new Date(clock()).toISOString(),saved={...account,id:randomUUID(),crm:null,crmStatus:{state:'disconnected'},calendar:{state:'disconnected'}};
   const status=e=>({state:[401,403,428].includes(e.status)?'denied':'unavailable',checkedAt:at});
   await Promise.all([p.crm?(async()=>{try{saved.crm=await validateCrm(account);saved.crmStatus={state:'connected',checkedAt:at,identity:saved.crm.displayName}}catch(e){saved.crmStatus=status(e)}})():null,p.calendar?(async()=>{try{await validateCalendar(account);saved.calendar={state:'connected',checkedAt:at,...(current.organization?.username===account.username&&current.organization?.calendar?.additionalCalendars?.length?{additionalCalendars:current.organization.calendar.additionalCalendars}:{})}}catch(e){saved.calendar=status(e)}})():null]);
   if(!saved.crm&&saved.calendar.state!=='connected')throw fail('هیچ اتصال درخواستی تأیید نشد؛ حساب قبلی حفظ شد. نام کاربری، رمز، مجوز و شبکه را بررسی کنید.',502);
   const old=current.organization?.crm;if(saved.crm&&old&&old.username===saved.crm.username&&old.password===saved.crm.password&&old.userId===saved.crm.userId&&!old.invalidated)saved.crm=old;
   const latest=await fresh();if(p.crm&&!canConnectOrganizationCrm(latest))throw fail('مجوز CRM هنگام بررسی تغییر کرده است.',403);
   if(saved.crm&&[latest.crm,latest.dashboardCrm,latest.pricingCrm,latest.marketCrm].some(c=>c?.userId&&c.userId!==saved.crm.userId)&&!p.confirmIdentityChange)throw fail('حساب CRM قبلی متفاوت است؛ تغییر هویت را صریحاً تأیید کنید. ایندکس قبلی حذف نشده است.',409);
   await store.setOrganization(user.id,saved,current.organization?.id||null);
   send(res,200,organizationSummary(await fresh()));return true;
  }finally{flights.delete(user.id)}
 }};
}
