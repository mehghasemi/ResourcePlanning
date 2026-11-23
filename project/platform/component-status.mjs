import {readExtensions} from './extension-registry.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {componentTitles} from './component-catalog.mjs'
export async function componentStatus(root){
 const baseline=JSON.parse(await fs.readFile(path.join(root,'component-versions.json'),'utf8'))
 let installed={components:{}}
 try{installed=JSON.parse(await fs.readFile(path.join(root,'component-installation.json'),'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
 const titles={...componentTitles,...Object.fromEntries(readExtensions(root).map(tool=>[tool.id,tool.title]))}
 return {coreVersion:baseline.coreVersion||'0.0.0',coreApi:baseline.coreApi,restartRequired:true,components:Object.entries(titles).filter(([id])=>installed.components[id]?.version||baseline.components[id]).map(([id,title])=>({id,title,version:installed.components[id]?.version||baseline.components[id],updatedAt:installed.components[id]?.updatedAt||null,canRollback:Boolean(installed.components[id]?.rollback)}))}
}
export async function componentVersion(root,id){const status=await componentStatus(root);const component=status.components.find(item=>item.id===id);if(!component)throw Error('Unknown component');return component.version}
