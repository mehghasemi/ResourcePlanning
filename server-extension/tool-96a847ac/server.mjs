import path from 'node:path'
import {createWorkspaceStore} from '../../../workspace-store.mjs'
import {createDeploymentplanHttp} from './deploymentplan-http.mjs'

export function createTool({root,store,send,bodyJson,readerFor}) {
  let service, scope, timer
  function initialize(user) {
    if (!user?.scope) throw Object.assign(Error('دامنهٔ حساب مشخص نیست.'), {status: 401})
    if (service && scope !== user.scope) throw Error('دامنهٔ برنامه تغییر کرده است.')
    if (!service) {
      scope = user.scope
      const repository = createWorkspaceStore({scope})
      service = createDeploymentplanHttp({root: path.resolve(root, '../../..'),store,repository,send,bodyJson,readerFor})
      timer = setInterval(() => service.tick().catch(error => console.error('ResourcePlanning tick:', error)), 60_000)
      timer.unref?.()
    }
    return service
  }
  return {async handle(req,res,url,user) {
    if (!url.pathname.startsWith('/api/tool-96a847ac/')) return false
    return initialize(user).handle(req,res,url,user)
  }}
}
