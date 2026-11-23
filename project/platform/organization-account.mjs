import {installedExtensions} from './extension-registry.mjs'
import {canUseDashboardCrm} from './dashboard-access.mjs'
import {canUsePricingCrm} from './pricing-access.mjs'
import {canUseMarketCrm} from './market-access.mjs'
import {canUseCoordinationCrm} from './coordination-access.mjs'
import {toolRoles} from './platform-access.mjs'
export function organizationGrants(user){return {...Object.fromEntries(installedExtensions.filter(tool=>tool.crm==='organization-read').map(tool=>[tool.id,Boolean(user?.enabled&&toolRoles(user)[tool.id]!=='none')])),deploymentplan:Boolean(user?.enabled&&toolRoles(user).deploymentplan!=='none'),supportsales:Boolean(user?.enabled&&toolRoles(user).supportsales!=='none'),projectcontrol:Boolean(user?.enabled&&toolRoles(user).projectcontrol!=='none'),support:Boolean(user?.enabled&&toolRoles(user).support!=='none'),presentation:Boolean(user?.enabled&&toolRoles(user).presentation!=='none'),marketing:Boolean(user?.enabled&&toolRoles(user).marketing!=='none'),coordination:canUseCoordinationCrm(user),crm:canUseDashboardCrm(user),pricing:canUsePricingCrm(user),market:canUseMarketCrm(user),chat:Boolean(user?.enabled&&toolRoles(user).chat!=='none'&&user.access?.includes('crm'))}}
export const canConnectOrganizationCrm=user=>Object.values(organizationGrants(user)).some(Boolean)
// Projection only: legacy encrypted connections and their indexes are untouched.
export function organizationProjection(user){
 if(!user?.organization)return user;
 const grants=organizationGrants(user),shared=user.organization,connection=!shared.disabled&&shared.crm?.userId&&!shared.crm.invalidated?shared.crm:null;
 for(const [tool,field]of Object.entries({crm:'dashboardCrm',pricing:'pricingCrm',market:'marketCrm',chat:'crm'})){
  const previous=user[field];
  if(tool==='market'&&user.marketCrmOverride){user[field]=grants.market&&previous?.userId&&!previous.invalidated?previous:null;continue;}
  user[field]=grants[tool]&&connection?(previous?.username===connection.username&&previous?.password===connection.password&&previous?.userId===connection.userId&&!previous.invalidated?previous:connection):null;
 }
 return user;
}
export function organizationCalendar(user){const shared=user?.organization;return user?.enabled&&shared&&!shared.disabled&&shared.calendar?.state==='connected'?{username:shared.username,password:shared.password,...(shared.calendar.additionalCalendars?.length?{additionalCalendars:shared.calendar.additionalCalendars}:{})}:null}
export function organizationSummary(user){const shared=user.organization;return {saved:Boolean(shared&&!shared.disabled),username:shared?.username||'',crmAllowed:canConnectOrganizationCrm(user),grants:organizationGrants(user),crm:shared?.disabled?{state:'disconnected'}:shared?.crmStatus||{state:'setup'},calendar:shared?.disabled?{state:'disconnected'}:shared?.calendar||{state:'setup'}}}
