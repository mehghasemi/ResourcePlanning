export const combinedSource='all'
export const combinedSources=['notion','crm','model']
export const supportsFileAttachments=source=>['model','all'].includes(source)
export function canUseAllSources(user){return user?.enabled!==false&&combinedSources.every(source=>user?.access?.includes(source))&&['user','admin'].includes(user?.toolRoles?.reports)}
export function hasChatSource(user,source){return source==='all'?canUseAllSources(user):['notion','crm','model'].includes(source)&&Boolean(user?.access?.includes(source))}
