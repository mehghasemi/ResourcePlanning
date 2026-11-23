import {toolRoles,canManageTool,requireTool} from './platform-access.mjs'
export const dashboardCrmPermission=user=>typeof user.dashboardCrmAccess==='boolean'?user.dashboardCrmAccess:canManageTool(user,'crm')
export const canUseDashboardCrm=user=>Boolean(user?.enabled&&toolRoles(user).crm!=='none'&&dashboardCrmPermission(user))
export function requireDashboardCrm(user){requireTool(user,'crm');if(!canUseDashboardCrm(user))throw Object.assign(new Error('مجوز اتصال CRM داشبورد ندارید؛ از مدیر داشبورد درخواست دسترسی کنید.'),{status:403})}
