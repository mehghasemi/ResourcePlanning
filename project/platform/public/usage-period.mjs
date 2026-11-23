const tz='Asia/Tehran',formatter=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:tz}),persian=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric',timeZone:tz})
export const dayOf=now=>formatter.format(new Date(now))
export const gregorianMonthOf=now=>dayOf(now).slice(0,7)
export function persianParts(now){return Object.fromEntries(persian.formatToParts(new Date(now)).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,Number(p.value)]))}
export const monthOf=now=>{const p=persianParts(now);return p.year+'-'+String(p.month).padStart(2,'0')}
const boundsCache=new Map()
export function billingMonthBounds(now=new Date()){
  const period=monthOf(now);if(boundsCache.has(period))return boundsCache.get(period)
  const p=persianParts(now),start=Date.parse(dayOf(now)+'T12:00:00Z')-(p.day-1)*86400000;let next
  for(let i=1;i<=35;i++){const candidate=new Date(start+i*86400000);if(monthOf(candidate)!==period){next=candidate;break}}
  if(!next)throw new Error('Calendar month boundary unavailable')
  const result={period,from:new Date(start).toISOString().slice(0,10),to:new Date(next.getTime()-86400000).toISOString().slice(0,10),nextDay:next.toISOString().slice(0,10)}
  if(boundsCache.size>24)boundsCache.clear();boundsCache.set(period,result);return result
}
export function nextMonthlyReset(now=new Date()){
  const target=Date.parse(billingMonthBounds(now).nextDay+'T00:00:00Z'),partsFormatter=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:tz});let guess=target
  for(let i=0;i<4;i++){const parts=Object.fromEntries(partsFormatter.formatToParts(new Date(guess)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)])),local=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second),delta=target-local;if(!delta)break;guess+=delta}
  return new Date(guess).toISOString()
}
export function persianDateLabel(iso){const p=persianParts(iso+'T12:00:00Z'),raw=p.year+'/'+String(p.month).padStart(2,'0')+'/'+String(p.day).padStart(2,'0');return raw.replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)])}
export function persianDateToISO(value){
  const normalized=String(value).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))),match=/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(normalized)
  if(match){const [year,month,day]=match.slice(1).map(Number);if(year>=1300&&year<=1600&&month>=1&&month<=12&&day>=1&&day<=31){const base=Date.UTC(year+621,2,18,12);for(let offset=0;offset<372;offset++){const date=new Date(base+offset*86400000),p=persianParts(date);if(p.year===year&&p.month===month&&p.day===day)return date.toISOString().slice(0,10)}}}
  throw Object.assign(new Error('تاریخ شمسی معتبر نیست؛ مانند ۱۴۰۵/۰۷/۰۱ وارد کنید.'),{status:400})
}
export function usageRange({from,to}={},now=new Date()){
  const end=to||dayOf(now),start=from||billingMonthBounds(now).from,valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s
  if(!valid(start)||!valid(end)||start>end)throw Object.assign(new Error('بازهٔ تاریخ معتبر نیست.'),{status:400})
  const days=Math.round((Date.parse(end)-Date.parse(start))/86400000)+1
  if(days>366)throw Object.assign(new Error('حداکثر بازهٔ گزارش ۳۶۶ روز است.'),{status:400})
  return {from:start,to:end,days}
}
