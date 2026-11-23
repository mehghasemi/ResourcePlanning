import fs from 'node:fs/promises'
import path from 'node:path'
import {requireTool} from './platform-access.mjs'
import {componentVersion} from './component-status.mjs'

const toolId = '__TOOL_ID__'
const pageRoute = '/' + toolId + '/'
const apiPrefix = '/api/' + toolId + '/'

// Install this file in platform after completing the integration checklist.
export function createToolHttp({root, store, send}) {
  return {
    async handle(req, res, url, user) {
      const isPage = [pageRoute.slice(0, -1), pageRoute, '/' + toolId + '.html'].includes(url.pathname)
      if (!isPage && !url.pathname.startsWith(apiPrefix)) return false

      const current = user?.id ? await store.get(user.id) : null
      if (!current?.enabled || current.revision !== user.revision) {
        throw Object.assign(new Error('نشست یا دسترسی تغییر کرده است.'), {status: 401})
      }
      requireTool(current, toolId)
      res.setHeader('Cache-Control', 'no-store')

      if (req.method === 'GET' && isPage) {
        const html = await fs.readFile(path.join(root, 'public', toolId + '.html'))
        send(res, 200, html, 'text/html; charset=utf-8')
        return true
      }
      if (req.method === 'GET' && url.pathname === apiPrefix + 'info') {
        send(res, 200, {
          name: current.name,
          version: await componentVersion(root, toolId)
        })
        return true
      }
      throw Object.assign(new Error('مسیر ابزار پیدا نشد.'), {status: 404})
    }
  }
}
