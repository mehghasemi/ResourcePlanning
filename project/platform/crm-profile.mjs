import fs from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const run=promisify(execFile)
export const profilePath=new URL('./.crm-profile.json',import.meta.url)
export async function windowsSid(){
  const {stdout}=await run('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true,timeout:5000})
  const sid=stdout.match(/S-1-\d+(?:-\d+)+/i)?.[0]
  if(!sid)throw new Error('Windows identity could not be verified.')
  return sid
}
export async function verifyProfile(read){
  let profile
  try{profile=JSON.parse(await fs.readFile(profilePath,'utf8'))}catch{throw new Error('Open setup-wizard.cmd to register your own CRM profile first.')}
  if(profile.windowsSid!==await windowsSid())throw new Error('This profile belongs to another Windows user. Run setup-wizard.cmd with your own account.')
  const identity=await read('WhoAmI')
  if(identity.UserId?.toLowerCase()!==profile.crmUserId?.toLowerCase())throw new Error('CRM identity does not match the confirmed profile. Access was stopped.')
  return profile
}
