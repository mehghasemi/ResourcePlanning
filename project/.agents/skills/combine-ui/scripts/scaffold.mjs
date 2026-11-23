import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const skill=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const options={};for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!['--project','--id','--title','--output','--config','--icon'].includes(key)||!value||Object.hasOwn(options,key))throw Error('Use --project ROOT --id ID --title TITLE --output NEW_DIR [--config JSON] [--icon SYMBOL]');options[key]=value}
if(!options['--project']||!options['--id']||!options['--title']||!options['--output'])throw Error('project, id, title and output are required')
const project=await fs.realpath(options['--project']),output=path.resolve(options['--output'])
const relative=path.relative(project,output).split(path.sep)
if(!['outputs','work'].includes(relative[0])||relative.length<2||relative.includes('..')||path.isAbsolute(relative.join(path.sep)))throw Error('Output must be a new directory inside project outputs/ or work/')
const validId=value=>typeof value==='string'&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)&&!/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(value)
if(!validId(options['--id']))throw Error('Use a safe lowercase tool ID')
try{await fs.access(path.join(project,'platform/component-catalog.mjs'))}catch(error){if(error.code!=='ENOENT')throw error;const kit=JSON.parse(await fs.readFile(path.join(project,'combine-kit.json'),'utf8'));if(kit.schema!=='combine.development-kit/1')throw Error('Combine checkout or development kit required')}
const standard=await fs.readFile(path.join(project,'design-system/STANDARD.md'),'utf8');if(!standard.includes('وضعیت: نهایی'))throw Error('Approved design standard not found')
let ancestor=project;for(const part of relative){ancestor=path.join(ancestor,part);try{if((await fs.lstat(ancestor)).isSymbolicLink())throw Error('Linked output path rejected')}catch(error){if(error.code!=='ENOENT')throw error}}
try{await fs.access(output);throw Error('Output exists; never overwritten')}catch(error){if(error.code!=='ENOENT')throw error}
const supplied=options['--config']?JSON.parse(await fs.readFile(options['--config'],'utf8')):{}
const config={id:options['--id'],title:options['--title'],description:supplied.description||'',icon:options['--icon']||supplied.icon||'building',navigation:supplied.navigation||[{id:'overview',title:'نمای کلی',icon:'home'}]}
const sprite=await fs.readFile(path.join(project,'design-system/icons.svg'),'utf8'),icons=new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(match=>match[1])),ids=new Set()
if(typeof config.title!=='string'||!config.title.trim()||typeof config.description!=='string'||!icons.has(config.icon)||!Array.isArray(config.navigation)||!config.navigation.length)throw Error('Invalid title, description, tool icon or navigation')
function validate(item,child=false){if(!item||!validId(item.id)||ids.has(item.id)||typeof item.title!=='string'||!item.title.trim()||(item.icon&&!icons.has(item.icon)))throw Error('Invalid/duplicate navigation ID, title or icon');ids.add(item.id);if(item.children){if(child||!Array.isArray(item.children)||!item.children.length)throw Error('Navigation supports two levels');item.children.forEach(entry=>validate(entry,true))}}
config.navigation.forEach(item=>validate(item))
const escaped=String(config.title).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const template=await fs.readFile(path.join(skill,'assets/page.html'),'utf8')
const html=template.replace('__TITLE__',()=>escaped).replace('<!--__ICONS__-->',()=>sprite.replace('<svg ','<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden" ')).replace('__CONFIG__',()=>JSON.stringify(config).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029'))
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output)
await fs.mkdir(path.join(output,'shared/fonts'),{recursive:true})
await fs.writeFile(path.join(output,'index.html'),html,{flag:'wx'});await fs.writeFile(path.join(output,'tool.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'})
for(const name of ['tokens.css','components.css','icons.svg'])await fs.copyFile(path.join(project,'design-system',name),path.join(output,'shared',name),fs.constants.COPYFILE_EXCL)
for(const name of ['shell.css','shell.js'])await fs.copyFile(path.join(skill,'assets',name),path.join(output,'shared',name),fs.constants.COPYFILE_EXCL)
await fs.copyFile(path.join(skill,'assets/app.js'),path.join(output,'app.js'),fs.constants.COPYFILE_EXCL)
for(const name of ['Dana-Regular.woff2','Dana-Bold.woff2'])await fs.copyFile(path.join(project,'platform/public/fonts',name),path.join(output,'shared/fonts',name),fs.constants.COPYFILE_EXCL)
console.log(JSON.stringify({draft:path.join(output,'index.html'),tool:config.id,registered:false,installed:false,sidebar:config.navigation.flatMap(item=>item.children||[item]).length>1},null,2))
