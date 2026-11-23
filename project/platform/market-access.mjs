import {canManageTool,requireTool} from './platform-access.mjs'
export const marketCrmPermission=user=>typeof user?.marketCrmAccess==='boolean'?user.marketCrmAccess:canManageTool(user,'market')
export function canUseMarketCrm(user){try{requireTool(user,'market');return marketCrmPermission(user)}catch{return false}}
export function requireMarketCrm(user){requireTool(user,'market');if(!canUseMarketCrm(user))throw Object.assign(new Error('مجوز CRM فقط‌خواندنی تحلیل بازار ندارید؛ از مدیر ابزار درخواست دسترسی کنید.'),{status:403})}
