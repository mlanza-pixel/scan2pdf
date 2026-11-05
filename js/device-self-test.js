/* DocuScan Pro 7.71 — isolated, on-device diagnostics; no user document access. */
const $ = id => document.getElementById(id);
const results = [];
let lastReport = null;
let running = false;
let stopRequested = false;
let detailedAudit = null;
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
  const passed = results.filter(x => x.status === 'pass').length;
  const failed = results.filter(x => x.status === 'fail').length;
  const warned = results.filter(x => x.status === 'warning').length;
  $('selfTestSummary').textContent = `${passed} passed · ${failed} failed · ${warned} warnings${running ? ' · running…' : ''}`;
}
async function check(name, fn) {
  if (stopRequested) throw new Error('STOP_REQUESTED');
  const t = now();
  let status = 'pass', detail = '';
  try { const outcome = await fn(); if (outcome?.status) status = outcome.status; detail = outcome?.detail || ''; }
  catch (e) { status = 'fail'; detail = safeError(e); }
  results.push({name, status, detail, ms: Math.round(now() - t)});
  render(); await tick();
}
function imageBlob(index, width=640, height=900) {
  const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height);
  ctx.fillStyle = '#173b67'; ctx.font='bold 48px sans-serif'; ctx.fillText(`PAGE ${index}`, 32,90);
  ctx.fillStyle = '#222'; ctx.font='22px sans-serif'; ctx.fillText('DOCUSCAN SELF TEST — GENERATED',32,155);
  ctx.fillRect(32,200,width-64,2);
  ctx.fillText(`Verification token: TEST-${String(index).padStart(3,'0')}`,32,260);
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image encoding failed')),'image/jpeg',.78));
}
async function pdfLib() {
  if (window.PDFLib?.PDFDocument) return window.PDFLib;
  if (!window.__selftestPdfLib) window.__selftestPdfLib = new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src='vendor/pdf-lib.min.js';s.onload=()=>window.PDFLib?.PDFDocument?resolve(window.PDFLib):reject(new Error('pdf-lib not available'));s.onerror=()=>reject(new Error('pdf-lib asset failed'));document.head.append(s);
  });
  return window.__selftestPdfLib;
}
async function testPdf(count, verifyImages=false) {
  const {PDFDocument}=await pdfLib();
  const pdf=await PDFDocument.create();
  for(let i=1;i<=count;i++) {
    if(stopRequested) throw new Error('Cancelled');
    const page=pdf.addPage([612,792]);
    if(verifyImages) {
      const img=await pdf.embedJpg(await (await imageBlob(i,320,450)).arrayBuffer());
      page.drawImage(img,{x:65,y:100,width:480,height:675});
    }
    if(i%10===0) await tick();
  }
  const bytes=await pdf.save();
  const reopened=await PDFDocument.load(bytes);
  if(reopened.getPageCount()!==count) throw new Error(`Expected ${count} pages; got ${reopened.getPageCount()}`);
  return {detail:`${count} pages verified; ${Math.round(bytes.byteLength/1024)} KB`};
}
// Detailed on-device audit: only non-destructive navigation is tapped.
// Every other control is inventoried and evaluated for basic visibility, size,
// label and disabled state; it is explicitly NOT claimed to be functionally tested.
async function auditControls() {
  const original=document.querySelector('.workspace.is-active')?.dataset.workspace || 'home';
  const items=[]; const nav=[];
  const overlay=$('selfTestDialog');
  const before=overlay.hidden;
  try {
    overlay.hidden=true; // allow real browser layout measurements, no user documents touched
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
    overlay.hidden=before;
  }
  const defects=items.filter(x=>x.issues.length);
  return {nav,items,defects};
}
function collectDevice() {
  return {userAgent:navigator.userAgent, platform:navigator.platform, language:navigator.language, viewport:{width:innerWidth,height:innerHeight,devicePixelRatio:devicePixelRatio}, screen:{width:screen.width,height:screen.height}, online:navigator.onLine, standalone:matchMedia('(display-mode: standalone)').matches || navigator.standalone===true, memoryApiAvailable:typeof performance.memory!=='undefined', hardwareConcurrency:navigator.hardwareConcurrency||null};
}
async function start() {
  if(running) return;
  running=true;stopRequested=false;results.length=0;lastReport=null;detailedAudit=null;
  $('selfTestRun').disabled=true;$('selfTestStop').disabled=false;
  $('selfTestExport').disabled=true;$('selfTestCopy').disabled=true;
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
    await check('Canvas and image encoding',async()=>{
      const b=await imageBlob(1);if(b.size<1000)throw new Error('Encoded image too small');return {detail:`JPEG ${Math.round(b.size/1024)} KB`};
    });
    await check('Temporary storage round trip',()=>{
      const k='docuscan-selftest-temp';const v='test-'+Date.now();
      try{localStorage.setItem(k,v);if(localStorage.getItem(k)!==v)throw new Error('Read mismatch');}
      finally{localStorage.removeItem(k);}return {detail:'Temporary key deleted'};
    });
    if(mode!=='quick') {
      await check('PDF engine and 5-page round trip',()=>testPdf(5));
      await check('10-image PDF create and reopen',()=>testPdf(10,true));
      await check('OCR engine availability',()=>{
        const available=!!(window.Tesseract || document.querySelector('script[src*="tesseract"]'));
        return {status:'warning',detail:available?'OCR library detected; recognition not exercised':'OCR recognition not exercised by this self-test'};
      });
    }
    if(mode==='stress') {
      await check('25 generated images',async()=>{let total=0;for(let i=1;i<=25;i++){total+=(await imageBlob(i)).size;if(i%5===0)await tick();}return{detail:`25 images; ${Math.round(total/1024)} KB`};});
      await check('50 generated images',async()=>{let total=0;for(let i=1;i<=50;i++){if(stopRequested)throw new Error('Cancelled');total+=(await imageBlob(i)).size;if(i%5===0)await tick();}return{detail:`50 images; ${Math.round(total/1024)} KB`};});
      await check('50-page PDF round trip',()=>testPdf(50));
      await check('100-page PDF round trip',()=>testPdf(100));
    }
    await check('Uncaught browser errors during test',()=>exceptions.length?{status:'warning',detail:exceptions.slice(0,3).join('; ')}:{detail:'No uncaught errors observed'});
  } catch(e) {
    if(String(e.message)!=='STOP_REQUESTED') results.push({name:'Test runner',status:'fail',detail:safeError(e),ms:0});
  } finally {
    window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onReject);
    running=false;
    lastReport={app:'DocuScan Pro',version:'7.71.0',testSuite:'on-device-self-test-2',mode,detailedAudit,started,finished:new Date().toISOString(),durationMs:Math.round(now()-startTime),device:collectDevice(),results:[...results],limitations:['Uses generated files, not user documents','PDF tests exercise pdf-lib directly, not every app editing workflow','OCR recognition, native memory pressure and physical-device crashes are not certified','No test files are saved to the document Library','Detailed audit taps navigation only; other buttons are inventoried but not functionally clicked','No destructive, camera, file picker, share, print or download buttons are auto-tapped']};
    $('selfTestRun').disabled=false;$('selfTestStop').disabled=true;
    $('selfTestExport').disabled=false;$('selfTestCopy').disabled=false;
    render();
  }
}
function show(){$('selfTestDialog').hidden=false;document.body.classList.add('selftest-open');$('selfTestRun').focus();}
function hide(){if(running){stopRequested=true;return;}$('selfTestDialog').hidden=true;document.body.classList.remove('selftest-open');}
document.addEventListener('click',e=>{if(e.target.closest('#selfTestOpen')){e.target.closest('.toast')?.remove();show();}});
$('selfTestClose').addEventListener('click',hide);
$('selfTestRun').addEventListener('click',start);
$('selfTestStop').addEventListener('click',()=>{stopRequested=true;$('selfTestSummary').textContent='Stopping after current check…';});
$('selfTestExport').addEventListener('click',()=>{if(!lastReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`docuscan-device-test-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('selfTestCopy').addEventListener('click',async()=>{if(!lastReport)return;const r=lastReport;const summary=`DocuScan Pro ${r.version} | ${r.mode} | ${r.device.viewport.width}x${r.device.viewport.height}\n${r.results.map(x=>`${x.status.toUpperCase()}: ${x.name} (${x.ms}ms) ${x.detail}`).join('\n')}`;try{await navigator.clipboard.writeText(summary);$('selfTestCopy').textContent='Copied!';setTimeout(()=>$('selfTestCopy').textContent='Copy Results',1800);}catch(e){$('selfTestSummary').textContent='Copy blocked; use Download JSON instead';}});
