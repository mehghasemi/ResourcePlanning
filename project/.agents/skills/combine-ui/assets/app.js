// Replace this content hook with the requested capability, using shared components.
// This scaffold has no data/API integration or persisted settings.
window.addEventListener('combine:navigate',event=>{
  const host=document.getElementById('tool-content')
  const card=document.createElement('section');card.className='ui-card'
  const empty=document.createElement('div');empty.className='ui-empty'
  const title=document.createElement('h2');title.textContent=event.detail.title
  const note=document.createElement('p');note.className='ui-muted';note.textContent='قالب این بخش آماده است؛ قابلیت تخصصی در این قسمت پیاده‌سازی می‌شود.'
  empty.append(title,note);card.append(empty);host.replaceChildren(card)
})
window.combineShell.start()
