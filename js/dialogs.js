/* Native, accessible modal UI without blocking the JavaScript event loop. */
let active=null;
function ask({title,value='',options,message='',accept='Save',input=true,maxLength=120,returnFocus}) {
  if(active)return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
    const previous=returnFocus||document.activeElement,dialog=document.createElement('dialog'),form=document.createElement('form');
    dialog.id='appInputDialog';dialog.className='app-input-dialog';form.method='dialog';
    const heading=document.createElement('h2');heading.id='appInputTitle';heading.textContent=title;dialog.setAttribute('aria-labelledby',heading.id);form.append(heading);
    if(message){const p=document.createElement('p');p.textContent=message;form.append(p);}
    let field;
    if(input){const label=document.createElement('label');label.className='field';label.textContent=options?'Choose an option':'Name';field=document.createElement(options?'select':'input');field.id='appInputValue';field.className='field__control';
      if(options)for(const item of options){const option=document.createElement('option');option.value=item.value;option.textContent=item.label;field.append(option);}
      else{field.type='text';field.maxLength=maxLength;field.autocomplete='off';}
      field.value=value;label.append(field);form.append(label);
    }
    const actions=document.createElement('div');actions.className='app-input-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.id='appInputCancel';cancel.className='btn';cancel.textContent='Cancel';
    const save=document.createElement('button');save.type='submit';save.id='appInputAccept';save.className='btn btn--primary';save.textContent=accept;actions.append(cancel,save);form.append(actions);dialog.append(form);document.body.append(dialog);active=dialog;
    let settled=false;
    const finish=result=>{if(settled)return;settled=true;dialog.close();dialog.remove();active=null;resolve(result);requestAnimationFrame(()=>{if(previous?.isConnected)previous.focus({preventScroll:true});});};
    cancel.addEventListener('click',()=>finish(null));dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});form.addEventListener('submit',e=>{e.preventDefault();finish(field?field.value:'confirmed');});
    try{dialog.showModal();field?.focus();if(field instanceof HTMLInputElement)field.select();}catch(e){active=null;dialog.remove();reject(e);}
  });
}
export const askText=(title,value='',options={})=>ask({title,value,...options});
export const chooseOption=(title,options)=>ask({title,options,value:options[0]?.value||'',accept:'Choose'});
export const confirmAction=async(title,message)=>(await ask({title,message,input:false,accept:'Replace'}))!==null;
