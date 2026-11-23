import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash, randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'

const sourceName = 'combine-source.json'
const submissionName = 'combine-submission.json'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'))

function sourcePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\')) throw Error('Invalid source path')
  const parts = value.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part))) {
    throw Error('Unsafe source path: ' + value)
  }
  const lower = value.toLowerCase()
  if (parts.some(part => /^(node_modules|data|state|logs|backups|sessions|__pycache__|\.git)$/i.test(part)) ||
      parts.some(part => /^\.env(?:\.|$)/i.test(part) && part !== '.env.example') ||
      /\.(sqlite(?:3)?|db|pfx|p12|pem|key|log)$/i.test(lower) ||
      /(^|\/)(accounts\.json|credentials[^/]*|component-installation\.json|component-pending\.json|server-package\.json)$/i.test(lower) ||
      [sourceName, submissionName].includes(lower)) {
    throw Error('Runtime, credential or reserved path excluded: ' + value)
  }
  return value
}

async function checkedPath(root, relative) {
  let target = root
  for (const part of relative.split('/')) {
    target = path.join(target, part)
    try {
      if ((await fs.lstat(target)).isSymbolicLink()) throw Error('Linked path rejected: ' + relative)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return target
}

async function readFile(root, relative) {
  const target = await checkedPath(root, relative)
  if (!(await fs.stat(target)).isFile()) throw Error('Regular file required: ' + relative)
  return fs.readFile(target)
}

async function listFiles(root, relative = '') {
  const result = []
  for (const item of await fs.readdir(path.join(root, relative), {withFileTypes: true})) {
    const file = relative ? relative + '/' + item.name : item.name
    if (item.isSymbolicLink()) throw Error('Linked path rejected: ' + file)
    if (item.isDirectory()) result.push(...await listFiles(root, file))
    else if (item.isFile()) result.push(file)
    else throw Error('Regular file required: ' + file)
  }
  return result.sort()
}

function uniquePaths(files) {
  const seen = new Set()
  for (const file of files) {
    const key = file.toLowerCase()
    if (seen.has(key)) throw Error('Duplicate or case-colliding path: ' + file)
    seen.add(key)
  }
  for (const key of seen) {
    const parts = key.split('/')
    parts.pop()
    while (parts.length) {
      if (seen.has(parts.join('/'))) throw Error('File/directory path collision: ' + key)
      parts.pop()
    }
  }
}

function prefixes(values) {
  if (!Array.isArray(values)) throw Error('additionsUnder must be an array')
  const result = values.map(value => {
    if (typeof value !== 'string' || !value.endsWith('/')) throw Error('Addition prefix must end in /')
    return sourcePath(value.slice(0, -1)) + '/'
  })
  uniquePaths(result)
  return result
}

function mayAdd(manifest, file) {
  return manifest.additionsUnder.some(prefix => file.startsWith(prefix)) || (manifest.additionPatterns || []).some(pattern => {
    const parts = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return new RegExp('^' + parts.join('[^/]*') + '$').test(file)
  })
}

function additionPatterns(values = []) {
  if (!Array.isArray(values)) throw Error('additionPatterns must be an array')
  for (const value of values) {
    if (typeof value !== 'string' || value.split('*').length !== 2 || value.indexOf('*') < value.lastIndexOf('/')) throw Error('Addition pattern supports one filename wildcard')
    sourcePath(value.replace('*', 'addition'))
  }
  uniquePaths(values)
  return values
}

function validateManifest(manifest) {
  if (manifest.schema !== 'combine.source/1' || !/^[a-f0-9-]{36}$/.test(manifest.revision || '') ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(manifest.component || '') ||
      !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files) || !Object.keys(manifest.files).length) {
    throw Error('Invalid source manifest')
  }
  prefixes(manifest.additionsUnder)
  additionPatterns(manifest.additionPatterns)
  for (const [file, entry] of Object.entries(manifest.files)) {
    sourcePath(file)
    if (!entry || !['editable', 'reference'].includes(entry.access) || !validHash(entry.sha256)) throw Error('Invalid source entry: ' + file)
  }
  uniquePaths(Object.keys(manifest.files))
}

async function newDirectory(output) {
  const absolute = path.resolve(output)
  const root = path.parse(absolute).root
  await checkedPath(root, path.relative(root, absolute).split(path.sep).join('/'))
  await fs.mkdir(path.dirname(absolute), {recursive: true})
  await fs.mkdir(absolute)
  return absolute
}

async function writeFile(root, file, bytes) {
  const target = await checkedPath(root, file)
  await fs.mkdir(path.dirname(target), {recursive: true})
  await fs.writeFile(target, bytes, {flag: 'wx'})
}

function inside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}

export async function exportSource({project, selectionFile, output}) {
  const root = await fs.realpath(project)
  const selection = await json(selectionFile)
  if (selection.schema !== 1 || !Array.isArray(selection.files) || !selection.files.length) throw Error('Invalid reviewed source selection')
  const manifest = {
    schema: 'combine.source/1', revision: randomUUID(), component: selection.component,
    sourceVersion: selection.sourceVersion ?? null, coreApi: selection.coreApi ?? null,
    createdAt: new Date().toISOString(), additionsUnder: prefixes(selection.additionsUnder || []), additionPatterns: additionPatterns(selection.additionPatterns), files: Object.create(null)
  }
  uniquePaths(selection.files.map(entry => sourcePath(entry.path)))
  const contents = new Map()
  for (const entry of selection.files) {
    if (!['editable', 'reference'].includes(entry.access)) throw Error('Invalid source access: ' + entry.path)
    const bytes = await readFile(root, entry.path)
    contents.set(entry.path, bytes)
    manifest.files[entry.path] = {access: entry.access, sha256: digest(bytes)}
  }
  validateManifest(manifest)
  const destination = path.resolve(output)
  for (const file of contents.keys()) {
    if (inside(destination, path.join(root, file))) throw Error('Output overlaps selected source')
  }
  await newDirectory(destination)
  for (const [file, bytes] of contents) await writeFile(destination, file, bytes)
  await writeFile(destination, sourceName, JSON.stringify(manifest, null, 2) + '\n')
  return {directory: destination, revision: manifest.revision, files: contents.size, kind: 'development-source'}
}

export async function submitChanges({workspace, output, notesFile, deletionsFile, versionsFile}) {
  const root = await fs.realpath(workspace)
  if (inside(root, path.resolve(output)) || inside(path.resolve(output), root)) throw Error('Submission output must be separate from workspace')
  const manifestBytes = await readFile(root, sourceName)
  const manifest = JSON.parse(manifestBytes)
  validateManifest(manifest)
  const allFiles = (await listFiles(root)).filter(file => file !== sourceName)
  uniquePaths(allFiles)
  const deletions = deletionsFile ? await json(deletionsFile) : []
  if (!Array.isArray(deletions)) throw Error('Deletions must be an array of explicit paths')
  deletions.forEach(sourcePath)
  uniquePaths(deletions)
  const deleted = new Set(deletions)
  const present = new Set(allFiles)
  const changes = []
  const contents = new Map()

  for (const [file, entry] of Object.entries(manifest.files)) {
    if (!present.has(file)) {
      if (entry.access !== 'editable' || !deleted.has(file)) throw Error('Missing file requires an explicit editable deletion: ' + file)
      changes.push({path: file, action: 'deleted', sha256: null})
    } else if (deleted.has(file)) throw Error('Deleted file is still present: ' + file)
  }
  for (const file of deletions) {
    if (!Object.hasOwn(manifest.files, file)) throw Error('Deletion is outside baseline: ' + file)
  }
  for (const file of allFiles) {
    sourcePath(file)
    const base = Object.hasOwn(manifest.files, file) ? manifest.files[file] : undefined
    if (!base && !mayAdd(manifest, file)) throw Error('New file is outside allowed additions: ' + file)
    const bytes = await readFile(root, file)
    const sha256 = digest(bytes)
    if (base?.sha256 === sha256) continue
    if (base?.access === 'reference') throw Error('Reference file was modified: ' + file)
    changes.push({path: file, action: base ? 'modified' : 'added', sha256})
    contents.set(file, bytes)
  }
  if (!changes.length) throw Error('No source changes to submit')
  const notes = notesFile ? await fs.readFile(notesFile, 'utf8') : ''
  const versions = versionsFile ? await json(versionsFile) : {}
  if (!versions || typeof versions !== 'object' || Array.isArray(versions) || Object.entries(versions).some(([id, version]) => ![manifest.component,'core','home'].includes(id) || !/^\d{1,9}\.\d{1,9}\.\d{1,9}(?:\.\d{1,9})?$/.test(version))) throw Error('Explicit component versions are required; preserve the user labels')
  if (notes.length > 100000) throw Error('Change notes exceed 100000 characters')
  const submission = {
    schema: 'combine.submission/1', component: manifest.component,
    baseRevision: manifest.revision, baseManifestSha256: digest(manifestBytes),
    createdAt: new Date().toISOString(), notes, versions,
    changes: changes.sort((left, right) => left.path.localeCompare(right.path))
  }
  const destination = await newDirectory(output)
  for (const [file, bytes] of contents) await writeFile(destination, 'files/' + file, bytes)
  await writeFile(destination, submissionName, JSON.stringify(submission, null, 2) + '\n')
  return {directory: destination, baseRevision: manifest.revision, changes: changes.length, kind: 'development-submission'}
}

export async function checkSubmission({baseline, submission}) {
  const baseRoot = await fs.realpath(baseline)
  const submissionRoot = await fs.realpath(submission)
  const manifestBytes = await readFile(baseRoot, sourceName)
  const manifest = JSON.parse(manifestBytes)
  validateManifest(manifest)
  for (const [file, entry] of Object.entries(manifest.files)) {
    if (digest(await readFile(baseRoot, file)) !== entry.sha256) throw Error('Trusted baseline was modified: ' + file)
  }
  const received = await json(await checkedPath(submissionRoot, submissionName))
  if (received.schema !== 'combine.submission/1' || received.component !== manifest.component ||
      received.baseRevision !== manifest.revision || received.baseManifestSha256 !== digest(manifestBytes) ||
      !Array.isArray(received.changes) || !received.changes.length) {
    throw Error('Submission does not match the trusted baseline')
  }
  const expectedFiles = [submissionName]
  uniquePaths(received.changes.map(change => sourcePath(change.path)))
  for (const change of received.changes) {
    const entry = Object.hasOwn(manifest.files, change.path) ? manifest.files[change.path] : undefined
    if (change.action === 'deleted') {
      if (entry?.access !== 'editable' || change.sha256 !== null) throw Error('Invalid deletion: ' + change.path)
    } else if (['added', 'modified'].includes(change.action)) {
      if (change.action === 'modified' ? entry?.access !== 'editable' : Boolean(entry) || !mayAdd(manifest, change.path)) {
        throw Error('Change crosses source boundary: ' + change.path)
      }
      if (!validHash(change.sha256) || change.sha256 === entry?.sha256) throw Error('Invalid change digest: ' + change.path)
      const payloadPath = 'files/' + change.path
      if (digest(await readFile(submissionRoot, payloadPath)) !== change.sha256) throw Error('Changed file digest mismatch: ' + change.path)
      expectedFiles.push(payloadPath)
    } else throw Error('Invalid change action')
  }
  const actualFiles = await listFiles(submissionRoot)
  uniquePaths(actualFiles)
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles.sort())) throw Error('Unexpected or missing submission files')
  return {
    ok: true, component: manifest.component, baseRevision: manifest.revision,
    changes: received.changes, scope: 'integrity-and-source-boundaries'
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const action = process.argv[2]
    const options = {}
    const allowed = {
      export: ['--project', '--selection', '--output'],
      submit: ['--workspace', '--output', '--notes', '--deletions', '--versions'],
      check: ['--baseline', '--submission']
    }
    if (!allowed[action]) throw Error('Actions: export, submit, check')
    for (let index = 3; index < process.argv.length; index += 2) {
      const key = process.argv[index]
      const value = process.argv[index + 1]
      if (!allowed[action].includes(key) || !value || Object.hasOwn(options, key)) throw Error('Invalid or duplicate option')
      options[key] = value
    }
    const required = action === 'export' ? ['--project', '--selection', '--output'] : action === 'submit' ? ['--workspace', '--output'] : ['--baseline', '--submission']
    if (required.some(key => !options[key])) throw Error('Required options: ' + required.join(' '))
    let result
    if (action === 'export') result = await exportSource({project: options['--project'], selectionFile: options['--selection'], output: options['--output']})
    if (action === 'submit') result = await submitChanges({workspace: options['--workspace'], output: options['--output'], notesFile: options['--notes'], deletionsFile: options['--deletions'], versionsFile:options['--versions']})
    if (action === 'check') result = await checkSubmission({baseline: options['--baseline'], submission: options['--submission']})
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
