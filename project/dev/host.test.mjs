import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {startDevelopmentHost} from './host.mjs'
async function cleanup(directory){const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert(path.basename(resolved).startsWith('deploymentplan-handoff-'));await fs.rm(resolved,{recursive:true,force:true})}
async function session(app){const origin='http://127.0.0.1:'+app.launch.port,r=await fetch(app.launch.url,{redirect:'manual'});assert.equal(r.status,302);const cookie=r.headers.get('set-cookie').split(';')[0];return {origin,cookie,async get(p){return fetch(origin+p,{headers:{cookie}})},async post(p,body){return fetch(origin+p,{method:'POST',headers:{cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})}}}
test('extracted tool uses the real domain/HTTP modules and persists sample edits after restart',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'deploymentplan-handoff-'));let app
 try{
  app=await startDevelopmentHost({port:0,directory});let api=await session(app)
  const initial=await (await api.get('/api/deploymentplan/state')).json();assert(initial.experts.length>=19);assert.equal(initial.sourcePrograms.length,3);assert(Object.keys(initial.obligations).length>=3)
  const info=await (await api.get('/api/deploymentplan/info')).json();assert.equal(info.crmConnected,false);assert.match(info.crmIdentity,/ساختگی/)
  const saved=await api.post('/api/deploymentplan/command',{revision:initial.revision,action:'expert',data:{name:'کارشناس آزمون ماندگاری',kind:'Implementation',order:6,active:true}});assert.equal(saved.status,200)
  const stale=await api.post('/api/deploymentplan/command',{revision:initial.revision,action:'expert',data:{name:'نباید ذخیره شود',kind:'Implementation',order:7,active:true}});assert.equal(stale.status,409)
  await app.close();app=await startDevelopmentHost({port:0,directory});api=await session(app)
  const after=await (await api.get('/api/deploymentplan/state')).json();assert.equal(after.experts.length,initial.experts.length+1);assert(after.experts.some(e=>e.name==='کارشناس آزمون ماندگاری'))
  const sync=await api.post('/api/deploymentplan/sync',{});assert.equal(sync.status,202);const job=await sync.json();let result
  for(let i=0;i<100;i++){result=await (await api.get('/api/deploymentplan/job?id='+job.id)).json();if(result.state!=='running')break;await new Promise(r=>setTimeout(r,5))}assert.equal(result.state,'success')
  const resynced=await (await api.get('/api/deploymentplan/state')).json();assert(resynced.experts.some(e=>e.name==='کارشناس آزمون ماندگاری'))
 }finally{await app?.close();await cleanup(directory)}
})
test('local session, origin, traversal and synthetic/live boundaries are enforced',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'deploymentplan-handoff-'));const app=await startDevelopmentHost({port:0,directory})
 try{const api=await session(app);assert.equal((await fetch(api.origin+'/api/deploymentplan/state')).status,401);assert.equal((await fetch(api.origin+'/api/deploymentplan/state',{headers:{cookie:api.cookie,Origin:'http://untrusted.example'}})).status,403);assert.equal((await api.get('/%2e%2e%2fcombine-source.json')).status,404);assert.equal((await api.post('/api/account/organization',{username:'unused',password:'unused',crm:true,calendar:false})).status,428)
  const html=await (await api.get('/deploymentplan/')).text();assert.match(html,/deploymentplan-ui.mjs/);assert.match(html,/dev\/overlay.mjs/)
  for(const asset of ['combine-shell.js','combine-shell.css','combine-tokens.css','combine-components.css','combine-icons.svg','header-menus.mjs','header-menus.css','account.css','persian-date-picker.mjs','workspace-summary.mjs','fonts/Dana-Regular.woff2','fonts/Dana-Bold.woff2','dev/overlay.mjs','dev/home.mjs','deploymentplan-icon.svg'])assert.equal((await api.get('/'+asset)).status,200,asset)
 }finally{await app.close();await cleanup(directory)}
})
