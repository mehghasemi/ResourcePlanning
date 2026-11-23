import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'

const skill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = {}
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  const value = process.argv[index + 1]
  if (!['--project', '--output'].includes(key) || !value || Object.hasOwn(options, key)) {
    throw Error('Use --project ROOT --output NEW_DIRECTORY')
  }
  options[key] = value
}
if (!options['--project'] || !options['--output']) throw Error('project and output are required')
const project = await fs.realpath(options['--project'])
const output = path.resolve(options['--output'])
const relative = path.relative(project, output).split(path.sep)
if (!['outputs', 'work'].includes(relative[0]) || relative.length < 2 || relative.includes('..')) {
  throw Error('Output must be a new directory inside project outputs/ or work/')
}

const inventory = new Map()
async function include(source, destination) {
  const entry = await fs.lstat(source)
  if (entry.isSymbolicLink()) throw Error('Linked kit source rejected: ' + source)
  if (entry.isDirectory()) {
    for (const name of await fs.readdir(source)) await include(path.join(source, name), destination + '/' + name)
  } else if (entry.isFile()) inventory.set(destination, await fs.readFile(source))
  else throw Error('Regular kit source required')
}
const skills = ['combine-tool', 'combine-ui', 'combine-release']
for (const name of skills) await include(path.join(skill, '..', name), '.agents/skills/' + name)
for (const name of ['STANDARD.md', 'tokens.css', 'components.css', 'icons.svg']) {
  await include(path.join(project, 'design-system', name), 'design-system/' + name)
}
for (const name of ['Dana-Regular.woff2', 'Dana-Bold.woff2']) {
  await include(path.join(project, 'platform/public/fonts', name), 'platform/public/fonts/' + name)
}
await include(path.join(skill, 'assets/DEVELOPMENT-GUIDE-FA.md'), 'DEVELOPMENT-GUIDE-FA.md')
await include(path.join(skill, 'assets/kit-AGENTS.md'), 'AGENTS.md')

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
const hashes = {}
for (const [file, bytes] of inventory) {
  const target = path.join(output, file)
  await fs.mkdir(path.dirname(target), {recursive: true})
  await fs.writeFile(target, bytes, {flag: 'wx'})
  hashes[file] = createHash('sha256').update(bytes).digest('hex')
}
const manifest = {
  schema: 'combine.development-kit/1', createdAt: new Date().toISOString(),
  requires: {node: '>=20.6'}, skills, files: hashes
}
await fs.writeFile(path.join(output, 'combine-kit.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'})
console.log(JSON.stringify({directory: output, files: inventory.size + 1, kind: 'development-kit'}, null, 2))
