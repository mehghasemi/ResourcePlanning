const eye='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
const eyeOff='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 3.9M6.2 6.2A22 22 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.8-1.8M10 10a3 3 0 0 0 4 4"/></svg>'
export function togglePasswordVisibility(input){input.type=input.type==='password'?'text':'password';return input.type==='text'}
export function enhancePasswordFields(root){
  for(const input of root.querySelectorAll('input[type="password"]')){
    if(input.parentElement.classList.contains('password-field'))continue
    const wrapper=document.createElement('span');wrapper.className='password-field';input.before(wrapper);wrapper.append(input);const button=document.createElement('button');button.type='button';button.className='password-toggle';button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','نمایش رمز عبور');button.title='نمایش رمز عبور';button.innerHTML=eye;wrapper.append(button)
    const paint=visible=>{button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'مخفی‌کردن رمز عبور':'نمایش رمز عبور');button.title=visible?'مخفی‌کردن رمز عبور':'نمایش رمز عبور';button.innerHTML=visible?eyeOff:eye}
    button.onclick=event=>{event.preventDefault();const start=input.selectionStart,end=input.selectionEnd;paint(togglePasswordVisibility(input));input.focus();if(start!==null)input.setSelectionRange(start,end)}
    input.form?.addEventListener('submit',()=>{input.type='password';paint(false)},{capture:true})
  }
  for(const input of root.querySelectorAll('input[name="login"],input[name="username"]')){input.spellcheck=false;input.setAttribute('autocapitalize','none');input.setAttribute('autocorrect','off')}
}
