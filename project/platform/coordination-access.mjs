import {requireTool,toolRoles} from './platform-access.mjs'
export const canUseCoordinationCrm=user=>Boolean(user?.enabled&&toolRoles(user).coordination!=='none')
export function coordinationConnection(user){
 requireTool(user,'coordination')
 const connection=!user.organization?.disabled&&user.organization?.crm
 if(!connection?.userId||connection.invalidated)throw Object.assign(new Error('ابتدا اتصال یکپارچه CRM را در تنظیمات حساب سازمانی تأیید کنید.'),{status:428})
 return connection
}
