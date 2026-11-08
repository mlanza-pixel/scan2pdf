import {spawn} from 'node:child_process';import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));process.chdir(root);
await fs.mkdir('tests/results/v7.75.0',{recursive:true});
const server=spawn('python',['-m','http.server','8768','--directory',root],{stdio:'ignore'});await new Promise(r=>setTimeout(r,500));
const browser=await chromium.launch({executablePath:process.env.DOCUSCAN_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {for(const width of [1024,390]){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('docuscan-pro.tutorial-state',JSON.stringify({termsAccepted:true,tutorialSeen:true}));
  window.Tesseract={createWorker:async(lang,mode,{logger})=>{logger({status:'loading language traineddata',progress:.8});await new Promise(r=>setTimeout(r,120));return {setParameters:async()=>{},terminate:async()=>{},recognize:async()=>{logger({status:'recognizing text',progress:.5});await new Promise(r=>setTimeout(r,120));return {data:{text:'SIMULATED OCR TEXT',lines:[]}}}}}};
 });await page.goto('http://127.0.0.1:8768/');await page.waitForTimeout(300);
 // Actual keyboard Escape closes the modal and returns focus to the initiating control.
 await page.locator('[data-goto="library"]').first().click();await page.locator('#btnNewFolder').click();await page.locator('#appInputDialog').waitFor({state:'visible'});
 const box=await page.locator('#appInputDialog').boundingBox();if(box.x<0||box.x+box.width>width+1)throw new Error('Dialog overflows viewport');
 await page.keyboard.press('Escape');await page.locator('#appInputDialog').waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement===document.getElementById('btnNewFolder'));
 // Test the actual duplicate-save path, including cancellation and alternate-name collision.
 await page.evaluate(async()=>{const {saveDocument}=await import('./js/storage.js');await saveDocument({name:'Collision',bytes:new Uint8Array([1]),pageCount:2});await saveDocument({name:'Alternate',bytes:new Uint8Array([2]),pageCount:2});window.pendingSave=(await import('./js/export.js')).saveToLibrary(new Uint8Array([3]),{name:'Collision.pdf',pageCount:3});});
 await page.locator('#appInputDialog').waitFor({state:'visible'});await page.locator('#appInputCancel').click();await page.locator('#appInputValue').waitFor();await page.locator('#appInputValue').fill('Alternate.pdf');await page.locator('#appInputAccept').click();
 await page.locator('#appInputTitle').filter({hasText:'Replace saved PDF?'}).waitFor();await page.locator('#appInputAccept').click();const saved=await page.evaluate(()=>window.pendingSave);if(saved.name!=='Alternate'||saved.pageCount!==3)throw new Error('Alternate collision not replaced correctly');
 const docs=await page.evaluate(async()=> (await (await import('./js/storage.js')).listDocuments()).map(x=>({name:x.name,bytes:Array.from(x.bytes)})));if(docs.length!==2||!docs.some(x=>x.name==='Collision'&&x.bytes[0]===1))throw new Error('Collision protection lost original data');
 // Feed three fixture JPGs through the application and observe visible stage updates.
 await page.locator('.bottom-nav__item[data-goto="studio"]').click();await page.locator('#imagesInput').setInputFiles([1,2,3].map(i=>`tests/fixtures/photo-${i}.jpg`));await page.waitForFunction(()=>!document.getElementById('btnRunOcr').disabled);
 await page.evaluate(()=>{window.ocrLabels=[];new MutationObserver(()=>window.ocrLabels.push(document.getElementById('ocrStatus').textContent)).observe(document.getElementById('ocrStatus'),{childList:true,subtree:true});});
 await page.locator('#btnRunOcr').click();await page.waitForFunction(()=>document.getElementById('ocrStatus').textContent==='Done');const labels=await page.evaluate(()=>window.ocrLabels);
 if(!labels.some(x=>x.includes('Loading language model'))||![1,2,3].every(n=>labels.some(x=>x.includes(`page ${n} of 3`)&&x.includes('Recognizing text'))))throw new Error('OCR stage/page progress missing');
 if(errors.length)throw new Error(errors.join(';'));
 const result={version:'7.75.0',status:'PASS',viewport:width,checks:['Dialog fits viewport','Escape cancellation and focus restoration','Collision replacement rechecks alternate names','Original collision source preserved','Visible language-model loading','Recognition progress across three pages'],ocrEngine:'STUB for UI behavior; real OCR accuracy NOT RUN',labels};
 await fs.writeFile(`tests/results/v7.75.0/naming-ocr-${width}.json`,JSON.stringify(result,null,2));console.log(width,'PASS dialogs, overwrite protection, OCR stage UI');await context.close();
}} finally{await browser.close();server.kill();}
