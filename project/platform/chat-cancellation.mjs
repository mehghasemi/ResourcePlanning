import {accountContext} from './account-context.mjs'
export const chatSignal=()=>accountContext()?.abortSignal
export function checkChatCancellation(){chatSignal()?.throwIfAborted()}
export function modelSignal(timeout=180000){const signal=chatSignal();return signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout)}
