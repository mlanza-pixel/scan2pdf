/* Actual app controls, synthetic fixtures and a disposable Library. No user-state access. */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export async function runWorkflowSelfTest({signal, onResult = () => {}, timeoutMs = 20000} = {}) {
  const token = crypto.randomUUID();
  window.__docuScanDiagnosticRuns ||= new Set();
  window.__docuScanDiagnosticRuns.add(token);
  const frame = document.createElement('iframe');
  frame.title = 'Temporary diagnostic app'; frame.setAttribute('aria-hidden','true'); frame.tabIndex = -1;
  // Keep a real layout for canvas/overlay measurements without covering the user's app.
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${Math.max(320,innerWidth)}px;height:900px;border:0`;
  const url = new URL('index.html', document.baseURI); url.searchParams.set('diagnosticRun',token);
  frame.src = url.href;
  const rows = [];
  let win, doc, storage, sourceBytes;
  function stopped() { if (signal?.aborted) throw new DOMException('Stopped','AbortError'); }
  async function until(fn, description) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      stopped(); const value = await fn(); if (value) return value; await delay(30);
    }
    throw new Error(`Timed out: ${description}`);
  }
  const emit = row => { rows.push(row); onResult(row); };
  async function test(id, name, fn) {
    stopped(); const start = performance.now();
    try { await fn(); emit({id,name,status:'pass',kind:'app-workflow',ms:Math.round(performance.now()-start)}); }
    catch(error) {
      if (error.name === 'AbortError') throw error;
      emit({id,name,status:error.name==='NotSupportedError'?'not_run':'fail',kind:'app-workflow',detail:error.message,ms:Math.round(performance.now()-start)});
    }
  }
  const click = selector => { const el=doc.querySelector(selector); assert(el,`Missing control: ${selector}`); assert(!el.disabled,`Disabled control: ${selector}`); el.click(); };
  const navigate = async name => { click(`.bottom-nav__item[data-goto="${name}"]`); await until(()=>doc.querySelector(`#ws-${name}.is-active`),`navigate ${name}`); };
  const upload = async (id, files) => {
    if (typeof win.DataTransfer !== 'function') throw new DOMException('File fixture injection unavailable','NotSupportedError');
    const transfer = new win.DataTransfer(); files.forEach(file=>transfer.items.add(file));
    const el=doc.getElementById(id); assert(el,`Missing file input ${id}`); el.files=transfer.files; el.dispatchEvent(new win.Event('change',{bubbles:true}));
  };
  const snapshot = () => win.__docuScanDiagnosticApp.snapshot();
  try {
    document.body.append(frame);
    await until(()=>{try{return frame.contentWindow?.__docuScanDiagnosticApp;}catch{return false;}},'isolated app boot');
    win=frame.contentWindow; doc=win.document;
    assert(win.__docuScanDiagnosticContext?.token===token,'Fixture isolation was not installed');
    storage = await win.eval(`import(${JSON.stringify(new URL('js/storage.js',frame.src).href)})`);
    assert((await storage.listDocuments()).length===0,'Temporary Library must start empty');
    await test('WF-NAV-01','Rapid navigation across all six workspaces',async()=>{
      for(let i=0;i<5;i++)for(const name of ['home','studio','sign','tools','library','help'])await navigate(name);
      assert(win.__docuScanDiagnosticContext.errors.length===0,'Browser errors during navigation');
    });
    await test('WF-EMPTY-01','Annotation and Apply controls disabled without a PDF',async()=>{
      for(const id of ['btnAddText','btnAddSignature','btnAddWatermark','btnRunToolOp'])assert(doc.getElementById(id)?.disabled,`${id} was enabled without input`);
    });
    await test('WF-STUDIO-01','Import three JPGs using the app file input',async()=>{
      await navigate('studio'); const files=[];
      for(let i=1;i<=3;i++){
        const res=await fetch(`tests/fixtures/photo-${i}.jpg`,{signal}); assert(res.ok,`JPG fixture ${i}: HTTP ${res.status}`);
        files.push(new win.File([await res.arrayBuffer()],`sample-${i}.jpg`,{type:'image/jpeg'}));
      }
      await upload('imagesInput',files); await until(()=>snapshot().studioPages===3,'three imported pages');
    });
    await test('WF-STUDIO-02','Create PDF rapid-click guard and persisted three-page output',async()=>{
      assert(snapshot().studioPages===3,'Three-page import prerequisite failed');
      const before=win.__docuScanDiagnosticContext.prompts.length;
      for(let i=0;i<3;i++)doc.getElementById('btnCreatePdf').click();
      await until(()=>doc.querySelector('#appInputDialog[open]'),'PDF naming dialog');
      assert(doc.querySelectorAll('#appInputDialog').length===1,'Repeated clicks opened duplicate dialogs');
      doc.getElementById('appInputValue').value='Diagnostic three-page PDF.pdf';
      click('#appInputAccept');
      await until(async()=> (await storage.listDocuments()).length>0,'Library save');
      await until(()=>!doc.getElementById('btnCreatePdf').disabled,'Create PDF restored');
      const docs=await storage.listDocuments(); assert(docs.length===1,`Rapid click saved ${docs.length} PDFs`);
      assert(win.__docuScanDiagnosticContext.prompts.length===before,'A blocking browser prompt was used');
      assert(docs[0].name==='Diagnostic three-page PDF','Duplicate PDF extension stored');
      sourceBytes=docs[0].bytes;
      const lib=await win.eval(`import(${JSON.stringify(new URL('js/pdf-editor.js',frame.src).href)})`);
      const {doc:pdf}=await lib.loadExistingPdf(sourceBytes); assert(pdf.getPageCount()===3,'Created PDF does not contain three pages');
    });
    await test('WF-DIALOG-01','Cancel PDF naming without saving and restore Create button',async()=>{
      click('#btnCreatePdf');await until(()=>doc.querySelector('#appInputDialog[open]'),'cancel naming');click('#appInputCancel');
      await until(()=>!doc.getElementById('btnCreatePdf').disabled,'Create restored after cancel');
      assert((await storage.listDocuments()).length===1,'Cancel saved a PDF');
    });
    await test('WF-DIALOG-02','Rapid New Folder clicks create one folder',async()=>{
      await navigate('library');for(let i=0;i<10;i++)doc.getElementById('btnNewFolder').click();
      await until(()=>doc.querySelector('#appInputDialog[open]'),'folder naming');
      assert(doc.querySelectorAll('#appInputDialog').length===1,'Duplicate folder dialogs');
      doc.getElementById('appInputValue').value='Diagnostic folder';click('#appInputAccept');
      await until(()=>!doc.getElementById('btnNewFolder').disabled,'folder action restored');
      const {localState}=await win.eval(`import(${JSON.stringify(new URL('js/local-state.js',frame.src).href)})`);
      assert(JSON.parse(localState.getItem('docuscan-pro.folders')).length===1,'Rapid clicks created duplicate folders');
    });
    await test('WF-LIBRARY-01','Saved PDF appears in Library through actual navigation',async()=>{
      assert(sourceBytes,'Create PDF prerequisite failed'); await navigate('library');
      await until(()=>doc.querySelectorAll('#libraryGrid .library-file-row').length===1,'one Library row');
    });
    await test('WF-SIGN-01','Sign PDF import renders a page',async()=>{
      assert(sourceBytes,'Create PDF prerequisite failed'); await navigate('sign');
      await upload('signPdfInput',[new win.File([sourceBytes],'diagnostic.pdf',{type:'application/pdf'})]);
      await until(()=>snapshot().signBytes && !doc.getElementById('btnAddText').disabled && !doc.getElementById('signCanvasStage').hidden,'Sign rendered');
    });
    await test('WF-SIGN-02','Repeated Text arming plus one page click creates one annotation',async()=>{
      const input=doc.getElementById('textInput');input.value='DIAGNOSTIC TEXT';
      const before=snapshot().signObjects.length;
      for(let i=0;i<5;i++)click('#btnAddText');
      const canvas=doc.getElementById('signCanvas'),r=canvas.getBoundingClientRect();
      canvas.dispatchEvent(new win.MouseEvent('click',{bubbles:true,clientX:r.left+r.width*.3,clientY:r.top+r.height*.3}));
      const created=snapshot().signObjects.length-before;
      assert(created===1,`Expected one placed annotation; found ${created}`);
    });
    await test('WF-SIGN-03','Undo/redo restores object state and overlay count',async()=>{
      const before=snapshot().signObjects.length;assert(before>0,'No annotation to undo');
      click('#btnUndo');await until(()=>snapshot().signObjects.length===before-1,'Undo object count');
      await until(()=>!doc.getElementById('btnRedo').disabled,'Redo enabled after render');
      click('#btnRedo');await until(()=>snapshot().signObjects.length===before,'Redo object count');
      await until(()=>doc.querySelectorAll('#signCanvasStage .object-overlay').length===before,'DOM overlays match restored annotation state');
    });
    await test('WF-TOOLS-01','Rotate through Pages controls and verify output PDF rotation',async()=>{
      assert(sourceBytes,'Create PDF prerequisite failed');await navigate('tools');
      await upload('toolsPdfInput',[new win.File([sourceBytes],'tools-diagnostic.pdf',{type:'application/pdf'})]);
      await until(()=>snapshot().toolsBytes && !doc.getElementById('btnRunToolOp').disabled,'Tools PDF loaded');
      click('[data-group="pages"]');click('[data-tab="rotate"]');click('[data-angle="90"]');
      const before=snapshot().toolsBytes;click('#btnRunToolOp');
      await until(()=>!doc.getElementById('btnRunToolOp').disabled && snapshot().toolsBytes?.some((v,i)=>v!==before[i]),'rotation completed');
      const lib=await win.eval(`import(${JSON.stringify(new URL('js/pdf-editor.js',frame.src).href)})`);const {doc:pdf}=await lib.loadExistingPdf(snapshot().toolsBytes);
      assert(pdf.getPages().every(p=>p.getRotation().angle===90),'Output rotation was not 90 degrees on every page');
    });
    await test('WF-FORMS-01','W-9 text and checkbox controls, save and reopen values',async()=>{
      await navigate('tools');const res=await fetch('tests/fixtures/w9-blank.pdf',{signal});assert(res.ok,`W-9 fixture: HTTP ${res.status}`);
      await upload('toolsPdfInput',[new win.File([await res.arrayBuffer()],'w9.pdf',{type:'application/pdf'})]);
      await until(()=>!doc.getElementById('btnRunToolOp').disabled,'W-9 load');await delay(150);
      click('[data-group="content"]');click('[data-tab="forms"]');click('#btnRunToolOp');
      await until(()=>doc.querySelector('[data-form-field]'),'form fields rendered');
      const lib=await win.eval(`import(${JSON.stringify(new URL('js/pdf-editor.js',frame.src).href)})`);const {doc:pdf}=await lib.loadExistingPdf(snapshot().toolsBytes);const form=pdf.getForm();
      const fields=form.getFields();let textName,checkName;
      for(const f of fields){const name=f.getName();try{form.getTextField(name);textName ||= name;}catch{}try{form.getCheckBox(name);checkName ||= name;}catch{}}
      assert(textName && checkName,'Fixture must contain text and checkbox fields');
      const inputs=[...doc.querySelectorAll('[data-form-field]')];const text=inputs.find(e=>e.dataset.formField===textName),check=inputs.find(e=>e.dataset.formField===checkName);
      assert(text && check,'Missing controls for W-9 fields');assert(check.type==='checkbox','Checkbox PDF field incorrectly rendered as a text box');
      text.value='DIAGNOSTIC SAMPLE ONLY';check.checked=true;click('#btnRunToolOp');
      await until(()=>!doc.getElementById('btnRunToolOp').disabled,'form save');
      const {doc:reopened}=await lib.loadExistingPdf(snapshot().toolsBytes);assert(reopened.getForm().getTextField(textName).getText()===text.value,'Text value not preserved');assert(reopened.getForm().getCheckBox(checkName).isChecked(),'Checkbox value not preserved');
    });
    await test('WF-ERRORS-01','No uncaught errors during fixture workflows',async()=>assert(win.__docuScanDiagnosticContext.errors.length===0,win.__docuScanDiagnosticContext.errors.join('; ').slice(0,400)));
  } finally {
    try { await storage?.closeDiagnosticStore(); } catch {}
    frame.remove();window.__docuScanDiagnosticRuns.delete(token);
    const dbName=`docuscan-selftest-${token}`;
    const cleanup=await new Promise(resolve=>{
      const request=indexedDB.deleteDatabase(dbName); const timer=setTimeout(()=>resolve(false),2000);
      request.onsuccess=()=>{clearTimeout(timer);resolve(true);};request.onerror=request.onblocked=()=>{clearTimeout(timer);resolve(false);};
    });
    emit({id:'WF-CLEANUP-01',name:'Remove disposable diagnostic Library',status:cleanup?'pass':'warning',kind:'isolation',detail:cleanup?'Temporary database deleted':'Temporary test database deletion blocked; user Library was not used',ms:0});
  }
  return rows;
}
