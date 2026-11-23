import fs from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import os from 'node:os'
import {fileURLToPath} from 'node:url'
import {spawn,spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {submitChanges} from '../project/.agents/skills/combine-release/scripts/development-bundle.mjs'
import {createDevelopmentZip} from '../project/dev/archive.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),project=path.join(root,'project'),rootId=createHash('sha256').update(project).digest('hex'),args=process.argv.slice(2),action=args[0]||'start',option=(k,fallback)=>{const i=args.indexOf(k);return i<0?fallback:args[i+1]},mode=args.includes('--live')?'live':'sample',dataRoot=path.join(root,'.local-data'),directory=path.join(dataRoot,mode)
const pause=ms=>new Promise(r=>setTimeout(r,ms)),json=async f=>JSON.parse(await fs.readFile(f,'utf8'))
async function launched(dir){try{const v=await json(path.join(dir,'launch.json')),health=await fetch('http://127.0.0.1:'+v.port+'/api/health',{signal:AbortSignal.timeout(1200)}).then(r=>r.json());return health.app==='combine-deploymentplan-development'&&health.rootId===rootId&&v.rootId===rootId&&health.mode===v.mode?v:null}catch{return null}}
function browser(url){const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open',params=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];const child=spawn(command,params,{windowsHide:true,detached:true,stdio:'ignore'});child.on('error',()=>console.log('Open the local launch URL in .local-data/'+mode+'/launch.json'));child.unref()}
async function freePort(){const explicit=option('--port',null),start=Number(explicit||3031);if(!Number.isInteger(start)||start<1024||start>65535)throw Error('Invalid local port');for(let p=start;p<=Math.min(65535,start+(explicit?0:19));p++){const free=await new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(p,'127.0.0.1',()=>s.close(()=>resolve(true)))});if(free)return p}throw Error('The requested local port is occupied; choose --port NUMBER.')}
async function start(){
 if(mode==='live'&&process.platform!=='win32')throw Error('Live CRM requires Windows. Sample mode works on macOS/Linux too.')
 const other=await launched(path.join(dataRoot,mode==='sample'?'live':'sample'));if(other)throw Error('Another mode is running. Use Stop.cmd before changing sample/live mode.')
 const running=await launched(directory);if(running){console.log('Already running: http://127.0.0.1:'+running.port+'/deploymentplan/ ('+mode+')');if(!args.includes('--no-open'))browser(running.url);return running}
 const port=await freePort();await fs.mkdir(directory,{recursive:true});const output=await fs.open(path.join(directory,'host.stdout.log'),'a'),errors=await fs.open(path.join(directory,'host.stderr.log'),'a')
 const child=spawn(process.execPath,[path.join(project,'dev/host.mjs'),'--port',String(port),'--mode',mode,'--data-directory',directory],{cwd:project,windowsHide:true,detached:true,stdio:['ignore',output.fd,errors.fd]});let failed;child.on('error',e=>{failed=e});child.unref();await output.close();await errors.close()
 for(let i=0;i<160;i++){if(failed)throw failed;const ready=await launched(directory);if(ready&&ready.pid===child.pid){console.log('Ready: http://127.0.0.1:'+ready.port+'/deploymentplan/ ('+mode+')');if(!args.includes('--no-open'))browser(ready.url);return ready}if(child.exitCode!==null)break;await pause(250)}
 throw Error('Local host did not start. Read .local-data/'+mode+'/host.stderr.log; existing data was preserved.')
}
async function stop(){let count=0;for(const kind of ['sample','live']){const dir=path.join(dataRoot,kind),v=await launched(dir);if(!v)continue;const url=new URL(v.url),secret=url.searchParams.get('token');const response=await fetch(url.origin+'/dev/shutdown',{method:'POST',headers:{Origin:url.origin,'x-local-launch':secret,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('The local instance refused shutdown.');for(let i=0;i<80&&await launched(dir);i++)await pause(100);if(await launched(dir))throw Error('The local instance has not stopped yet.');count++}console.log(count?'Local development stopped. Saved changes were preserved.':'No running instance of this development package.')}
async function verify(){
 const manifest=await json(path.join(project,'combine-source.json')),inventory=await json(path.join(root,'PACKAGE-MANIFEST.json'))
 const explicit=option('--deletions',null),deletions=new Set(explicit?await json(explicit):[])
 for(const [file,entry]of Object.entries(manifest.files)){let bytes;try{bytes=await fs.readFile(path.join(project,file))}catch(e){if(e.code==='ENOENT'&&entry.access==='editable'&&deletions.has(file))continue;throw e}if(entry.access==='reference'&&createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Reference file changed: '+file)}
 for(const entry of inventory.files.filter(f=>!f.path.startsWith('project/'))){const bytes=await fs.readFile(path.join(root,entry.path));if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Package runtime/helper changed: '+entry.path)}
 const files=(await fs.readdir(path.join(project,'platform'))).filter(f=>/^deploymentplan-.*\.test\.mjs$/.test(f)).map(f=>'platform/'+f)
 files.push('platform/organization-account.test.mjs','dev/host.test.mjs')
 const result=spawnSync(process.execPath,['--test',...files],{cwd:project,stdio:'inherit',windowsHide:true});if(result.status!==0)throw Error('Tool checks failed.');console.log('Source, shared references, runtime integrity and local persistence checks passed.')
}
async function zipDirectory(dir){const files=new Map();async function visit(folder,prefix=''){for(const item of await fs.readdir(folder,{withFileTypes:true})){if(item.isSymbolicLink())throw Error('Linked return path');const relative=prefix+item.name;if(item.isDirectory())await visit(path.join(folder,item.name),relative+'/');else files.set(relative,await fs.readFile(path.join(folder,item.name)))}}await visit(dir);return createDevelopmentZip(files)}
async function buildReturn(){await verify();const stamp=new Date().toISOString().replace(/[:.]/g,'-'),output=path.join(root,'returns','deploymentplan-changes-'+stamp);await fs.mkdir(path.dirname(output),{recursive:true});const result=await submitChanges({workspace:project,output,notesFile:option('--notes',undefined),deletionsFile:option('--deletions',undefined),versionsFile:option('--versions',undefined)});const zip=output+'.zip';await fs.writeFile(zip,await zipDirectory(output),{flag:'wx'});console.log(JSON.stringify({...result,zip},null,2));return zip}
try{if(action==='start')await start();else if(action==='stop')await stop();else if(action==='verify')await verify();else if(action==='return')await buildReturn();else throw Error('Use start, stop, verify or return.')}catch(e){console.error(e.message);process.exitCode=1}
