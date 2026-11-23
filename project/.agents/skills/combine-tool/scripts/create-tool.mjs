import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = {}
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  const value = process.argv[index + 1]
  if (!['--project', '--id', '--title', '--output', '--config', '--icon', '--crm'].includes(key) || !value || Object.hasOwn(options, key)) {
    throw Error('Use --project ROOT --id ID --title TITLE --output NEW_DIR [--config JSON] [--icon SYMBOL] [--crm none|organization-read]')
  }
  options[key] = value
}
for (const key of ['--project', '--id', '--title', '--output']) {
  if (!options[key]) throw Error(key + ' is required')
}
const id = options['--id']
if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(id)) {
  throw Error('Use a safe lowercase tool ID')
}
const crm = options['--crm'] || 'none'
if (!['none', 'organization-read'].includes(crm)) throw Error('Unsupported CRM template mode')
const project = await fs.realpath(options['--project'])
const output = path.resolve(options['--output'])
const relative = path.relative(project, output).split(path.sep)
if (!['outputs', 'work'].includes(relative[0]) || relative.length < 2 || relative.includes('..')) {
  throw Error('Output must be a new directory inside project outputs/ or work/')
}
let ancestor = project
for (const part of relative) {
  ancestor = path.join(ancestor, part)
  try {
    if ((await fs.lstat(ancestor)).isSymbolicLink()) throw Error('Linked output path rejected')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
await fs.mkdir(path.dirname(output), {recursive: true})
await fs.mkdir(output)

const arguments_ = [
  path.join(skill, '../combine-ui/scripts/scaffold.mjs'),
  '--project', project, '--id', id, '--title', options['--title'],
  '--output', path.join(output, 'ui')
]
for (const key of ['--config', '--icon']) {
  if (options[key]) arguments_.push(key, options[key])
}
const generated = spawnSync(process.execPath, arguments_, {encoding: 'utf8', windowsHide: true})
if (generated.error) throw generated.error
if (generated.status !== 0) throw Error(generated.stderr || 'UI scaffold failed')

const ui = JSON.parse(await fs.readFile(path.join(output, 'ui/tool.json'), 'utf8'))
const manifest = JSON.parse(await fs.readFile(path.join(skill, 'assets/tool.manifest.json'), 'utf8'))
Object.assign(manifest, {
  id, title: ui.title, description: ui.description,
  pageRoute: '/' + id + '/', apiPrefix: '/api/' + id + '/',
  icon: 'public/' + id + '-icon.svg', entry: id + '-http.mjs',
  files: [id + '-http.mjs', 'public/' + id + '.html', 'public/' + id + '-icon.svg']
})
manifest.crm.mode = crm
manifest.crm.operations = crm === 'organization-read' ? ['read'] : []

await fs.mkdir(path.join(output, 'integration'))
const templates = [['tool-http.mjs', id + '-http.mjs']]
if (crm === 'organization-read') {
  templates.push(['tool-crm.mjs', id + '-crm.mjs'])
  manifest.files.push(id + '-crm.mjs')
}
for (const [template, target] of templates) {
  const source = await fs.readFile(path.join(skill, 'assets', template), 'utf8')
  await fs.writeFile(path.join(output, 'integration', target), source.replaceAll('__TOOL_ID__', id), {flag: 'wx'})
}
const sprite = await fs.readFile(path.join(project, 'design-system/icons.svg'), 'utf8')
const symbol = [...sprite.matchAll(/<symbol id="([^"]+)" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/g)]
  .find(match => match[1] === ui.icon)
if (!symbol) throw Error('Tool icon symbol could not be exported')
const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + symbol[2] + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + symbol[3] + '</svg>\n'
await fs.writeFile(path.join(output, 'integration', id + '-icon.svg'), icon, {flag: 'wx'})
await fs.writeFile(path.join(output, 'tool.manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'})
await fs.copyFile(path.join(skill, 'assets/requirements-fa.md'), path.join(output, 'requirements-fa.md'), fs.constants.COPYFILE_EXCL)

const instructions = `# شروع توسعهٔ ${ui.title}

فایل ui/index.html را برای پیش‌نمایش باز کنید. منطق اختصاصی را در ui/app.js بسازید و نیازمندی‌ها را در requirements-fa.md ثبت کنید.

برای اتصال واقعی، فایل‌های integration را طبق tool-contract.md در combine-tool به platform منتقل کنید. فایل آیکن در public قرار می‌گیرد. HTML و دارایی‌های رابط نیز باید با مسیرهای میزبان تطبیق داده شوند. فایل‌های ui/shared کپی قابل‌انتقال پیش‌نمایش هستند و در اتصال واقعی از مسیر مشترک مصوب میزبان سرو می‌شوند.

ثبت ابزار، نقش‌ها، حفاظت HTML و API، کارت خانه، موجودی فایل‌ها و بسته‌سازی را طبق combine-ui/references/integration.md تکمیل کنید. فهرست files در tool.manifest.json را با فایل‌های نهایی تطبیق بدهید.

حالت CRM این قالب ${crm} است. در حالت organization-read، grant ابزار را در organization-account.mjs ثبت و helper خواندن را به عملیات تجاری مشخص وصل کنید. اتصال از حساب سازمانی مشترک خوانده می‌شود. روش اتصال در combine-tool/references/crm-integration.md است.

نسخهٔ محصول هنگام ساخت انتشار از کاربر گرفته می‌شود. این پوشه قالب توسعه است و ثبت در سرور پس از ادغام انجام می‌شود.
`
await fs.writeFile(path.join(output, 'START-FA.md'), instructions, {flag: 'wx'})
console.log(JSON.stringify({output, tool: id, crm, registered: false, installed: false}, null, 2))
