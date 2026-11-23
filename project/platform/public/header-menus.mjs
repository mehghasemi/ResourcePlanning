// Anchored, non-modal header menus. Shared account/password/logout APIs stay separate.
export function bindHeaderMenus(pairs,{onOpen=()=>{}}={}){
 const items=pairs.map(([button,panel])=>({button,panel})).filter(x=>x.button&&x.panel)
 function close({focus=false}={}){for(const {button,panel}of items){const wasOpen=!panel.hidden;panel.hidden=true;button.setAttribute('aria-expanded','false');if(wasOpen&&focus)button.focus()}}
 for(const item of items){const {button,panel}=item;button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','true');button.onclick=()=>{const open=panel.hidden;close();if(open){panel.hidden=false;button.setAttribute('aria-expanded','true');onOpen(panel)}}}
 document.addEventListener('click',event=>{if(!items.some(({button,panel})=>button.contains(event.target)||panel.contains(event.target)))close()})
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))close({focus:true})})
 return {close,open(id){const item=items.find(x=>x.panel.id===id);if(item?.panel.hidden)item.button.click()}}
}
