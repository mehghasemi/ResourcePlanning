// Read-only candidate inventory/change summary, not a package inclusion allowlist.
import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const options={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!['--project','--component','--baseline','--limit'].includes(key)||!value||Object.hasOwn(options,key))throw Error('Use --project ROOT [--component ID] [--baseline BASELINE_APP] [--limit N]');options[key]=value}
if(!options['--project'])throw Error('--project required')
const project=await fs.realpath(options['--project']),app=path.join(project,'platform'),limit=Number(options['--limit']||20)
if(!Number.isInteger(limit)||limit<0||limit>200)throw Error('limit must be 0..200')
const {componentOwner,componentTitles}=await import(pathToFileURL(path.join(app,'component-catalog.mjs')).href)
const component=options['--component']
if(component&&component!=='core'&&!Object.hasOwn(componentTitles,component))throw Error('Unknown component')
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'))
async function metadata(root){const versions=await json(path.join(root,'component-versions.json')),pkg=await json(path.join(root,'package.json'));let installed={components:{}};try{installed=await json(path.join(root,'component-installation.json'))}catch(error){if(error.code!=='ENOENT')throw error};return {reference:versions,corePackageVersion:pkg.version,installed:Object.fromEntries(Object.entries(installed.components||{}).map(([id,entry])=>[id,entry.version])),coreConsistent:pkg.version===versions.coreVersion}}
const excluded=new Set(['node_modules','data','logs','state','backups','outputs','qa','__pycache__','runtime','sessions','history','accounts'])
const rootJson=new Set(['package.json','component-versions.json','crm.config.json','market-office-schema.json'])
function candidate(file){const name=path.posix.basename(file);if(/\.(test|spec)\.[cm]?js$/.test(name)||/^(qa-|verify-|scan-)/.test(name))return false;if(!file.includes('/')&&name.endsWith('.json'))return rootJson.has(name)||name.endsWith('-source.json');return /\.(mjs|cjs|js|css|html|svg|json|woff2|ttf|png|jpg|jpeg|webp|ico|yaml|ps1|cmd|txt|md|py|docx|pdf)$/i.test(name)}
async function inventory(root){const files=new Map();async function walk(dir=''){for(const item of await fs.readdir(path.join(root,dir),{withFileTypes:true})){if(item.name.startsWith('.')||excluded.has(item.name)||item.name.startsWith('data-backup-')||item.name==='component-installation.json'||item.name==='component-pending.json')continue;const file=dir?dir+'/'+item.name:item.name;if(!dir&&item.isDirectory()&&!['public','tools','deployment','instructions','widget-runtime'].includes(item.name))continue;if(item.isSymbolicLink())throw Error('Linked source rejected: '+file);if(item.isDirectory())await walk(file);else if(candidate(file)){const owner=componentOwner(file)||'core';if(!component||owner===component)files.set(file,{owner,sha256:createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')})}}};await walk();return files}
const currentMeta=await metadata(app),current=await inventory(app),counts={};for(const row of current.values())counts[row.owner]=(counts[row.owner]||0)+1
const result={mode:options['--baseline']?'comparison':'inventory',metadata:currentMeta,scope:component||'all',candidateCounts:counts,notice:'Read-only candidate inventory. Review actual installer inventory and dependencies before packaging; local installed versions do not establish target-server state.'}
if(options['--baseline']){const baselineRoot=await fs.realpath(options['--baseline']);await fs.access(path.join(baselineRoot,'component-versions.json'));result.baseline=await metadata(baselineRoot);const before=await inventory(baselineRoot),changes=[];for(const file of new Set([...current.keys(),...before.keys()])){const next=current.get(file),old=before.get(file);if(next?.sha256!==old?.sha256)changes.push({file,owner:next?.owner||old.owner,change:!old?'added':!next?'removed':'modified'})}changes.sort((a,b)=>a.file.localeCompare(b.file));const owners={};for(const change of changes)owners[change.owner]=(owners[change.owner]||0)+1;result.changes={total:changes.length,owners,files:changes.slice(0,limit),omitted:Math.max(0,changes.length-limit)}}
else result.files=[...current.keys()].sort().slice(0,limit)
console.log(JSON.stringify(result,null,2))
