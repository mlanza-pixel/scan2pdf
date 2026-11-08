import { runWorkflowSelfTest } from './workflow-self-test.js';
/* DocuScan Pro 7.75.0 — isolated, on-device diagnostics; no user document access. */
const $ = id => document.getElementById(id);
const results = [];
let lastReport = null;
let running = false;
let stopRequested = false;
let detailedAudit = null;
let captures = [];
let cacheProbe = null;
let runController = null;
let workflowResults = [];
let currentCheck = null;
const SUITE = "on-device-self-test-5";
const tick = () => new Promise(r => setTimeout(r, 0));
const now = () => performance.now();
const safeError = e => String(e?.message || e).slice(0, 240);
function render() {
  const list = $('selfTestResults');
  list.replaceChildren();
  for (const r of results) {
    const line = document.createElement('div');
    line.className = 'selftest-result';
    const label = document.createElement('span'); label.textContent = `${r.status === 'pass' ? '✓' : r.status === 'fail' ? '✕' : '!' } ${r.name}`;
    const info = document.createElement('span'); info.textContent = `${r.status.toUpperCase()} · ${r.ms} ms${r.detail ? ' · ' + r.detail : ''}`;
    info.className = 'selftest-detail'; line.append(label, info); list.append(line);
  }
  const passed = results.filter(x => x.status === 'pass' && x.kind !== 'workflow-summary').length;
  const failed = results.filter(x => x.status === 'fail' && x.kind !== 'workflow-summary').length;
  const warned = results.filter(x => x.status === 'warning' && x.kind !== 'workflow-summary').length;
  const notRun = results.filter(x => x.status === 'not_run').length;
  $('selfTestSummary').textContent = `${passed} passed · ${failed} failed · ${warned} warnings · ${notRun} not run${running ? ' · running…' : stopRequested ? ' · stopped' : ''}`;
}
async function cacheRepeatTest(count) {
  const started = performance.now();
  const root = new URL('./', location.href);
  const files = ['index.html', 'js/app.js', 'js/device-self-test.js', 'css/device-self-test.css', 'sw.js'];
  const failures = [], sizes = {}, baseline = {}, timings = [];
  const cacheNames = ('caches' in window) ? await caches.keys().catch(()=>[]) : [];
  let swVersion = 'not controlled';
  try { const r=await fetch(new URL('sw.js',root),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(r.ok){const t=await r.text();swVersion=t.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)/)?.[1]||'unknown';} }catch(e){failures.push('SW version: '+safeError(e));}
  for(let i=0;i<count;i++) {
    if(stopRequested)throw new Error('STOP_REQUESTED');
    const t=performance.now();
    for(const f of files) {
      try {
        const url=new URL(f,root);
        const mode=i%2===0?'no-store':'default';
        const controller=new AbortController();
        cacheProbe=controller;
        const timeout=setTimeout(()=>controller.abort(),10000);
        let body;
        try {
          const response=await fetch(url,{cache:mode,signal:controller.signal});
          if(!response.ok)throw new Error('HTTP '+response.status);
          body=await response.text();
        } finally {
          clearTimeout(timeout);
          cacheProbe=null;
        }
        if(body.length<50)throw new Error('unexpectedly small resource');
        if(f==='index.html'&&!body.includes('<title>DocuScan Pro 7.75.0</title>'))throw new Error('stale index version');
        if(f==='js/app.js'&&!body.includes("APP_BUILD = '7.75.0-test5'"))throw new Error('stale app build');
        if(f==='js/device-self-test.js'&&!body.includes(SUITE))throw new Error('stale diagnostics script');
        if (baseline[f] === undefined) { baseline[f] = body; sizes[f] = body.length; }
        else if (baseline[f] !== body) throw new Error(`resource differs from initial network copy (${mode}); reload and retry after the update finishes`);
      } catch(e) {if(stopRequested)throw new Error('STOP_REQUESTED');failures.push(`cycle ${i+1} ${f}: ${safeError(e)}`); }
    }
    timings.push(Math.round(performance.now()-t));
    if(i%5===4)await new Promise(r=>setTimeout(r,0));
    if(failures.length>30)break;
  }
  const summary=`${timings.length}/${count} cycles, ${failures.length} resource failures; SW ${swVersion}; ${cacheNames.length} cache(s); avg ${Math.round(timings.reduce((a,b)=>a+b,0)/Math.max(1,timings.length))} ms/cycle`;
  window.__lastCacheRepeat={cyclesRequested:count,cyclesCompleted:timings.length,failures,files,sizes,swVersion,cacheNames,timings,elapsedMs:Math.round(performance.now()-started)};
  return {status:failures.length?'fail':'pass',detail:summary+(failures.length?'; '+failures.slice(0,2).join('; '):'')};
}
async function check(name, fn, kind = 'component') {
  if (stopRequested) throw new Error('STOP_REQUESTED');
  const t = now(); currentCheck = name;
  $('selfTestSummary').textContent = `Running: ${name}…`;
  await tick();
  let status = 'pass', detail = '', pages, evidence;
  try { const outcome = await fn(); if (outcome?.status) status = outcome.status; detail = outcome?.detail || ''; pages = outcome?.pages; evidence = outcome?.evidence; }
  catch (e) {
    if (stopRequested || e.name === 'AbortError') {
      results.push({name,status:'not_run',kind,detail:'Cancelled before completion; not counted as a pass',ms:Math.round(now()-t)});
      throw new Error('STOP_REQUESTED');
    }
    status = 'fail'; detail = safeError(e);
  }
  results.push({name, status, kind, detail, ...(pages ? {pages} : {}), ...(evidence ? {evidence} : {}), ms: Math.round(now() - t)});
  currentCheck = null; render(); await tick();
}

function imageBlob(index, width=640, height=900, noisy=false) {
  const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height);
  ctx.fillStyle = '#173b67'; ctx.font='bold 48px sans-serif'; ctx.fillText(`PAGE ${index}`, 32,90);
  ctx.fillStyle = '#222'; ctx.font='22px sans-serif'; ctx.fillText('DOCUSCAN SELF TEST — GENERATED',32,155);
  ctx.fillRect(32,200,width-64,2);
  ctx.fillText(`Verification token: TEST-${String(index).padStart(3,'0')}`,32,260);
  if(noisy) { // deterministic high-entropy scan texture; not a blank-page benchmark
    const pixels=ctx.createImageData(width,height);
    let x=(index*2654435761)>>>0;
    for(let i=0;i<pixels.data.length;i+=4){x^=x<<13;x^=x>>>17;x^=x<<5;const v=205+(x>>>0)%51;pixels.data[i]=v;pixels.data[i+1]=v;pixels.data[i+2]=v;pixels.data[i+3]=255;}
    const temp=document.createElement('canvas');temp.width=width;temp.height=height;
    temp.getContext('2d').putImageData(pixels,0,0);
    ctx.globalAlpha=.24;ctx.drawImage(temp,0,0);ctx.globalAlpha=1;
  }
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image encoding failed')),'image/jpeg',.78));
}
async function pdfLib() {
  if (window.PDFLib?.PDFDocument) return window.PDFLib;
  if (!window.__selftestPdfLib) window.__selftestPdfLib = new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src='vendor/pdf-lib.min.js';s.onload=()=>window.PDFLib?.PDFDocument?resolve(window.PDFLib):reject(new Error('pdf-lib not available'));s.onerror=()=>reject(new Error('pdf-lib asset failed'));document.head.append(s);
  });
  return window.__selftestPdfLib;
}
async function testPdf(count, imagePages=true, width=960, height=1280) {
  const {PDFDocument}=await pdfLib();
  const pdf=await PDFDocument.create();
  // Generate one photographic-ish scan per page; unique text, stripes and pixel noise
  // prevent trivially tiny, blank PDFs and expose mobile memory pressure.
  for(let i=1;i<=count;i++) {
    if(stopRequested) throw new Error('Cancelled');
    const page=pdf.addPage([612,792]);
    if(imagePages) {
      const blob=await imageBlob(i,width,height,true);
      const img=await pdf.embedJpg(await blob.arrayBuffer());
      page.drawImage(img,{x:0,y:0,width:612,height:792});
    }
    if(i%3===0) await tick();
  }
  const bytes=await pdf.save();
  const reopened=await PDFDocument.load(bytes);
  if(reopened.getPageCount()!==count) throw new Error(`Expected ${count} pages; got ${reopened.getPageCount()}`);
  const mb=(bytes.byteLength/1048576).toFixed(2);
  if(imagePages && bytes.byteLength<count*18000) throw new Error(`Suspiciously small image PDF: ${mb} MB for ${count} pages`);
  return {detail:`${count} image-backed pages reopened; ${mb} MB; ${width}×${height} pixels per scan`};
}
async function testBundledDocuments() {
  const {PDFDocument}=await pdfLib();
  const read=async path=>{
    if(stopRequested) throw new Error('Cancelled');
    const response=await fetch(new URL(path,document.baseURI));
    if(!response.ok) throw new Error(`Fixture request failed: ${path} (${response.status})`);
    return response.arrayBuffer();
  };
  const output=await PDFDocument.create();
  for(let i=1;i<=3;i++){
    const jpg=await output.embedJpg(await read(`tests/fixtures/photo-${i}.jpg`));
    output.addPage([jpg.width,jpg.height]).drawImage(jpg,{width:jpg.width,height:jpg.height});
  }
  if((await PDFDocument.load(await output.save())).getPageCount()!==3) throw new Error('Expected three JPG pages');
  for(const [pages,name] of [[5,'005'],[10,'010']]){
    const pdf=await PDFDocument.load(await read(`tests/fixtures/sample/ocr_${name}pages_q78.pdf`));
    if(pdf.getPageCount()!==pages) throw new Error(`Expected ${pages} fixture pages`);
  }
  return {detail:'3 bundled JPGs embedded and reopened; bundled 5- and 10-page PDFs loaded in memory'};
}

async function testOcr() {
  const {recognizeText}=await import('./ocr.js');
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=440;
  const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,1200,440);
  c.fillStyle='#111';c.font='bold 64px Arial, sans-serif';
  c.fillText('DOCUSCAN OCR TEST',45,115);c.font='54px Arial, sans-serif';
  c.fillText('INVOICE 48271',45,220);c.fillText('TOTAL 123.45',45,325);
  const result=await recognizeText(canvas,{lang:'eng',signal:runController?.signal});
  if(!result.ok) return {status:'fail',detail:`OCR requested but unavailable or failed: ${result.error}`};
  const normalized=result.text.toUpperCase().replace(/[^A-Z0-9]/g,'');
  const tokens=['DOCUSCAN','OCR','TEST','INVOICE','48271','TOTAL','12345'];
  const matched=tokens.filter(x=>normalized.includes(x));
  const evidence={expectedTokens:tokens,matchedTokens:matched,missingTokens:tokens.filter(x=>!matched.includes(x)),recognizedText:result.text,fixture:'generated heading, invoice and amount'};
  return {status:matched.length===tokens.length?'pass':'fail',detail:`Real OCR: ${matched.length}/${tokens.length} required tokens, including heading; this is token recall, not whole-document accuracy`,evidence};
}
async function testOcrRepeated(count) {
  const {recognizeText}=await import('./ocr.js');
  const pages=[];
  for(let i=1;i<=count;i++) {
    if(stopRequested)throw new Error('STOP_REQUESTED');
    $('selfTestSummary').textContent=`Recognizing sample page ${i} of ${count}…`;
    const image=await imageBlob(i,960,1280,true);
    const expected=`TEST${String(i).padStart(3,'0')}`;
    const started=now();
    const result=await recognizeText(image,{lang:'eng',signal:runController?.signal});
    pages.push({page:i,ms:Math.round(now()-started),matched:result.ok && result.text.toUpperCase().replace(/[^A-Z0-9]/g,'').includes(expected),error:result.ok?null:result.error});
    await tick();
  }
  const matched=pages.filter(page=>page.matched).length;
  return {status:matched===count?'pass':'fail',detail:`${matched}/${count} unique page tokens matched; 960×1280 JPEGs; OCR per page: ${pages.map(page=>page.ms).join(', ')} ms`,pages};
}
async function captureWorkspace(workspace) {
  // iOS browsers reject SVG foreignObject -> canvas export (SecurityError).
  // A deterministic diagnostic layout image is safe and exportable, but is
  // explicitly NOT a pixel-perfect screenshot. Manual screen captures remain
  // necessary to validate actual appearance.
  const panel=$(`ws-${workspace}`);if(!panel)throw new Error('Workspace missing');
  const width=800, height=1100;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#172b4d';ctx.font='bold 30px sans-serif';ctx.fillText(`DocuScan ${workspace} — layout map`,24,44);
  ctx.font='18px sans-serif';ctx.fillText('DIAGNOSTIC MAP — NOT A SCREENSHOT',24,77);
  const rect=panel.getBoundingClientRect();
  const controls=[...panel.querySelectorAll('button,[role="button"],input,select')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0});
  const left=Math.min(0,rect.left),top=Math.min(0,rect.top);
  const scale=Math.min(740/Math.max(rect.width,document.documentElement.clientWidth,1),900/Math.max(rect.height,1));
  ctx.strokeStyle='#68758b';ctx.strokeRect(24,110,Math.min(740,rect.width*scale),Math.min(900,rect.height*scale));
  let clipped=0;
  for(const el of controls){
    const r=el.getBoundingClientRect();
    const x=24+(r.left-left)*scale,y=110+(r.top-top)*scale;
    const outside=r.left<0||r.right>document.documentElement.clientWidth;
    if(outside)clipped++;
    ctx.strokeStyle=outside?'#d93636':'#2878bd';ctx.lineWidth=outside?3:1;
    ctx.strokeRect(x,y,Math.max(1,r.width*scale),Math.max(1,r.height*scale));
    const label=(el.getAttribute('aria-label')||el.textContent||el.id||el.tagName).trim().slice(0,30);
    ctx.fillStyle='#142c48';ctx.font='11px sans-serif';
    if(y>115&&y<1050)ctx.fillText(label,x+2,y+12,Math.max(20,r.width*scale-4));
  }
  ctx.fillStyle='#142c48';ctx.font='16px sans-serif';
  ctx.fillText(`${controls.length} controls; ${clipped} outside viewport; ${document.documentElement.clientWidth}px viewport`,24,1070);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Diagnostic map encoding failed')),'image/png'));
  captures.push({workspace,blob,width,height,bytes:blob.size,kind:'diagnostic-layout-map',clipped});
}
async function captureAllWorkspaces() {
  const original=document.querySelector('.workspace.is-active')?.dataset.workspace||'home';
  const failures=[];
  try {
    for(const ws of ['home','sign','tools','studio','library','help']) {
      if(stopRequested)break;
      document.querySelector(`.bottom-nav__item[data-goto="${ws}"]`)?.click();
      await new Promise(r=>setTimeout(r,120));
      try{await captureWorkspace(ws);}catch(e){failures.push(`${ws}: ${safeError(e)}`);}
    }
  } finally {
    document.querySelector(`.bottom-nav__item[data-goto="${original}"]`)?.click();
  }
  return {status:failures.length?'warning':'pass',detail:`${captures.length}/6 diagnostic layout maps created${failures.length?'; '+failures.join('; ').slice(0,220):''}. Not actual screenshots; manual screenshots required.`};
}
function downloadBlob(blob,filename) {
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
// Detailed on-device audit: only non-destructive navigation is tapped.
// Every other control is inventoried and evaluated for basic visibility, size,
// label and disabled state; it is explicitly NOT claimed to be functionally tested.
async function auditControls() {
  const original=document.querySelector('.workspace.is-active')?.dataset.workspace || 'home';
  const items=[]; const nav=[];
  try {
    for (const workspace of ['home','sign','tools','studio','library','help']) {
      if(stopRequested) break;
      const trigger=document.querySelector(`.bottom-nav__item[data-goto="${workspace}"]`);
      if(!trigger){nav.push({workspace,status:'fail',detail:'Missing navigation control'});continue;}
      trigger.click(); await new Promise(r=>setTimeout(r,65));
      const panel=$(`ws-${workspace}`);
      const active=!!panel?.classList.contains('is-active');
      nav.push({workspace,status:active?'pass':'fail',detail:active?'Navigation clicked and workspace activated':'Workspace did not activate'});
      if(!panel)continue;
      for(const el of panel.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')) {
        const rect=el.getBoundingClientRect();
        const style=getComputedStyle(el);
        const visible=rect.width>0 && rect.height>0 && style.visibility!=='hidden' && style.display!=='none';
        const disabled=!!el.disabled || el.getAttribute('aria-disabled')==='true';
        const label=(el.getAttribute('aria-label')||el.innerText||el.value||el.title||'').trim().replace(/\s+/g,' ').slice(0,90);
        const issues=[];
        if(visible && !label)issues.push('Missing accessible label');
        if(visible && !disabled && (rect.width<44 || rect.height<44))issues.push(`Small touch target ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        if(visible && (rect.left< -2 || rect.right>innerWidth+2))issues.push('Outside viewport horizontally');
        items.push({workspace,id:el.id||null,label:label||'(unlabeled)',visible,disabled,issues,functionalTest:'not run — potentially destructive or requires fixture'});
      }
    }
  } finally {
    const trigger=document.querySelector(`.bottom-nav__item[data-goto="${original}"]`);
    if(trigger)trigger.click();
  }
  const defects=items.filter(x=>x.issues.length);
  return {nav,items,defects};
}
function collectDevice() {
  return {userAgent:navigator.userAgent, platform:navigator.platform, language:navigator.language, viewport:{width:innerWidth,height:innerHeight,devicePixelRatio:devicePixelRatio}, screen:{width:screen.width,height:screen.height}, online:navigator.onLine, standalone:matchMedia('(display-mode: standalone)').matches || navigator.standalone===true, memoryApiAvailable:typeof performance.memory!=='undefined', hardwareConcurrency:navigator.hardwareConcurrency||null};
}
async function start() {
  if(running) return;
  running=true;stopRequested=false;results.length=0;lastReport=null;detailedAudit=null;captures=[];workflowResults=[];runController=new AbortController();
  $('selfTestRun').disabled=true;$('selfTestStop').disabled=false;
  $('selfTestExport').disabled=true;$('selfTestCopy').disabled=true;$('selfTestScreenshots').disabled=true;
  const mode=$('selfTestMode').value;const started=new Date().toISOString();const startTime=now();
  const exceptions=[];
  const onError=e=>exceptions.push(safeError(e.error||e.message));
  const onReject=e=>exceptions.push(safeError(e.reason));
  window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onReject);
  try {
    await check('App workspaces and controls',()=>{
      const ids=['ws-home','ws-sign','ws-tools','ws-studio','ws-library','ws-help'];
      const missing=ids.filter(id=>!$(id));
      if(missing.length)throw new Error('Missing '+missing.join(', '));
      return {detail:'6 workspaces present (not a tap-through test)'};
    });
    if($('selfTestDetailed')?.checked) {
      await check('Live navigation tap-through and button inventory',async()=>{
        detailedAudit=await auditControls();
        const failed=detailedAudit.nav.filter(x=>x.status==='fail');
        const issues=detailedAudit.defects.length;
        return {status:failed.length?'fail':issues?'warning':'pass',detail:`${detailedAudit.nav.length} navigation taps, ${detailedAudit.items.length} controls inventoried, ${issues} accessibility/layout findings; other controls NOT clicked. ${failed.length} navigation failures`};
      });
    }
    await check('Viewport and horizontal overflow',()=>{
      const width=document.documentElement.clientWidth;
      const over=document.documentElement.scrollWidth-width;
      return over>2?{status:'warning',detail:`${over}px page overflow`}:{detail:`${width}px viewport; no page overflow`};
    });
    const repeatCount=Number($('selfTestRepeat')?.value||0);
    window.__lastCacheRepeat=null;
    if(repeatCount)await check(`Cache/resource consistency (${repeatCount} cycles)`,()=>cacheRepeatTest(repeatCount));
    await check('Canvas and image encoding',async()=>{
      const b=await imageBlob(1);if(b.size<1000)throw new Error('Encoded image too small');return {detail:`JPEG ${Math.round(b.size/1024)} KB`};
    });
    await check('Temporary storage round trip',()=>{
      const k='docuscan-selftest-temp-'+crypto.randomUUID();const v='test-'+Date.now();
      try{localStorage.setItem(k,v);if(localStorage.getItem(k)!==v)throw new Error('Read mismatch');}
      finally{localStorage.removeItem(k);}return {detail:'Temporary key deleted'};
    });
    if(mode==='quick') results.push({name:'Real OCR and PDF component tests',status:'not_run',kind:'component',detail:'Quick mode does not run OCR or PDF processing',ms:0});
    if(mode!=='quick') {
      await check('Bundled JPG and PDF fixtures (in memory)',testBundledDocuments);
      await check('5-page realistic scan PDF round trip',()=>testPdf(5));
      await check('10-image PDF create and reopen',()=>testPdf(10));
      await check('Actual OCR recognition accuracy',testOcr);
    }
    if(mode==='stress') {
      await check('25 generated images',async()=>{let total=0;for(let i=1;i<=25;i++){total+=(await imageBlob(i)).size;if(i%5===0)await tick();}return{detail:`25 images; ${Math.round(total/1024)} KB`};});
      await check('50 generated images',async()=>{let total=0;for(let i=1;i<=50;i++){if(stopRequested)throw new Error('Cancelled');total+=(await imageBlob(i)).size;if(i%5===0)await tick();}return{detail:`50 images; ${Math.round(total/1024)} KB`};});
      await check('OCR repeated recognition (16 sample pages)',()=>testOcrRepeated(16));
      await check('50-page image-backed PDF round trip',()=>testPdf(50));
      await check('100-page image-backed PDF round trip',()=>testPdf(100));
    }
    if ($('selfTestWorkflows')?.checked) {
      await check('Isolated application workflows and chaos checks', async () => {
        workflowResults = await runWorkflowSelfTest({signal:runController.signal,onResult: row => {
          results.push({...row,name:`Workflow: ${row.name}`}); render();
        }});
        const failures=workflowResults.filter(x=>x.status==='fail').length;
        const notRun=workflowResults.filter(x=>x.status==='not_run').length;
        return {status:failures?'fail':notRun?'warning':'pass',detail:`${workflowResults.length} fixture workflow checks; ${failures} failed; ${notRun} not run. Native camera/share/print are separate manual checks.`};
      }, 'workflow-summary');
    } else {
      results.push({name:'Fixture application workflows',status:'not_run',kind:'app-workflow',detail:'Opt-in workflow checks were not selected',ms:0});
    }
    for (const name of ['Physical camera capture','Native share/email delivery','Native print','VoiceOver/TalkBack review','Every remaining feature button and sub-step']) {
      results.push({name,status:'not_run',kind:'manual-or-uncovered',detail:'Not exercised by this on-device run; requires separate workflow or device evidence',ms:0});
    }
    if($('selfTestCapture')?.checked) await check('Automatic diagnostic layout maps',captureAllWorkspaces);
    await check('Uncaught browser errors during test',()=>exceptions.length?{status:'warning',detail:exceptions.slice(0,3).join('; ')}:{detail:'No uncaught errors observed'});
  } catch(e) {
    if(String(e.message)!=='STOP_REQUESTED') results.push({name:'Test runner',status:'fail',detail:safeError(e),ms:0});
  } finally {
    window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject);
    running=false;
    const device=collectDevice();
    const hardware=/iPad/i.test(device.userAgent) || (/Mac/i.test(device.platform) && navigator.maxTouchPoints>1) ? 'ipad' : /iPhone/i.test(device.userAgent) ? 'iphone' : /Android/i.test(device.userAgent) ? 'android' : 'desktop';
    const browser=/CriOS|Chrome/i.test(device.userAgent) ? 'chrome' : /FxiOS|Firefox/i.test(device.userAgent) ? 'firefox' : /Safari/i.test(device.userAgent) ? 'safari' : 'browser';
    const source=`${hardware}-${device.standalone?'home-screen':browser}`;
    lastReport={schemaVersion:2,build:window.__docuScanBuild?.build||'unknown',buildUtc:window.__docuScanBuild?.buildUtc||'unknown',diagnosticBuild:'self-test-5',source,app:'DocuScan Pro',version:'7.75.0',cancelled:stopRequested,testSuite:SUITE,workflowResults,coverage:{allButtonsCertified:false,workflowChecksSelected:!!$('selfTestWorkflows')?.checked,inventoryIsNotFunctionalCoverage:true},counts:{passed:results.filter(x=>x.status==='pass'&&x.kind!=='workflow-summary').length,failed:results.filter(x=>x.status==='fail'&&x.kind!=='workflow-summary').length,warnings:results.filter(x=>x.status==='warning'&&x.kind!=='workflow-summary').length,notRun:results.filter(x=>x.status==='not_run').length},mode,detailedAudit,cacheRepeat:window.__lastCacheRepeat||null,screenshots:captures.map(x=>({kind:x.kind,workspace:x.workspace,width:x.width,height:x.height,bytes:x.bytes,filename:`docuscan-${x.workspace}.png`})),started,finished:new Date().toISOString(),durationMs:Math.round(now()-startTime),device,results:[...results],limitations:['Uses generated and bundled test files; no user documents','PDF tests exercise pdf-lib directly, not every app editing workflow','OCR accuracy tested on generated English fixtures only; no certification for real scans or other languages','Opt-in workflow tests save only to a disposable isolated diagnostic Library','Detailed audit taps navigation only; other buttons are inventoried but not functionally clicked','Fixture imports dispatch file-input events; no native file picker, camera, share, print or download is certified','Generated images are diagnostic layout maps, NOT screenshots; actual screenshots must be captured manually or by Playwright']};
    $('selfTestRun').disabled=false;$('selfTestStop').disabled=true;
    window.__docuScanLastSelfTest = lastReport;
    $('selfTestExport').disabled=false;$('selfTestCopy').disabled=false;$('selfTestScreenshots').disabled=captures.length===0;
    render();
  }
}
function requestStop() {
  stopRequested=true;
  cacheProbe?.abort();
  runController?.abort();
  $('selfTestSummary').textContent='Stopping after current check…';
}
function show() {
  $('selfTestDialog').hidden=false;
  $('selfTestClose').focus();
}
function hide() {
  if(running)requestStop();
  $('selfTestDialog').hidden=true;
  $('btnAbout').focus();
}
document.addEventListener('click',e=>{const trigger=e.target.closest('#selfTestOpen');if(trigger){trigger.closest('.toast')?.remove();show();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('selfTestDialog').hidden)hide();});
$('selfTestClose').addEventListener('click',hide);
$('selfTestRun').addEventListener('click',start);
$('selfTestStop').addEventListener('click',requestStop);
$('selfTestExport').addEventListener('click',()=>{if(!lastReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`docuscan-device-test-${new Date().toISOString().replace(/[:.]/g,'-')}-${lastReport.source}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('selfTestCopy').addEventListener('click',async()=>{if(!lastReport)return;const r=lastReport;const summary=`DocuScan Pro ${r.version} | ${r.mode} | ${r.device.viewport.width}x${r.device.viewport.height}\n${r.results.map(x=>`${x.status.toUpperCase()}: ${x.name} (${x.ms}ms) ${x.detail}`).join('\n')}`;try{await navigator.clipboard.writeText(summary);$('selfTestCopy').textContent='Copied!';setTimeout(()=>$('selfTestCopy').textContent='Copy Results',1800);}catch(e){$('selfTestSummary').textContent='Copy blocked; use Download JSON instead';}});

$('selfTestScreenshots').addEventListener('click',()=>{
  if(!captures.length)return;
  for(const shot of captures) downloadBlob(shot.blob,`docuscan-v7.75.0-${shot.workspace}.png`);
  $('selfTestSummary').textContent+=` · ${captures.length} layout-map downloads requested (not screenshots)`;
});
