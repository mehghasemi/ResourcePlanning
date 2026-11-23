import {createHash} from 'node:crypto'
import {requireTool} from './platform-access.mjs'
import {organizationGrants} from './organization-account.mjs'
import {crmUserGet} from './crm-user.mjs'

export function createOrganizationReader({store, toolId, read = crmUserGet}) {
  const fail = (message, status) => Object.assign(Error(message), {status})
  const fingerprint = user => createHash('sha256').update(JSON.stringify([user.organization?.id,user.organization?.disabled,user.organization?.crm])).digest('hex')
  return async function readerFor(user) {
    async function fresh() {
      const current = user?.id ? await store.get(user.id) : null
      if (!current?.enabled || current.revision !== user.revision) throw fail('نشست یا دسترسی تغییر کرده است.', 401)
      requireTool(current, toolId)
      if (!organizationGrants(current)[toolId]) throw fail('مجوز اتصال CRM این ابزار فعال نیست.', 403)
      const connection = current.organization?.crm
      if (current.organization?.disabled || !connection?.userId || connection.invalidated) throw fail('حساب سازمانی CRM را از تنظیمات مشترک متصل کنید.', 428)
      return {user: current, connection}
    }
    const initial = await fresh(), expected = fingerprint(initial.user)
    async function unchanged() {
      const current = await fresh()
      if (fingerprint(current.user) !== expected) throw fail('اتصال حساب سازمانی تغییر کرده است.', 409)
      return current
    }
    const identity = await read(initial.connection, 'WhoAmI')
    if (identity.UserId?.toLowerCase() !== initial.connection.userId.toLowerCase()) throw fail('هویت CRM با حساب سازمانی فعلی یکسان نیست.', 428)
    await unchanged()
    return async (resource, params = {}) => {
      const current = await unchanged(), result = await read(current.connection, resource, params)
      await unchanged()
      return result
    }
  }
}
