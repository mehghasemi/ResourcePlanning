import {spawn} from 'node:child_process'
import {chatSignal,checkChatCancellation} from './chat-cancellation.mjs'
import {crmTransportUrl,crmResponseLimit} from './crm-read-policy.mjs'
export {crmReadUrl} from './crm-read-policy.mjs'
// Explicit per-user Windows credentials, sent only through stdin. No default
// Windows account, no redirects, no arbitrary hosts, methods or shell snippets.
const script=`$ErrorActionPreference='Stop';try{
  [Console]::InputEncoding=New-Object Text.UTF8Encoding($false);[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
  $x=([Console]::In.ReadToEnd() | ConvertFrom-Json)
  $uri=[Uri]$x.url
  if($uri.Scheme -ne 'https' -or $uri.Host -ne 'crm.baridsoft.ir' -or $uri.Port -ne 443 -or !$uri.AbsolutePath.StartsWith('/Main/api/data/v9.1/')){throw 'Invalid target'}
  $req=[Net.HttpWebRequest]::Create($uri);$req.Method='GET';$req.AllowAutoRedirect=$false;$req.Timeout=35000;$req.ReadWriteTimeout=35000
  $req.Accept='application/json';$req.Headers.Add('Prefer','odata.maxpagesize=50,odata.include-annotations="OData.Community.Display.V1.FormattedValue"')
  $username=[string]$x.username;$domain='';if($username.Contains([string][char]92)){$pieces=$username.Split([char]92,2);$domain=$pieces[0];$username=$pieces[1]}
  $req.UseDefaultCredentials=$false;$req.Credentials=New-Object Net.NetworkCredential($username,[string]$x.password,$domain)
  try{$res=$req.GetResponse()}catch [Net.WebException]{if($_.Exception.Response){[Console]::Out.Write(('{"httpStatus":'+[int]$_.Exception.Response.StatusCode+'}'));exit 0};throw}
  $maxCharacters=[int]$x.maxCharacters;if($maxCharacters -notin @(5000000,18874368)){throw 'Invalid response bound'}
  $reader=New-Object IO.StreamReader($res.GetResponseStream(),[Text.Encoding]::UTF8);$buffer=New-Object char[] 8192;$builder=New-Object Text.StringBuilder
  while(($count=$reader.Read($buffer,0,$buffer.Length)) -gt 0){if($builder.Length+$count -gt $maxCharacters){$reader.Dispose();$res.Dispose();[Console]::Out.Write('{"responseTooLarge":true}');exit 0};[void]$builder.Append($buffer,0,$count)}
  $reader.Dispose();$res.Dispose();[Console]::Out.Write($builder.ToString())
}catch{exit 1}`
export async function crmUserGet(connection,resource,params={}){
  checkChatCancellation()
  if(process.platform!=='win32')throw new Error('اتصال فعلی CRM به سرویس ویندوز نیاز دارد.')
  if(!connection||typeof connection.username!=='string'||!connection.username.trim()||typeof connection.password!=='string'||!connection.password)throw Object.assign(new Error('ابتدا اتصال CRM حساب خودتان را تنظیم کنید.'),{status:428})
  const url=crmTransportUrl(resource,params),limit=crmResponseLimit(resource,params)
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']}),chunks=[];let bytes=0,settled=false
    const signal=chatSignal(),abort=()=>{child.kill();finish(signal.reason)}
    const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(err)reject(err);else resolve(value)}
    const timer=setTimeout(()=>{child.kill();finish(new Error('خواندن CRM به پایان نرسید؛ اتصال شبکه را بررسی کنید.'))},40000)
    signal?.addEventListener('abort',abort,{once:true})
    child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>limit.bytes){child.kill();finish(Object.assign(new Error('پاسخ CRM بیش از ظرفیت مجاز است.'),{status:413,code:'crm_response_too_large'}))}else chunks.push(chunk)})
    child.stderr.resume();child.stdin.on('error',()=>{});child.on('error',()=>finish(new Error('سرویس اتصال CRM اجرا نشد.')))
    child.on('close',code=>{if(code!==0)return finish(new Error('خواندن CRM ناموفق بود؛ اعتبارنامه و شبکه را بررسی کنید.'));try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(data.responseTooLarge)return finish(Object.assign(new Error('پاسخ CRM بیش از ظرفیت مجاز این نوع درخواست است.'),{status:413,code:'crm_response_too_large'}));if(data.httpStatus){const e=Object.assign(new Error(`CRM returned HTTP ${data.httpStatus}. Access was stopped.`),{status:data.httpStatus===401?428:data.httpStatus===403?403:502});return finish(e)}finish(null,data)}catch{finish(new Error('پاسخ معتبر از CRM دریافت نشد.'))}})
    child.stdin.end(JSON.stringify({url,username:connection.username,password:connection.password,maxCharacters:limit.characters}),'utf8')
  })
}
export async function validateCrmConnection({username,password},read=crmUserGet){
  if(typeof username!=='string'||username.trim().length<2||username.length>200||typeof password!=='string'||!password||password.length>256)throw Object.assign(new Error('نام کاربری و رمز CRM معتبر نیست.'),{status:400})
  const candidate={username:username.trim(),password},identity=await read(candidate,'WhoAmI')
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(identity.UserId||''))throw new Error('هویت معتبر CRM دریافت نشد.')
  // Reading only this user's record checks that the supplied login really maps
  // to WhoAmI, without treating successful network auth as a shared CRM identity.
  const rows=await read(candidate,'systemusers',{'$select':'systemuserid,fullname,domainname','$filter':`systemuserid eq ${identity.UserId}`,'$top':'1'})
  const record=rows.value?.[0],normalize=s=>String(s||'').trim().replace(/^.*\\/,'').split('@')[0].toLowerCase()
  if(!record||normalize(record.domainname)!==normalize(candidate.username))throw new Error('نام کاربری واردشده با هویت CRM تأییدشده یکسان نیست.')
  return {...candidate,userId:identity.UserId.toLowerCase(),displayName:record.fullname||candidate.username,verifiedAt:new Date().toISOString()}
}
export function userCrmReader(connection,read=crmUserGet){return async(resource,params={})=>{checkChatCancellation();const result=await read(connection,resource,params);checkChatCancellation();if(resource==='WhoAmI'&&result.UserId?.toLowerCase()!==connection.userId)throw new Error('هویت CRM تغییر کرده است؛ خواندن متوقف شد.');return result}}
