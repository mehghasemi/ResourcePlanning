import {workspaceDay} from './workspace-summary.mjs'
const parts=new Intl.DateTimeFormat('en-US-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'numeric',day:'numeric'});
const label=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric'});
const monthLabel=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'long'});
const orderedLabel=(format,date,keys)=>{const values=format.formatToParts(date);return keys.map(key=>values.find(part=>part.type===key)?.value||'').join(' ');};
const noon=iso=>new Date(iso+'T12:00:00Z');
const dayPart=d=>Number(parts.formatToParts(d).find(p=>p.type==='day').value);
export function persianMonthDays(iso){const d=noon(iso);while(dayPart(d)!==1)d.setUTCDate(d.getUTCDate()-1);const rows=[];do{rows.push(workspaceDay(d));d.setUTCDate(d.getUTCDate()+1);}while(dayPart(d)!==1&&rows.length<32);return rows;}
export function mountPersianDatePicker(ids){
 const dialog=document.createElement('dialog');dialog.className='persian-date-dialog';dialog.setAttribute('aria-label','انتخاب تاریخ شمسی');
 let active,anchor;
 const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const button=(text,action)=>{const b=make('button',text);b.type='button';b.onclick=action;return b;};
 function sync(){for(const id of ids){const input=document.getElementById(id),control=document.getElementById(id+'-picker');const text=input.value?orderedLabel(label,noon(input.value),['day','month','year']):(id==='todo-due'?'انتخاب موعد':'انتخاب روز');control.textContent=text;control.dir='rtl';control.style.unicodeBidi='isolate';control.title=text;control.setAttribute('aria-label',text);control.dataset.selected=String(Boolean(input.value));if(id==='todo-due'){const caption=document.getElementById('todo-date-caption');if(caption){const note=input.dataset.dateRole==='note';control.hidden=note;caption.hidden=note;caption.textContent=input.value?(note?'تاریخ یادداشت: ':'موعد انجام: ')+text:note?'تاریخ یادداشت: امروز؛ از تقویم می‌توانید روز دیگری انتخاب کنید.':'بدون موعد؛ انتخاب تاریخ اختیاری است.';control.title=(note?'انتخاب تاریخ یادداشت':'انتخاب موعد انجام')+(input.value?' ـ '+text:'');control.setAttribute('aria-label',control.title);}}}}
 function choose(value){active.value=value;active.dispatchEvent(new Event('change',{bubbles:true}));sync();dialog.close();document.getElementById(active.id+'-picker').focus();}
 function render(){dialog.replaceChildren();const days=persianMonthDays(anchor),head=make('header'),title=make('strong',orderedLabel(monthLabel,noon(days[0]),['month','year']));
 const move=amount=>{const date=noon(amount<0?days[0]:days.at(-1));date.setUTCDate(date.getUTCDate()+amount);anchor=workspaceDay(date);render();};
 const prev=button('‹',()=>move(-1)),next=button('›',()=>move(1));prev.setAttribute('aria-label','ماه قبل');next.setAttribute('aria-label','ماه بعد');head.append(prev,title,next);dialog.append(head);
 const grid=make('div');grid.className='persian-date-grid';for(const name of ['ش','ی','د','س','چ','پ','ج'])grid.append(make('small',name));for(let n=0;n<(noon(days[0]).getUTCDay()+1)%7;n++)grid.append(make('span'));
 for(const iso of days){const b=button(dayPart(noon(iso)).toLocaleString('fa-IR'),()=>choose(iso));b.setAttribute('aria-label',orderedLabel(label,noon(iso),['day','month','year']));b.setAttribute('aria-pressed',String(iso===active.value));if(iso===workspaceDay(new Date()))b.setAttribute('aria-current','date');grid.append(b);}dialog.append(grid);
 const actions=make('footer');actions.append(button('امروز',()=>choose(workspaceDay(new Date()))),button('پاک کردن',()=>choose('')),button('بستن',()=>dialog.close()));dialog.append(actions);
 }
 document.body.append(dialog);for(const id of ids){const input=document.getElementById(id),control=document.getElementById(id+'-picker');control.onclick=()=>{active=input;anchor=input.value||workspaceDay(new Date());render();dialog.showModal();};input.addEventListener('change',sync);input.form?.addEventListener('reset',()=>queueMicrotask(sync));}sync();return sync;
}
