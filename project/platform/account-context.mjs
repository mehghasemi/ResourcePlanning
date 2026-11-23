import {AsyncLocalStorage} from 'node:async_hooks'
const accounts=new AsyncLocalStorage()
export const accountContext=()=>accounts.getStore()||null
export const withAccount=(account,task)=>accounts.run(account,task)
