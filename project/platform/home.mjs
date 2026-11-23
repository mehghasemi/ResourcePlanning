import {installedExtensions} from './extension-registry.mjs'
import {componentTitles} from './component-catalog.mjs'
import {toolRoles,canManageTool} from './platform-access.mjs'
// Home catalog is separate from each tool's business logic. Unconnected modules
// are design previews for the platform administrator, not granted data access.
const upcoming=[
  {id:'tariff',title:'محاسبه‌گر تعرفه نیرو و خدمات',description:'تعرفه نیروی انسانی، زمان کار و برآورد هزینه خدمات بر مبنای راهنمای نفرساعت ۱۴۰۵.',category:'تعرفه نیرو و خدمات'},
  {id:'market',title:componentTitles.market,description:'جست‌وجوی یکپارچه مشتریان، مدیریت سرنخ‌ها، موردها، اسناد قرارداد و گزارش‌های فروش.',category:'شناخت و برنامه‌ریزی'},
  {id:'pricing',title:'محاسبه‌گر قیمت',description:'محاسبهٔ قیمت و آماده‌سازی پیشنهاد، با قواعد و محاسبات مستقل این ابزار.',category:'قیمت‌گذاری و پیشنهاد'},
  {id:'crm',title:'دستیار قائم‌مقام مدیرعامل',description:'نمایی از مشتریان و جریان فروش، با حفظ مجوزهای حساب CRM هر کاربر.',category:'مشتریان و فروش'}
]
export function homeSnapshot(user){
  if(!user?.enabled)throw Object.assign(new Error('برای ادامه وارد حساب فعال خود شوید.'),{status:403})
  const roles=toolRoles(user),tools=upcoming.filter(tool=>roles[tool.id]!=='none').map(tool=>({...tool,role:roles[tool.id],ready:['market','pricing','crm','tariff'].includes(tool.id),previewOnly:!['market','pricing','crm','tariff'].includes(tool.id),href:tool.id==='tariff'?'/tariff/':tool.id==='market'?'/market/':tool.id==='pricing'?'/pricing/':tool.id==='crm'?'/crm-dashboard/':null,managementHref:canManageTool(user,tool.id)?(tool.id==='market'?'/market/admin':tool.id==='pricing'?'/pricing/admin':null):null}))
  if(roles.reports!=='none'&&roles.chat!=='none'&&user.access?.includes('crm'))tools.push({id:'reports',title:'گزارش‌ساز هوشمند',description:'گزارش‌های شخصی CRM؛ جدول، نمودار و تحلیل مستند با امکان به‌روزرسانی و خروجی.',category:'گزارش و تحلیل',role:roles.reports,ready:true,previewOnly:false,href:'/reports/'})
  if(roles.chat!=='none')tools.push({id:'chat',title:'دستیار هوشمند',description:'پرسش از دانش سازمان، CRM و مدل، در یک گفت‌وگو با سابقهٔ شخصی شما.',category:'دانش و گفت‌وگو',role:roles.chat,managementHref:canManageTool(user,'chat')?'/admin.html':null,ready:true,previewOnly:false,href:'/'})
  if(roles.contracts!=='none')tools.push({id:'contracts',title:'مقایسه‌گر قرارداد',description:'تطبیق فروش و پشتیبانی با تمپلیت، کنترل SLA کانورت و بررسی اختلاف‌ها همراه با گفت‌وگو.',category:'قراردادها و تعهدات',role:roles.contracts,ready:true,previewOnly:false,href:'/contracts/'})
  if(roles.coordination!=='none')tools.push({id:'coordination',title:componentTitles.coordination,description:'میز کنترل روزانه، صف‌های کاری، تعهدات و تقویم تیم؛ همراه با پرسش از CRM.',category:'هماهنگی و برنامه‌ریزی',role:roles.coordination,ready:true,previewOnly:false,href:'/coordination/'})
  if(roles.marketing!=='none')tools.push({id:'marketing',title:componentTitles.marketing,description:'اکانت‌ها، مخاطبان، سرنخ‌ها، کمپین‌ها و گزارش‌ها با اتصال یکپارچه CRM.',category:'بازاریابی',role:roles.marketing,ready:true,previewOnly:false,href:'/marketing/'})
  if(roles.presentation!=='none')tools.push({id:'presentation',title:componentTitles.presentation,description:'طراحی ارائهٔ معرفی و دمو با قالب ثابت، مشتریان مرتبط، نوشن و گفت‌وگوی هوشمند.',category:'ارائه و دمو',role:roles.presentation,ready:true,previewOnly:false,href:'/presentation/'})
  if(roles.support!=='none')tools.push({id:'support',title:componentTitles.support,description:'نمای مدیریتی خدمات، برنامه‌ریزی، پروژه‌ها و پیگیری نتیجه؛ با داشبورد و معیارهای قابل تنظیم.',category:'مدیریت پشتیبانی',role:roles.support,ready:true,previewOnly:false,href:'/support/',managementHref:canManageTool(user,'support')?'/support/#settings':null})
  if(roles.projectcontrol!=='none')tools.push({id:'projectcontrol',title:componentTitles.projectcontrol,description:'بازسازی مستند تاریخچه، مراحل، انتظارها، رودمپ و تحلیل کنترل پروژه؛ خروجی اکسل قابل ویرایش.',category:'کنترل پروژه',role:roles.projectcontrol,ready:true,previewOnly:false,href:'/projectcontrol/'})
  if(roles.supportsales!=='none')tools.push({id:'supportsales',title:componentTitles.supportsales,description:'ویزارد محاسبهٔ قرارداد سالانهٔ پشتیبانی، تمدید و محصولات و خدمات جدید.',category:'فروش پشتیبانی',role:roles.supportsales,ready:true,previewOnly:false,href:'/support-sales/'})
  if(roles.deploymentplan!=='none')tools.push({id:'deploymentplan',title:componentTitles.deploymentplan,description:'برنامهٔ مشترک کارشناسان استقرار و کانورت؛ تخصیص تعهدات CRM، تأیید مدیر، سوئیچ و آرشیو هفتگی.',category:'برنامه‌ریزی پروژه',role:roles.deploymentplan,ready:true,previewOnly:false,href:'/deploymentplan/',managementHref:canManageTool(user,'deploymentplan')?'/deploymentplan/#settings':null})
  if(roles.development!=='none')tools.push({id:'development',title:componentTitles.development,description:'دریافت کد و راهنما، تحویل تغییرات، ساخت بسته و نصب نسخهٔ ابزارها.',category:'توسعه و انتشار',role:roles.development,ready:true,previewOnly:false,href:'/development/',iconHref:'/development-icon.svg',managementHref:canManageTool(user,'development')?'/development/#permissions':null})
  for(const extension of installedExtensions)if(roles[extension.id]!=='none')tools.push({id:extension.id,title:extension.title,description:extension.description,category:'ابزارهای توسعه‌یافته',role:roles[extension.id],ready:true,previewOnly:false,href:'/'+extension.id+'/',iconHref:'/'+extension.id+'/icon.svg'})
  return {user:{name:user.name,isAdmin:user.isAdmin,avatar:user.avatar||null},tools}
}
