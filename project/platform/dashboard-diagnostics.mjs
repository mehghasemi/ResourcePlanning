// Only fixed messages and explicitly selected numeric fields may leave the worker.
const messages={
 output_limit:'حجم خروجی از سقف ۳۲ مگابایت عبور کرد.',
 chunk_limit:'حجم یک قطعه از سقف ۸ مگابایت عبور کرد.',
 chunk_invalid:'قطعهٔ ایندکس یا نشانگر ادامه معتبر نبود؛ دادهٔ سالم قبلی حفظ شد.',
 response_limit:'حجم پاسخ CRM از سقف مجاز عبور کرد.',
 worker_timeout:'مهلت ده‌دقیقه‌ای پردازش تمام شد.',
 timeout:'مهلت پاسخ‌گویی CRM تمام شد.',
 limit:'سقف زمان، تعداد صفحه یا تعداد ردیف CRM پر شد.',
 invalid_json:'خروجی پردازش JSON معتبر نبود.',
 worker_exit:'پردازش گزارش پیش از تکمیل متوقف شد.',
 worker_start:'پردازش گزارش اجرا نشد.',
 crm_http:'CRM درخواست گزارش را رد کرد.',
 invalid_target:'نشانی ادامهٔ دریافت CRM معتبر نبود.',
 identity_mismatch:'هویت اتصال CRM با حساب تأییدشده مطابقت نداشت.',
 worker_failure:'ساخت گزارش با خطای پردازش مواجه شد.',
 read_error:'خواندن پاسخ CRM ناموفق بود.'
};
const entities=new Set(['identity','complete','accounts','annotations','brd_receipts','incidents','invoicedetails','invoices','leads','opportunities','opportunityproducts','quotedetails','quotecloses','quotes','salesorderdetails','salesorders','serviceappointments','tasks']);
export function dashboardDiagnostic(code,details={}){
 const diagnostic={code:Object.hasOwn(messages,code)?code:'worker_failure'};
 for(const key of ['bytes','limitBytes','elapsedMs','httpStatus','stage','total','page','rows','line','exitCode']){
  if(Number.isSafeInteger(details[key])&&details[key]>=0&&details[key]<=Number.MAX_SAFE_INTEGER)diagnostic[key]=details[key];
 }
 if(entities.has(details.entity))diagnostic.entity=details.entity;
 // Exception names are selected in PowerShell; no exception message or CRM body is copied.
 if(['RuntimeException','MethodInvocationException','PropertyNotFoundException','ArgumentException','InvalidOperationException','WebException','Other'].includes(details.exceptionType))diagnostic.exceptionType=details.exceptionType;
 return diagnostic;
}
export function dashboardFailure(code,details={},status=502){
 const diagnostic=dashboardDiagnostic(code,details);
 return Object.assign(new Error(messages[diagnostic.code]),{status,diagnostic});
}
export function dashboardSectionError(error){
 const diagnostic=dashboardDiagnostic(error?.diagnostic?.code,error?.diagnostic);
 return {status:[401,403,428,502,503].includes(error?.status)?error.status:502,message:messages[diagnostic.code],diagnostic};
}
