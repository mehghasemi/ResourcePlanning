import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const accessModule = moduleUrl(`
  export function requireTool(user, id) {
    if (!user.enabled || user.roles[id] !== 'user') throw Object.assign(Error('denied'), {status: 403})
  }
`)
const grantsModule = moduleUrl(`
  export function organizationGrants(user) { return {example: user.crmAllowed} }
`)
const transportModule = moduleUrl(`
  export function crmUserGet() { throw Error('Use fixture reader') }
`)
const versionModule = moduleUrl(`
  export async function componentVersion(root, id) {
    if (id !== 'example') throw Error('Unknown component')
    return '3.2.1'
  }
`)

async function template(name) {
  const source = await fs.readFile(new URL('../assets/' + name, import.meta.url), 'utf8')
  const compiled = source.replaceAll('__TOOL_ID__', 'example')
    .replace("'./platform-access.mjs'", JSON.stringify(accessModule))
    .replace("'./organization-account.mjs'", JSON.stringify(grantsModule))
    .replace("'./crm-user.mjs'", JSON.stringify(transportModule))
    .replace("'./component-status.mjs'", JSON.stringify(versionModule))
  return import(moduleUrl(compiled))
}

function userFixture() {
  return {
    id: 'fixture-user', enabled: true, revision: 1, name: 'کاربر آزمایشی',
    roles: {example: 'user'}, crmAllowed: true,
    organization: {id: 'fixture-connection', disabled: false, crm: {
      username: 'fixture', password: 'fixture-only', userId: 'fixture-crm-user'
    }}
  }
}

test('organization reader uses the current account and checks WhoAmI before reading', async () => {
  const {createOrganizationReader} = await template('tool-crm.mjs')
  const user = userFixture()
  const calls = []
  const readerFor = createOrganizationReader({
    store: {get: async () => user},
    read: async (connection, resource) => {
      calls.push({connection, resource})
      return resource === 'WhoAmI' ? {UserId: 'FIXTURE-CRM-USER'} : {value: [{id: 'fixture-record'}]}
    }
  })
  const read = await readerFor(structuredClone(user))
  assert.deepEqual(await read('accounts'), {value: [{id: 'fixture-record'}]})
  assert.deepEqual(calls.map(call => call.resource), ['WhoAmI', 'accounts'])
  assert.equal(calls[1].connection.username, 'fixture')
})

test('organization reader rejects expired sessions, denied grants and disconnected accounts', async () => {
  const {createOrganizationReader} = await template('tool-crm.mjs')
  const cases = [
    {change: user => { user.enabled = false }, status: 401},
    {change: user => { user.revision++ }, status: 401},
    {change: user => { user.roles.example = 'none' }, status: 403},
    {change: user => { user.crmAllowed = false }, status: 403},
    {change: user => { user.organization.disabled = true }, status: 428},
    {change: user => { user.organization.crm.invalidated = true }, status: 428}
  ]
  for (const item of cases) {
    const user = userFixture()
    const session = structuredClone(user)
    item.change(user)
    const readerFor = createOrganizationReader({store: {get: async () => user}, read: async () => assert.fail('CRM must not be called')})
    await assert.rejects(readerFor(session), {status: item.status})
  }
})

test('organization reader rejects a different CRM identity', async () => {
  const {createOrganizationReader} = await template('tool-crm.mjs')
  const user = userFixture()
  const readerFor = createOrganizationReader({store: {get: async () => user}, read: async () => ({UserId: 'another-user'})})
  await assert.rejects(readerFor(user), {status: 428})
})

test('connection changes before or during a read prevent result publication', async () => {
  const {createOrganizationReader} = await template('tool-crm.mjs')
  for (const duringRead of [false, true]) {
    const user = userFixture()
    const readerFor = createOrganizationReader({store: {get: async () => user}, read: async (connection, resource) => {
      if (resource === 'WhoAmI') return {UserId: connection.userId}
      if (duringRead) user.organization.id = 'replacement-connection'
      return {value: []}
    }})
    const read = await readerFor(structuredClone(user))
    if (!duringRead) user.organization.id = 'replacement-connection'
    await assert.rejects(read('accounts'), {status: 409})
  }
})

test('CRM denial is preserved for the caller', async () => {
  const {createOrganizationReader} = await template('tool-crm.mjs')
  const user = userFixture()
  const readerFor = createOrganizationReader({store: {get: async () => user}, read: async (connection, resource) => {
    if (resource === 'WhoAmI') return {UserId: connection.userId}
    throw Object.assign(Error('CRM access denied'), {status: 403})
  }})
  const read = await readerFor(user)
  await assert.rejects(read('accounts'), {status: 403})
})

test('HTTP template protects its page aliases and reads the component version through the core', async () => {
  const {createToolHttp} = await template('tool-http.mjs')
  const user = userFixture()
  const sent = []
  const handler = createToolHttp({root: '/fixture', store: {get: async () => user}, send: (res, status, body) => sent.push({status, body})})
  const response = {setHeader() {}}
  assert.equal(await handler.handle({method: 'GET'}, response, new URL('https://fixture.test/another/'), null), false)
  for (const route of ['/example', '/example/', '/example.html', '/api/example/info']) {
    await assert.rejects(handler.handle({method: 'GET'}, response, new URL('https://fixture.test' + route), null), {status: 401})
  }
  assert.equal(await handler.handle({method: 'GET'}, response, new URL('https://fixture.test/api/example/info'), user), true)
  assert.deepEqual(sent[0], {status: 200, body: {name: user.name, version: '3.2.1'}})
  user.roles.example = 'none'
  await assert.rejects(handler.handle({method: 'GET'}, response, new URL('https://fixture.test/api/example/info'), user), {status: 403})
})
