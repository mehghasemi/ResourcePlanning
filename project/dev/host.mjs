// Local DEVELOPMENT adapter only. Production keeps Combine's shared identity,
// authorization, organization account and encrypted workspace unchanged.
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto'
import {createDeploymentplanHttp,planningWorkspace} from '../platform/deploymentplan-http.mjs'
import {createOrganizationHttp} from '../platform/organization-http.mjs'
import {createWorkspaceStore} from '../platform/workspace-store.mjs'
import {dpapi} from '../platform/history.mjs'
import {windowsSid} from '../platform/crm-profile.mjs'
import {defaultToolRoles} from '../platform/platform-access.mjs'
import {createSample,sampleRows,sampleCrmId} from './sample.mjs'

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const error=(message,status=400)=>Object.assign(Error(message),{status})
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b))
async function atomicJson(file,value){const tmp=file+'.'+randomUUID()+'.tmp';await fs.mkdir(path.dirname(file),{recursive:true});try{await fs.writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await fs.rename(tmp,file)}finally{await fs.unlink(tmp).catch(()=>{})}}
async function profileLock(directory){
 await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'running.lock'),nonce=randomUUID(),record=JSON.stringify({pid:process.pid,nonce})
 for(let i=0;i<2;i++)try{const f=await fs.open(file,'wx',0o600);try{await f.writeFile(record)}finally{await f.close()};return async()=>{if(await fs.readFile(file,'utf8').catch(()=>null)===record)await fs.unlink(file)}}catch(e){if(e.code!=='EEXIST')throw e;const previous=await fs.readFile(file,'utf8'),p=JSON.parse(previous);if(!Number.isSafeInteger(p.pid)||p.pid<1)throw error('قفل اجرای محلی معتبر نیست.',503);try{process.kill(p.pid,0);throw error('این اجرای محلی باز است؛ فایل ResourcePlanning-Stop.cmd را اجرا کنید.',409)}catch(e){if(e.code!=='ESRCH')throw e}if(await fs.readFile(file,'utf8')===previous)await fs.unlink(file)}
 throw error('فضای کار در حال اجراست.',409)
}
async function account(directory,mode){
 const live=mode==='live',owner=live?await windowsSid():'synthetic-local-profile',scope=createHash('sha256').update('deploymentplan-development:'+project+':'+owner+':'+mode).digest('hex'),file=path.join(directory,live?'account.protected.json':'sample-profile.json')
 async function read(){try{const box=JSON.parse(await fs.readFile(file,'utf8')),v=live?JSON.parse(await dpapi(box.encrypted,true)):box;if(v.owner!==owner||v.scope!==scope)throw Error('binding');return v}catch(e){if(e.code!=='ENOENT')throw error('پروفایل محلی قابل خواندن نیست؛ فایل قبلی حفظ شد.',503);return null}}
 async function write(v){await atomicJson(file,live?{schema:1,encrypted:await dpapi(JSON.stringify(v))}:v)}
 if(!await read())await write({schema:1,owner,scope,id:randomUUID(),name:live?'توسعه‌دهندهٔ محلی':'مدیر نمونه · دادهٔ ساختگی',launchSecret:randomBytes(32).toString('hex'),organization:null})
 const user=v=>({id:v.id,name:v.name,enabled:true,isAdmin:false,revision:1,scope,access:[],toolRoles:{...defaultToolRoles,deploymentplan:'admin'},organization:live?v.organization:{id:'synthetic-only',crm:{userId:sampleCrmId,displayName:'منبع ساختگی توسعه',username:'synthetic',password:'not-a-credential'}}})
 let queue=Promise.resolve()
 return {scope,get:async id=>{const v=await read();return id===v.id?user(v):null},list:async()=>[user(await read())],secret:async()=>(await read()).launchSecret,setOrganization(id,organization,expectedId){const p=queue.catch(()=>{}).then(async()=>{const v=await read();if(mode!=='live'||v.id!==id)throw error('این اجرا برای اتصال واقعی نیست.',403);if((v.organization?.id||null)!==expectedId)throw error('حساب سازمانی تغییر کرده است.',409);v.organization=organization;await write(v);return {saved:!organization.disabled}});queue=p;return p}}
}
async function sampleRepository(directory,user){
 const file=path.join(directory,'sample-workspace.json');let queue=Promise.resolve()
 async function read(){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw error('دادهٔ نمونه قابل خواندن نیست؛ فایل قبلی حفظ شد.',503);const initial={deploymentplan:createSample(user)};await atomicJson(file,initial);return initial}}
 await read()
 return {read:async()=>structuredClone(await read()),mutate(id,fn){if(id!==planningWorkspace)throw error('فضای کار ناشناخته است.');const p=queue.catch(()=>{}).then(async()=>{const next=await read(),result=await fn(next);await atomicJson(file,next);return result});queue=p;return p}}
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'}
const assets=new Set(['deploymentplan-ui.mjs','deploymentplan-view.mjs','deploymentplan.css','deploymentplan-icon.svg','combine-shell.js','combine-shell.css','combine-tokens.css','combine-components.css','combine-icons.svg','header-menus.mjs','header-menus.css','account.css','change-password.mjs','password-fields.mjs','logout.mjs','persian-date-picker.mjs','workspace-summary.mjs','fonts/Dana-Regular.woff2','fonts/Dana-Bold.woff2'])
export async function startDevelopmentHost({port=3031,mode='sample',directory=path.join(project,'..','.local-data',mode)}={}){
 if(!['sample','live'].includes(mode)||!Number.isInteger(port)||port<0||port>65535)throw error('حالت یا پورت معتبر نیست.')
 if(mode==='live'&&process.platform!=='win32')throw error('اتصال واقعی CRM و نگهداری امن حساب در این بسته به ویندوز نیاز دارد.')
 const release=await profileLock(directory);let server,timer
 try{
 const store=await account(directory,mode),user=(await store.list())[0],repository=mode==='live'?createWorkspaceStore({scope:store.scope,directory:path.join(directory,'workspace')}):await sampleRepository(directory,user),root=path.join(project,'platform'),rootId=createHash('sha256').update(project).digest('hex'),sessions=new Map()
 let origin,cookie,closing=false
 const send=(res,status,value,type='application/json; charset=utf-8')=>{
  if(mode==='sample'&&type.includes('json')&&value?.manager!==undefined)value={...value,crmConnected:false,crmIdentity:'دادهٔ ساختگی توسعه؛ CRM واقعی متصل نیست'}
  if(type.startsWith('text/html')){value=String(value).replace('</body>','<script type="module" src="/dev/overlay.mjs"></script></body>')}
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(type.includes('json')?JSON.stringify(value):value)
 }
 const bodyJson=async req=>{let bytes=0,text='';for await(const chunk of req){bytes+=chunk.length;if(bytes>1500000)throw error('حجم درخواست بیش از حد مجاز است.',413);text+=chunk}try{return JSON.parse(text||'{}')}catch{throw error('درخواست JSON معتبر نیست.')}}
 const sampleOptions=mode==='sample'?{read:async(c,r)=>r==='WhoAmI'?{UserId:sampleCrmId}:{value:[]},loadMetadata:async()=>({}),fetchSnapshot:async()=>sampleRows(),authorizeIds:async(r,m,ids)=>ids,authorizeProjectIds:async(r,m,ids)=>ids,authorizeEvidenceIds:async()=>[]}:{}
 const app=createDeploymentplanHttp({root,store,repository,send,bodyJson,...sampleOptions}),organization=createOrganizationHttp({store,send,bodyJson})
 async function close(){if(closing)return;closing=true;clearInterval(timer);await new Promise(resolve=>server.close(resolve));await fs.unlink(path.join(directory,'launch.json')).catch(()=>{});await release()}
 server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site')throw error('مبدأ درخواست مجاز نیست.',403)
  const url=new URL(req.url,origin)
  if(req.method==='GET'&&url.pathname==='/api/health'){send(res,200,{ok:true,app:'combine-deploymentplan-development',rootId,mode,port:Number(new URL(origin).port)});return}
  if(req.method==='POST'&&url.pathname==='/dev/shutdown'&&req.headers.origin===origin&&equal(req.headers['x-local-launch'],await store.secret())){send(res,200,{ok:true});void close();return}
  if(req.method==='GET'&&url.pathname==='/launch'&&equal(url.searchParams.get('token'),await store.secret())){const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);res.writeHead(302,{'Set-Cookie':`${cookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,Location:mode==='live'&&!user.organization?'/home.html?organization=1':'/deploymentplan/','Referrer-Policy':'no-referrer'});res.end();return}
  const token=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookie+'='))?.slice(cookie.length+1),expires=sessions.get(token)
  if(!expires||expires<Date.now()){
   if(req.method==='GET'&&['/','/deploymentplan/','/login.html','/home.html'].includes(url.pathname)){send(res,200,'<!doctype html><html dir="rtl" lang="fa"><meta charset="utf-8"><title>ورود محلی</title><body><h1>برنامه ریزی پروژه های استقرار</h1><p>برای بازکردن محیط محلی، Start.cmd را اجرا کنید. در مک و لینوکس فرمان node tools/manage.mjs start را اجرا کنید.</p></body></html>','text/html; charset=utf-8');return}
   throw error('محیط محلی را از Start.cmd باز کنید.',401)
  }
  if(!['GET','HEAD'].includes(req.method)&&(req.headers.origin!==origin||!String(req.headers['content-type']||'').startsWith('application/json')))throw error('درخواست تغییر باید از همین محیط ارسال شود.',403)
  if(req.method==='POST'&&url.pathname==='/api/auth/logout'){sessions.delete(token);res.setHeader('Set-Cookie',`${cookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);send(res,200,{ok:true});return}
  if(url.pathname==='/api/auth/password')throw error('این محیط با حساب سیستم‌عامل باز می‌شود و رمز محلی جداگانه ندارد.')
  if(req.method==='GET'&&url.pathname==='/dev/info'){send(res,200,{mode,synthetic:mode==='sample'});return}
  if(mode==='sample'&&url.pathname==='/api/account/organization')throw error('اجرای نمونه به CRM وصل نمی‌شود. Stop.cmd و سپس Start-Live-CRM.cmd را اجرا کنید.',428)
  if(req.method==='GET'&&url.pathname==='/home.html'){send(res,200,await fs.readFile(path.join(project,'dev/home.html'),'utf8'),'text/html; charset=utf-8');return}
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(302,{Location:'/deploymentplan/'});res.end();return}
  if(req.method==='GET'&&url.pathname.startsWith('/dev/')&&['/dev/home.mjs','/dev/overlay.mjs','/dev/local.css'].includes(url.pathname)){send(res,200,await fs.readFile(path.join(project,url.pathname.slice(1))),mime[path.extname(url.pathname)]);return}
  const current=(await store.list())[0]
  if(mode==='live'&&await organization.handle(req,res,url,current))return
  if(await app.handle(req,res,url,current))return
  const relative=decodeURIComponent(url.pathname).slice(1)
  const publicRoot=path.join(root,'public'),target=path.resolve(publicRoot,relative),toolAsset=/^deploymentplan-[a-z0-9-]+\.(?:mjs|js|css|svg)$/.test(relative)||/^deploymentplan\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:html|mjs|js|css|svg|png|webp)$/.test(relative)
  if(req.method!=='GET'||(!assets.has(relative)&&!toolAsset)||!target.startsWith(publicRoot+path.sep))throw error('مسیر پیدا نشد.',404)
  send(res,200,await fs.readFile(target),mime[path.extname(relative)]||'application/octet-stream')
 }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'درخواست انجام نشد؛ دادهٔ قبلی حفظ شد.'});else res.end()}})
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{const actual=server.address().port;origin='http://127.0.0.1:'+actual;cookie='combine_deploymentplan_dev_'+actual;resolve()})})
 timer=setInterval(()=>app.tick().catch(()=>{}),60000);timer.unref()
 const launch={pid:process.pid,port:server.address().port,rootId,mode,url:origin+'/launch?token='+await store.secret()}
 await atomicJson(path.join(directory,'launch.json'),launch)
 return {server,launch,close,store,repository}
 }catch(e){if(server?.listening)await new Promise(resolve=>server.close(resolve));await release();throw e}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),get=(k,fallback)=>{const i=args.indexOf(k);return i<0?fallback:args[i+1]}
 const app=await startDevelopmentHost({port:Number(get('--port','3031')),mode:get('--mode','sample'),directory:path.resolve(get('--data-directory',path.join(project,'..','.local-data',get('--mode','sample'))))})
 console.log('Deployment planning development is ready: '+app.launch.mode+' on 127.0.0.1:'+app.launch.port)
 process.once('SIGINT',()=>app.close().then(()=>process.exit()));process.once('SIGTERM',()=>app.close().then(()=>process.exit()))
}
