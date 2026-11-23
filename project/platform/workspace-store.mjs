import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {randomUUID} from 'node:crypto'
import {dpapi} from './history.mjs'
import {workspaceDay} from './public/workspace-summary.mjs'
import {windowsSid} from './crm-profile.mjs'
export const workspaceError=(message,status=400)=>Object.assign(new Error(message),{status});
export function createWorkspaceStore({scope,directory=path.join(process.env.LOCALAPPDATA||os.tmpdir(),'BaridKnowledgeHub','workspace'),codec=dpapi,identity=windowsSid}={}){
 if(!/^[a-f0-9]{64}$/.test(scope||''))throw Error('Workspace scope required');const locks=new Map();
 const file=id=>{if(!/^[a-f0-9-]{36}$/.test(id||''))throw workspaceError('شناسهٔ حساب معتبر نیست.');return path.join(directory,scope,id+'.json')};
 async function read(id){try{const box=JSON.parse(await fs.readFile(file(id),'utf8'));const v=JSON.parse(await codec(box.encrypted,true));if(v.scope!==scope||v.id!==id||v.owner!==await identity()||v.version!==1)throw Error('Binding');v.notes??=v.note?[{id:'legacy-note',text:v.note,day:null,createdAt:null,archived:false}]:[];return v;}catch(e){if(e.code==='ENOENT')return {version:1,scope,id,owner:await identity(),revision:0,note:'',notes:[],todos:[],settings:{crmSource:'none'},connections:{},cache:{}};throw workspaceError('فضای کار قابل خواندن نیست؛ نسخهٔ قبلی حفظ شد.',503)}}
 async function mutate(id,fn){const p=(locks.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{const v=await read(id);const out=await fn(v);v.revision++;const encrypted=await codec(JSON.stringify(v));const target=file(id),tmp=target+'.'+randomUUID()+'.tmp';await fs.mkdir(path.dirname(target),{recursive:true});try{await fs.writeFile(tmp,JSON.stringify({version:1,encrypted}),{mode:0o600});await fs.rename(tmp,target);}finally{await fs.unlink(tmp).catch(()=>{})}return out;});locks.set(id,p);try{return await p}finally{if(locks.get(id)===p)locks.delete(id)}}
 return {read,mutate};
}
export function updatePersonal(v,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['revision','note','action','id','title','due','done','day'].includes(k))||input.revision!==v.revision)throw workspaceError('فضای کار تغییر کرده است؛ صفحه را تازه کنید.',409);
 if(['note','note-update','note-archive','note-restore'].includes(input.action)){
  v.notes??=v.note?[{id:'legacy-note',text:v.note,day:null,createdAt:null,archived:false}]:[];
  if(input.action==='note-archive'||input.action==='note-restore'){const row=v.notes.find(n=>n.id===input.id);if(!row)throw workspaceError('یادداشت پیدا نشد.',404);row.archived=input.action==='note-archive';return;}
  if(typeof input.note!=='string'||!input.note.trim()||input.note.length>10000)throw workspaceError('متن یادداشت باید بین ۱ تا ۱۰٬۰۰۰ نویسه باشد.');
  const day=input.day??workspaceDay(new Date());if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw workspaceError('روز یادداشت معتبر نیست.');
  if(input.action==='note-update'){const row=v.notes.find(n=>n.id===input.id);if(!row)throw workspaceError('یادداشت پیدا نشد.',404);row.text=input.note.trim();row.day=day;row.updatedAt=new Date().toISOString();}
  else{if(v.notes.length>=100)throw workspaceError('حداکثر ۱۰۰ یادداشت نگهداری می‌شود.');v.notes.unshift({id:randomUUID(),text:input.note.trim(),day,createdAt:new Date().toISOString(),archived:false});}v.note=input.note;return;
 }
 if(!['add','update','delete'].includes(input.action))throw workspaceError('عملیات معتبر نیست.');
 if(input.action==='add'){if(v.todos.length>=200)throw workspaceError('حداکثر ۲۰۰ کار شخصی مجاز است.');const row={id:randomUUID(),title:'',due:null,done:false,createdAt:new Date().toISOString()};validateTodo(row,input);v.todos.unshift(row);return;}
 const row=v.todos.find(t=>t.id===input.id);if(!row)throw workspaceError('کار پیدا نشد.',404);if(input.action==='delete')v.todos=v.todos.filter(t=>t.id!==input.id);else validateTodo(row,input);
}
function validateTodo(row,input){if(input.title!==undefined){if(typeof input.title!=='string'||!input.title.trim()||input.title.length>200)throw workspaceError('عنوان کار حداکثر ۲۰۰ نویسه است.');row.title=input.title.trim();}if(!row.title)throw workspaceError('عنوان کار را بنویسید.');if(input.done!==undefined){if(typeof input.done!=='boolean')throw workspaceError('وضعیت کار معتبر نیست.');row.done=input.done;}if(input.due!==undefined){if(input.due!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.due)||!Number.isFinite(Date.parse(input.due))||new Date(input.due).toISOString().slice(0,10)!==input.due))throw workspaceError('تاریخ معتبر نیست.');row.due=input.due;}}
