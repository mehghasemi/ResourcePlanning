// Shared starter shell; no network, credentials or invented version values.
;(()=>{
  const $=id=>document.getElementById(id)
  const config=JSON.parse($('tool-config').textContent)
  const leaves=config.navigation.flatMap(item=>item.children||[item])
  const sidebarEnabled=leaves.length>1
  const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');svg.classList.add('ui-icon');svg.setAttribute('aria-hidden','true');use.setAttribute('href',(config.iconSprite||'')+'#'+name);svg.append(use);return svg}
  const buttons=new Map(),groups=[]
  $('cs-title').textContent=config.title;$('cs-breadcrumb-tool').textContent=config.title;$('cs-description').textContent=config.description||''
  function button(item){const node=document.createElement('button');node.type='button';node.className='cs-nav-item';node.append(icon(item.icon||'home'),document.createTextNode(item.title));return node}
  for(const item of config.navigation){
    const node=button(item)
    if(item.children){const wrap=document.createElement('div');wrap.id='cs-group-'+item.id;wrap.className='cs-submenu';wrap.hidden=true;node.setAttribute('aria-controls',wrap.id);node.setAttribute('aria-expanded','false');const arrow=icon('chevron');arrow.classList.add('cs-chevron');node.append(arrow);node.onclick=()=>{wrap.hidden=!wrap.hidden;node.setAttribute('aria-expanded',String(!wrap.hidden))};for(const child of item.children){const childButton=button(child);buttons.set(child.id,childButton);childButton.onclick=()=>navigate(child.id);wrap.append(childButton)}groups.push({button:node,wrap,ids:item.children.map(child=>child.id)});$('cs-navigation').append(node,wrap)}
    else{buttons.set(item.id,node);node.onclick=()=>navigate(item.id);$('cs-navigation').append(node)}
  }
  if(!sidebarEnabled){$('cs-sidebar').hidden=true;$('cs-open-menu').hidden=true;$('cs-layout').classList.add('cs-simple')}
  function navigate(id){const item=leaves.find(leaf=>leaf.id===id);if(!item)return;for(const[key,node]of buttons){if(key===id)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current')};for(const group of groups){const active=group.ids.includes(id);group.button.classList.toggle('is-active',active);if(active){group.wrap.hidden=false;group.button.setAttribute('aria-expanded','true')}}$('cs-page-title').textContent=item.title;$('cs-breadcrumb-page').textContent=item.title;closeMenu();window.dispatchEvent(new CustomEvent('combine:navigate',{detail:{id:item.id,title:item.title}}))}
  let returnFocus
  function openMenu(){returnFocus=document.activeElement;$('cs-sidebar').classList.add('cs-open');$('cs-sidebar').setAttribute('role','dialog');$('cs-sidebar').setAttribute('aria-modal','true');$('cs-scrim').hidden=false;$('cs-open-menu').setAttribute('aria-expanded','true');document.querySelector('.cs-main').inert=true;document.querySelector('.cs-header').inert=true;document.body.style.overflow='hidden';$('cs-close-menu').focus()}
  function closeMenu(){if(!$('cs-sidebar').classList.contains('cs-open'))return;$('cs-sidebar').classList.remove('cs-open');$('cs-sidebar').removeAttribute('role');$('cs-sidebar').removeAttribute('aria-modal');$('cs-scrim').hidden=true;$('cs-open-menu').setAttribute('aria-expanded','false');document.querySelector('.cs-main').inert=false;document.querySelector('.cs-header').inert=false;document.body.style.overflow='';returnFocus?.focus()}
  $('cs-open-menu').onclick=openMenu;$('cs-close-menu').onclick=closeMenu;$('cs-scrim').onclick=closeMenu
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))closeMenu();if(event.key==='Tab'&&$('cs-sidebar').classList.contains('cs-open')){const nodes=[...$('cs-sidebar').querySelectorAll('button')].filter(node=>node.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}})
  matchMedia('(min-width:768px)').addEventListener('change',event=>{if(event.matches)closeMenu()})
  $('cs-settings').onclick=()=>$('cs-settings-dialog').showModal?.();if($('cs-account-dialog'))$('cs-account').onclick=()=>$('cs-account-dialog').showModal?.()
  document.querySelectorAll('[data-close-dialog]').forEach(node=>node.onclick=()=>node.closest('dialog').close())
  window.combineShell={start:()=>navigate(leaves[0].id),navigate,setIdentity(user){$('cs-account').setAttribute('aria-label',user.name);$('cs-account').title=user.name},setVersion(version){$('cs-version').textContent=version||'';$('cs-version').hidden=!version},status(message){$('cs-status').textContent=message||'';$('cs-status').hidden=!message}}
})()
