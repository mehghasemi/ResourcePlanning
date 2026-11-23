import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {createHash, randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {windowsSid, profilePath} from './crm-profile.mjs'
import {hasChatSource} from './public/chat-sources.mjs'
import {toolRoles} from './platform-access.mjs'
import {accountContext} from './account-context.mjs'

export async function currentIdentity() {
  const sid = await windowsSid()
  const account=accountContext()
  if(account)return account.historyOwner||`${sid}:app:${account.scope}:${account.id}`
  let profile
  try {profile = JSON.parse(await fs.readFile(profilePath, 'utf8'))} catch (e) {if (e.code !== 'ENOENT') throw new Error('پروفایل محلی معتبر نیست.')}
  if (profile && profile.windowsSid !== sid) throw new Error('این پروفایل متعلق به کاربر دیگری است؛ start.cmd را با حساب خودتان اجرا کنید.')
  return `${sid}:${profile?.crmUserId?.toLowerCase() || 'local'}`
}
export function dpapi(value, decrypt = false) {
  if (process.platform !== 'win32') return Promise.reject(new Error('تاریخچهٔ امن فقط روی ویندوز پشتیبانی می‌شود.'))
  // Fixed script: content travels via stdin, never command-line arguments or logs.
  const method = decrypt ? 'Unprotect' : 'Protect'
  const script = `$ErrorActionPreference='Stop';try{Add-Type -AssemblyName System.Security;$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());$r=[System.Security.Cryptography.ProtectedData]::${method}($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($r))}catch{exit 1}`
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']})
    const chunks = []; const timer = setTimeout(() => {child.kill(); reject(new Error('پردازش امن تاریخچه به پایان نرسید.'))}, 15000)
    child.stdout.on('data', data => chunks.push(data))
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.on('error', () => {clearTimeout(timer); reject(new Error('سرویس امن تاریخچه اجرا نشد.'))})
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error('تاریخچه قابل خواندن یا ذخیره‌سازی نیست؛ فایل قبلی حفظ شده است.'))
      const output = Buffer.concat(chunks).toString().trim()
      resolve(decrypt ? Buffer.from(output, 'base64').toString('utf8') : output)
    })
    child.stdin.end(decrypt ? value : Buffer.from(value, 'utf8').toString('base64'))
  })
}
export function conversationTitle(question=''){
  const text=String(question).replace(/[يى]/g,'ی').replace(/ك/g,'ک').trim()
  const organization=text.includes('نهاد ریاست جمهوری')?'نهاد ریاست جمهوری':''
  if(/پرایمری|primary|مخاطب اصلی/i.test(text))return 'پرایمری اکانت'+(organization?' — '+organization:'')
  if(/کیس|تیکت/.test(text))return (/تقویم|جلسات/.test(text)?'کیس‌های تقویم و جلسات':'بررسی کیس‌ها')+(organization?' — '+organization:'')
  if(/چشم.?انداز|استراتژی/.test(text))return /سه.?سال|۳.?سال|3.?سال/.test(text)?'چشم‌انداز سه‌ساله برید':'چشم‌انداز و استراتژی برید'
  const cleaned=text.replace(/^(?:لطفاً|لطفا|می.?خواهم|میخوام|بگو|ببین|آیا|میشه|می.?توانیم|میتونیم|در مورد|درباره)\s*/g,'').replace(/(?:چیست|کیست|کیه|چیه|بده|بگو|دارد|داریم|کنیم)\s*[؟?،.]*$/g,'').replace(/[؟?]/g,'').trim()
  return cleaned.split(/\s+/).slice(0,9).join(' ').slice(0,65)||'گفت‌وگوی جدید'
}
export function createHistoryStore({directory = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'BaridKnowledgeHub', 'history'), identity = currentIdentity, codec = dpapi} = {}) {
  const locks = new Map()
  async function repository(){
    const owner=createHash('sha256').update(await identity()).digest('hex'),file=path.join(directory,owner+'.json')
    const validMessages=messages=>Array.isArray(messages)&&messages.every(x=>['user','assistant'].includes(x.role)&&typeof x.content==='string')
    async function read(){
      let envelope
      try{envelope=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return {owner,conversations:[]};throw new Error('History file is invalid. Existing data was preserved.')}
      if(![1,2].includes(envelope.version)||typeof envelope.encrypted!=='string')throw new Error('Invalid history envelope.')
      let data
      try{data=JSON.parse(await codec(envelope.encrypted,true))}catch{throw new Error('History could not be decrypted. Existing data was preserved.')}
      if(data.owner!==owner)throw new Error('History owner does not match.')
      if(envelope.version===1){
        if(!validMessages(data.messages))throw new Error('Invalid legacy history.')
        const createdAt=data.messages[0]?.timestamp||new Date().toISOString()
        return {owner,legacy:true,conversations:data.messages.length?[{id:'legacy',title:data.messages.find(x=>x.role==='user')?.content.slice(0,70)||'Previous conversation',createdAt,updatedAt:data.messages.at(-1)?.timestamp||createdAt,messages:data.messages}]:[]}
      }
      if(!Array.isArray(data.conversations)||data.conversations.some(c=>typeof c.id!=='string'||!validMessages(c.messages))||new Set(data.conversations.map(c=>c.id)).size!==data.conversations.length)throw new Error('Invalid conversation history.')
      for(const c of data.conversations)c.title=c.customTitle||conversationTitle(c.messages.find(x=>x.role==='user')?.content||'')
      return data
    }
    async function mutate(change){
      const work=(locks.get(owner)||Promise.resolve()).catch(()=>{}).then(async()=>{
        const data=await read(),result=change(data)
        for(const c of data.conversations)c.title=c.customTitle||conversationTitle(c.messages.find(x=>x.role==='user')?.content||'')
        const encrypted=await codec(JSON.stringify({owner,conversations:data.conversations}))
        await fs.mkdir(directory,{recursive:true})
        if(data.legacy)try{await fs.copyFile(file,file+'.v1.bak',1)}catch(e){if(e.code!=='EEXIST')throw e}
        const temp=file+'.'+randomUUID()+'.tmp'
        try{await fs.writeFile(temp,JSON.stringify({version:2,encrypted}),{mode:0o600});await fs.rename(temp,file)}
        finally{await fs.rm(temp,{force:true})}
        return result
      })
      locks.set(owner,work);try{return await work}finally{if(locks.get(owner)===work)locks.delete(owner)}
    }
    return {read,mutate}
  }
  const metadata=c=>({id:c.id,title:c.customTitle||conversationTitle(c.messages.find(x=>x.role==='user')?.content||''),createdAt:c.createdAt,updatedAt:c.updatedAt,messageCount:c.messages.length,pinned:Boolean(c.pinned),reportBuilder:Boolean(c.reportBuilder),mode:c.mode==='memory'?'memory':'standard',source:['crm','model','all'].includes(c.source)?c.source:'notion',requiredSources:c.requiredSources||[c.source||'notion']})
  function missing(){throw Object.assign(new Error('Conversation not found for the current user.'),{status:404})}
  async function open(conversationId){
    if(conversationId!==undefined&&(typeof conversationId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(conversationId)))missing()
    const repo=await repository(),initial=await repo.read()
    const selected=conversationId?initial.conversations.find(c=>c.id===conversationId):initial.conversations[0]
    if(conversationId&&!selected)missing()
    const id=selected?.id||'default'
    function find(data,create=false){
      let c=data.conversations.find(x=>x.id===id)
      if(!c&&create&&!conversationId){const now=new Date().toISOString();c={id,title:'New chat',createdAt:now,updatedAt:now,messages:[]};data.conversations.push(c)}
      if(!c&&conversationId)missing()
      return c
    }
    const handle={
      conversationId:id,
      reportBuilder:Boolean(selected?.reportBuilder),
      mode:selected?.mode==='memory'?'memory':'standard',
      source:['crm','model','all'].includes(selected?.source)?selected.source:'notion',
      attachmentIds:selected?.attachmentIds||[],
      requiredSources:selected?.requiredSources||[selected?.source||'notion'],
      load:async()=>find(await repo.read())?.messages||[],
      begin:async(question,{attachments=[]}={})=>{
        const requestId=randomUUID(),timestamp=new Date().toISOString()
        await repo.mutate(data=>{const c=find(data,true);if(!c.messages.length)c.title=conversationTitle(question);c.updatedAt=timestamp;c.messages.push({role:'user',content:question,requestId,timestamp,...(attachments.length?{attachments}:{})},{role:'assistant',content:'پاسخ پیش از تکمیل قطع شد؛ لطفاً دوباره تلاش کنید.',requestId,timestamp,status:'pending',sources:[]})})
        return requestId
      },
      complete:async(requestId,result)=>{
        await repo.mutate(data=>{const c=find(data),m=c?.messages.find(x=>x.requestId===requestId&&x.role==='assistant');if(!m)throw new Error('Pending response was not found.');Object.assign(m,{content:result.answer,sources:result.sources||[],usage:result.usage||null,mode:result.mode||result.generatedBy||'',status:'complete',stopped:Boolean(result.stopped),...(result.agentDiagnostics||result.agentTrace?{agentDiagnostics:result.agentDiagnostics||result.agentTrace}:{}),...(result.sourceUsage?{sourceUsage:result.sourceUsage}:{}),...(result.reportDraft?{reportDraft:result.reportDraft}:{}),completedAt:new Date().toISOString()});c.updatedAt=m.completedAt})
      },
      append:async(question,result)=>{const requestId=await handle.begin(question);await handle.complete(requestId,result)}
    }
    return handle
  }
  return {
    open,
    list:async()=>{const data=await(await repository()).read();return data.conversations.map(metadata).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||String(b.updatedAt).localeCompare(String(a.updatedAt)))},
    create:async({mode='standard',source='notion',reportBuilder=false}={})=>{if(!['standard','memory'].includes(mode))throw Object.assign(new Error('حالت گفت‌وگو معتبر نیست.'),{status:400});if(!['notion','crm','model','all'].includes(source))throw Object.assign(new Error('منبع معتبر نیست.'),{status:400});const repo=await repository(),now=new Date().toISOString(),c={id:randomUUID(),title:'گفت‌وگوی جدید',createdAt:now,updatedAt:now,messages:[],mode,source,reportBuilder:Boolean(reportBuilder)&&source==='crm',pinned:false};await repo.mutate(data=>data.conversations.push(c));return metadata(c)},
    update:async(id,changes)=>{if(typeof changes.pinned!=='boolean'&&typeof changes.mode!=='string'&&typeof changes.source!=='string'&&changes.attachmentIds===undefined&&changes.title===undefined&&changes.reportBuilder===undefined)throw Object.assign(new Error('تنظیم معتبر نیست.'),{status:400});if(changes.title!==undefined&&(typeof changes.title!=='string'||!changes.title.trim()||changes.title.trim().length>120))throw Object.assign(new Error('نام گفتگو باید بین ۱ تا ۱۲۰ نویسه باشد.'),{status:400});if(changes.pinned!==undefined&&typeof changes.pinned!=='boolean')throw Object.assign(new Error('تنظیم پین معتبر نیست.'),{status:400});if(changes.mode!==undefined&&!['standard','memory'].includes(changes.mode))throw Object.assign(new Error('حالت معتبر نیست.'),{status:400});if(changes.source!==undefined&&!['notion','crm','model','all'].includes(changes.source))throw Object.assign(new Error('منبع معتبر نیست.'),{status:400});if(changes.attachmentIds!==undefined&&(!Array.isArray(changes.attachmentIds)||changes.attachmentIds.length>5||changes.attachmentIds.some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))))throw Object.assign(new Error('فایل‌های انتخاب‌شده معتبر نیستند.'),{status:400});return (await repository()).mutate(data=>{const c=data.conversations.find(c=>c.id===id);if(!c)missing();if(changes.reportBuilder!==undefined){if(typeof changes.reportBuilder!=='boolean')throw Object.assign(new Error('حالت گزارش معتبر نیست.'),{status:400});c.reportBuilder=changes.reportBuilder};if(changes.title!==undefined)c.customTitle=changes.title.trim();if(changes.attachmentIds!==undefined)c.attachmentIds=[...new Set(changes.attachmentIds)];if(changes.pinned!==undefined)c.pinned=changes.pinned;if(changes.mode!==undefined)c.mode=changes.mode;if(changes.source!==undefined){c.requiredSources=[...new Set([...(c.requiredSources||[c.source||'notion']),changes.source])];c.source=changes.source;if(changes.source==='all')c.reportBuilder=false};return metadata(c)})},
    remove:async(id)=>(await repository()).mutate(data=>{const index=data.conversations.findIndex(c=>c.id===id);if(index<0)missing();data.conversations.splice(index,1)}),
    recall:async(excludeId,question)=>{
      const data=await(await repository()).read(),words=String(question).replace(/‌/g,' ').split(/\s+/).filter(w=>w.length>3)
      return data.conversations.filter(c=>c.id!==excludeId&&c.messages.length&&(!accountContext()||(c.requiredSources||[c.source||'notion']).every(source=>hasChatSource({...accountContext(),toolRoles:toolRoles(accountContext())},source)))).map(c=>({c,score:words.filter(w=>c.messages.filter(m=>m.role==='user').some(m=>m.content.includes(w))).length})).sort((a,b)=>b.score-a.score||String(b.c.updatedAt).localeCompare(String(a.c.updatedAt))).slice(0,3).map(({c})=>({title:metadata(c).title,messages:c.messages.filter(m=>m.status!=='pending').slice(-4).map(m=>({role:m.role,content:m.content.slice(0,700)}))}))
    }
  }
}
