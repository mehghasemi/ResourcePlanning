import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const reserved = new Set(['constructor','prototype','fonts','combine-ui','workspace','dashboard','auth','account','knowledge','sync','health','status','exports','conversations','files','personal-files','history','user','instructions','widget-runtime','api','home','login','logout','admin','platform','development','extensions','assets','public','market','pricing','crm','crm-dashboard','chat','tariff','reports','contracts','coordination','marketing','presentation','support','projectcontrol','supportsales','support-sales','deploymentplan'])
export function validateExtensionManifest(value) {
  if (!value || value.schema !== 'combine.extension/1' || typeof value.id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value.id) || reserved.has(value.id) || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(value.id) || value.id.length > 60 || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100 || typeof value.description !== 'string' || value.description.length > 1000 || value.entry !== 'server.mjs' || value.page !== 'index.html' || value.icon !== 'icon.svg' || !['none','organization-read'].includes(value.crm)) {
    throw Object.assign(Error('شناسنامهٔ ابزار جدید معتبر نیست یا شناسه رزرو شده است.'), {status: 400})
  }
  const assets=value.assets??['index.html','app.js','icon.svg','shared/']
  if(!Array.isArray(assets)||assets.length>3000||assets.some(file=>typeof file!=='string'||!file||file.includes('\\')||file.split('/').filter((part,index,all)=>index!==all.length-1||part).some(part=>!part||part==='.'||part==='..'||part.startsWith('.')||/[<>:"|?*\x00-\x1f]/.test(part))||file==='server.mjs'||file==='tool.manifest.json')||new Set(assets).size!==assets.length)throw Error('Invalid extension asset inventory')
  return {schema: value.schema, id: value.id, title: value.title.trim(), description: value.description, entry: value.entry, page: value.page, icon: value.icon, crm: value.crm,assets}
}
export function readExtensions(root) {
  const directory = path.join(root, 'tools/extensions')
  if (!fs.existsSync(directory)) return []
  if (fs.lstatSync(path.join(root, 'tools')).isSymbolicLink() || fs.lstatSync(directory).isSymbolicLink()) throw Error('Linked extension registry rejected')
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    if (entry.isSymbolicLink()) throw Error('Linked extension rejected')
    if (!entry.isDirectory()) return []
    const file = path.join(directory, entry.name, 'tool.manifest.json')
    if (!fs.existsSync(file)) return []
    if (fs.lstatSync(file).isSymbolicLink()) throw Error('Linked extension manifest rejected')
    const manifest = validateExtensionManifest(JSON.parse(fs.readFileSync(file, 'utf8')))
    if (manifest.id !== entry.name) throw Error('Extension directory mismatch')
    return [manifest]
  })
}
export const installedExtensions = readExtensions(path.dirname(fileURLToPath(import.meta.url)))
export function extensionFile(id, file) {
  return file.startsWith('tools/extensions/' + id + '/') && !file.startsWith('tools/extensions/'+id+'/shared/') && !file.split('/').some(part => part.startsWith('.') || ['data','state','logs','node_modules'].includes(part))
}
