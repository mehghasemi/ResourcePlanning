import {toolRoles,canManageTool,requireTool} from './platform-access.mjs'
export function canUsePricingCrm(user){return Boolean(user?.enabled&&toolRoles(user).pricing!=='none'&&(typeof user.pricingCrmAccess==='boolean'?user.pricingCrmAccess:canManageTool(user,'pricing')))}
export function requirePricingCrm(user){requireTool(user,'pricing');if(!canUsePricingCrm(user))throw Object.assign(new Error('دسترسی CRM محاسبه‌گر ندارید؛ حالت دستی قابل استفاده است.'),{status:403})}
