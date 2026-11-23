import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {exportSource, submitChanges, checkSubmission} from './development-bundle.mjs'

async function fixture(context) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'combine-source-test-'))
  context.after(async () => {
    const target = await fs.realpath(directory)
    assert.equal(path.dirname(target), await fs.realpath(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('combine-source-test-'))
    await fs.rm(target, {recursive: true, force: true})
  })
  const project = path.join(directory, 'project')
  await fs.mkdir(path.join(project, 'platform/tools/example'), {recursive: true})
  await fs.writeFile(path.join(project, 'platform/tools/example/app.js'), 'export const value = 1\n')
  await fs.writeFile(path.join(project, 'platform/shared.mjs'), 'export const api = 1\n')
  const selection = {
    schema: 1, component: 'example',
    files: [
      {path: 'platform/tools/example/app.js', access: 'editable'},
      {path: 'platform/shared.mjs', access: 'reference'}
    ],
    additionsUnder: ['platform/tools/example/']
  }
  const selectionFile = path.join(directory, 'selection.json')
  await fs.writeFile(selectionFile, JSON.stringify(selection))
  const baseline = path.join(directory, 'original')
  await exportSource({project, selectionFile, output: baseline})
  const workspace = path.join(directory, 'developer')
  await fs.cp(baseline, workspace, {recursive: true})
  return {directory, project, selection, selectionFile, baseline, workspace, output: path.join(directory, 'submission')}
}

test('modified and new files retain their trusted base and code is checked without execution', async context => {
  const item = await fixture(context)
  await fs.writeFile(path.join(item.workspace, 'platform/tools/example/app.js'), 'throw Error("must not execute")\n')
  await fs.writeFile(path.join(item.workspace, 'platform/tools/example/new.js'), 'export const added = true\n')
  await submitChanges(item)
  const result = await checkSubmission({baseline: item.baseline, submission: item.output})
  assert.deepEqual(result.changes.map(change => change.action).sort(), ['added', 'modified'])
  assert.equal(await fs.readFile(path.join(item.project, 'platform/tools/example/app.js'), 'utf8'), 'export const value = 1\n')
  assert.equal(await fs.readFile(path.join(item.baseline, 'platform/tools/example/app.js'), 'utf8'), 'export const value = 1\n')
  await assert.rejects(submitChanges(item), {code: 'EEXIST'})
})

test('two developers can submit independently against the same preserved revision', async context => {
  const item = await fixture(context)
  const other = path.join(item.directory, 'other')
  await fs.cp(item.baseline, other, {recursive: true})
  await fs.writeFile(path.join(item.workspace, 'platform/tools/example/app.js'), 'export const value = 2\n')
  await fs.writeFile(path.join(other, 'platform/tools/example/second.js'), 'export const second = true\n')
  await submitChanges(item)
  const otherOutput = path.join(item.directory, 'other-submission')
  await submitChanges({workspace: other, output: otherOutput})
  const first = await checkSubmission({baseline: item.baseline, submission: item.output})
  const second = await checkSubmission({baseline: item.baseline, submission: otherOutput})
  assert.equal(first.baseRevision, second.baseRevision)
  assert.equal(first.changes[0].action, 'modified')
  assert.equal(second.changes[0].action, 'added')
})

test('reference edits and additions outside the tool boundary are rejected', async context => {
  const item = await fixture(context)
  await fs.writeFile(path.join(item.workspace, 'platform/shared.mjs'), 'changed')
  await assert.rejects(submitChanges(item), /Reference file was modified/)
  await fs.copyFile(path.join(item.baseline, 'platform/shared.mjs'), path.join(item.workspace, 'platform/shared.mjs'))
  await fs.writeFile(path.join(item.workspace, 'platform/foreign.mjs'), 'changed')
  await assert.rejects(submitChanges(item), /outside allowed additions/)
})

test('missing files need explicit deletion and reference deletions remain protected', async context => {
  const item = await fixture(context)
  await fs.unlink(path.join(item.workspace, 'platform/tools/example/app.js'))
  await assert.rejects(submitChanges(item), /explicit editable deletion/)
  const deletionsFile = path.join(item.directory, 'deletions.json')
  await fs.writeFile(deletionsFile, JSON.stringify(['platform/tools/example/app.js']))
  await submitChanges({...item, deletionsFile})
  const result = await checkSubmission({baseline: item.baseline, submission: item.output})
  assert.equal(result.changes[0].action, 'deleted')
  assert.equal(result.changes[0].sha256, null)
  await fs.unlink(path.join(item.workspace, 'platform/shared.mjs'))
  await fs.writeFile(deletionsFile, JSON.stringify(['platform/tools/example/app.js', 'platform/shared.mjs']))
  await assert.rejects(submitChanges({...item, deletionsFile, output: path.join(item.directory, 'invalid')}), /explicit editable deletion/)
})

test('editing a received manifest cannot change the trusted submission base', async context => {
  const item = await fixture(context)
  const manifestFile = path.join(item.workspace, 'combine-source.json')
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
  manifest.files['platform/shared.mjs'].access = 'editable'
  await fs.writeFile(manifestFile, JSON.stringify(manifest))
  await fs.writeFile(path.join(item.workspace, 'platform/shared.mjs'), 'changed')
  await submitChanges(item)
  await assert.rejects(checkSubmission({baseline: item.baseline, submission: item.output}), /trusted baseline/)
})

test('payload corruption and extra payload files are rejected', async context => {
  const item = await fixture(context)
  await fs.writeFile(path.join(item.workspace, 'platform/tools/example/app.js'), 'changed')
  await submitChanges(item)
  const payload = path.join(item.output, 'files/platform/tools/example/app.js')
  await fs.writeFile(payload, 'corrupted')
  await assert.rejects(checkSubmission({baseline: item.baseline, submission: item.output}), /digest mismatch/)
  await fs.writeFile(payload, 'changed')
  await fs.writeFile(path.join(item.output, 'extra.txt'), 'unexpected')
  await assert.rejects(checkSubmission({baseline: item.baseline, submission: item.output}), /Unexpected or missing/)
})

test('unsafe source selections and duplicate casing are rejected', async context => {
  const item = await fixture(context)
  for (const source of ['../outside.txt', 'platform\\shared.mjs', 'platform/CON.txt', 'platform/.env.local', 'platform/data/accounts.json']) {
    const selection = {...item.selection, files: [{path: source, access: 'editable'}]}
    await fs.writeFile(item.selectionFile, JSON.stringify(selection))
    await assert.rejects(exportSource({...item, output: path.join(item.directory, 'unsafe')}), /source path|excluded/)
  }
  item.selection.files.push({path: 'platform/SHARED.mjs', access: 'reference'})
  await fs.writeFile(item.selectionFile, JSON.stringify(item.selection))
  await assert.rejects(exportSource({...item, output: path.join(item.directory, 'duplicate')}), /case-colliding/)
})

test('linked source and output directories are rejected', async context => {
  const item = await fixture(context)
  const linked = path.join(item.workspace, 'platform/tools/example/linked')
  await fs.symlink(item.project, linked, 'junction')
  await assert.rejects(submitChanges(item), /Linked path rejected/)
  const linkedOutput = path.join(item.directory, 'output-link')
  await fs.symlink(item.project, linkedOutput, 'junction')
  await assert.rejects(exportSource({...item, output: path.join(linkedOutput, 'new')}), /Linked path rejected/)
})
