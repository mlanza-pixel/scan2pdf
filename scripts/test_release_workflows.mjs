import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import path from 'node:path';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));process.chdir(root);
const port=Number(process.env.DOCUSCAN_TEST_PORT||8780);const base=`http://127.0.0.1:${port}`;
const server=spawn(process.env.DOCUSCAN_PYTHON||'python',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});await new Promise(r=>setTimeout(r,600));
const browser=await chromium.launch({executablePath:process.env.DOCUSCAN_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const out=path.join(root,'tests/results/v7.75.0');await fs.mkdir(out,{recursive:true});const summaries=[];
try {
 const repeats=Math.max(1,Math.min(250,Number(process.env.DOCUSCAN_TEST_REPEATS||1)));
 for(let iteration=1;iteration<=repeats;iteration++) for(const [device,width,height] of [['desktop',1440,1000],['ipad-emulated',1024,900],['iphone-emulated',390,844],['android-emulated',412,915]].filter(p=>!process.env.DOCUSCAN_TEST_PROFILE||p[0]===process.env.DOCUSCAN_TEST_PROFILE)){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('docuscan-pro.tutorial-state',JSON.stringify({termsAccepted:true,tutorialSeen:true})));
  await page.goto(base);await page.waitForTimeout(400);
  const before=await page.evaluate(async()=>{const s=await import('./js/storage.js');await s.saveDocument({id:'user-sentinel',name:'DO NOT CHANGE',bytes:new Uint8Array([1,2,3]),pageCount:1});localStorage.setItem('docuscan-pro.folders','[{"id":"user-folder","name":"KEEP","docs":["user-sentinel"]}]');return {docs:await s.listDocuments(),folders:localStorage.getItem('docuscan-pro.folders')};});
  await page.evaluate(()=>{document.getElementById('selfTestMode').value='quick';document.getElementById('selfTestRepeat').value='10';document.getElementById('selfTestCapture').checked=false;document.getElementById('selfTestDetailed').checked=false;document.getElementById('selfTestWorkflows').checked=true;document.getElementById('selfTestRun').click();});
  await page.waitForFunction(()=>window.__docuScanLastSelfTest,{},{timeout:90000});const report=await page.evaluate(()=>window.__docuScanLastSelfTest);
  const after=await page.evaluate(async()=>({docs:await (await import('./js/storage.js')).listDocuments(),folders:localStorage.getItem('docuscan-pro.folders')}));
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Fixture test changed source Library/settings');
  if(report.counts.failed||errors.length)throw new Error(JSON.stringify({device,failures:report.results.filter(r=>r.status==='fail'),errors}));
  // Remove the test sentinel from this disposable browser profile before capturing UI.
  await page.evaluate(async()=>{await(await import('./js/storage.js')).deleteDocument('user-sentinel');localStorage.removeItem('docuscan-pro.folders');});
  const shots=path.join(out,'screenshots',device);await fs.mkdir(shots,{recursive:true});
  if(iteration===1)for(const ws of ['home','sign','tools','studio','library','help']){await page.locator(`.bottom-nav__item[data-goto="${ws}"]`).click();await page.waitForTimeout(100);await page.screenshot({path:path.join(shots,`${ws}.png`),fullPage:true});}
  await page.evaluate(()=>{window.__docuScanLastSelfTest=null;document.getElementById('selfTestRun').click();document.getElementById('selfTestStop').click();});await page.waitForFunction(()=>window.__docuScanLastSelfTest?.cancelled,{},{timeout:10000});if(!await page.locator('#selfTestRun').isEnabled())throw new Error('Stop did not restore Run');
  await fs.writeFile(path.join(out,`report-${device}-${iteration}.json`),JSON.stringify({source:`automated-release-${device}`,deviceScope:'Chromium viewport emulation; not native-device certification',report,checks:{sourceLibraryUnchanged:true,sourceFoldersUnchanged:true,stopRestoresControls:true},browserErrors:errors},null,2));
  summaries.push({device,iteration,status:'PASS',counts:report.counts});console.log(device,JSON.stringify(report.counts));await context.close();
 }
 await fs.writeFile(path.join(out,'SUMMARY.json'),JSON.stringify({version:'7.75.0',build:'7.75.0-test5',results:summaries,notRun:['Physical iOS/Android camera','Native share/email delivery','Native print','VoiceOver/TalkBack','Real OCR accuracy in this quick workflow run','Every remaining feature workflow']},null,2));
}finally{await browser.close();server.kill();}
