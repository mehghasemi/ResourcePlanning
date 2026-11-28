import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('./deploymentplan-http.mjs',import.meta.url),'utf8');
const start=source.indexOf("if(p.action==='settings'){"),end=source.indexOf("\n   const manager=",start);assert(start>=0&&end>start);const branch=source.slice(start,end);
const handle=new Function('user','canManageTool','update','send','applyCommand','clock','fail',`return (async()=>{const p={action:'settings',revision:4,data:{intervalMinutes:60}},res={};${branch}})()`);
const fail=(message,status)=>Object.assign(Error(message),{status});
function harness(role){const checked=[],state={writes:0,response:null};const call=()=>handle({role},(user,id)=>{checked.push(id);return id==='tool-96a847ac'&&user.role==='admin'},async(user,revision,fn)=>{state.writes++;return fn({},user)},(res,status,data)=>{state.response={status,data}},(draft,action,data,user,options)=>({action,data,manager:options.manager}),()=>new Date(),fail);return {call,checked,state}}
test('extension manager saves CRM settings using the registered extension permission',async()=>{const h=harness('admin');assert.equal(await h.call(),true);assert.deepEqual(h.checked,['tool-96a847ac']);assert.equal(h.state.writes,1);assert.equal(h.state.response.status,200);assert.equal(h.state.response.data.manager,true)});
test('ordinary extension users cannot save CRM settings',async()=>{const h=harness('user');await assert.rejects(h.call(),e=>e.status===403);assert.equal(h.state.writes,0);assert.equal(h.state.response,null)});
