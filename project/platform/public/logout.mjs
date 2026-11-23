export function bindLogout({before=()=>{},onError=message=>alert(message)}={}){
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('barid-account-session'):null
  const leave=()=>{before();document.body.hidden=true;location.replace('/login.html')}
  if(channel)channel.onmessage=event=>{if(event.data==='logout')leave()}
  for(const button of document.querySelectorAll('[data-signout]'))button.onclick=async()=>{
    button.disabled=true
    try{const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error();channel?.postMessage('logout');leave()}catch{onError('خروج تأیید نشد؛ اتصال به سرویس را بررسی کنید و دوباره خروج را بزنید.');button.disabled=false}
  }
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()})
}
