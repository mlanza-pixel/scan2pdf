import {spawn} from 'node:child_process';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {chromium} from 'playwright';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));process.chdir(root);
const server=spawn(process.env.DOCUSCAN_PYTHON||'python',['-m','http.server','8781','--bind','127.0.0.1','--directory',root],{stdio:'ignore'});await new Promise(r=>setTimeout(r,500));
const browser=await chromium.launch({executablePath:process.env.DOCUSCAN_CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('docuscan-pro.tutorial-state',JSON.stringify({termsAccepted:true,tutorialSeen:true})));await page.goto('http://127.0.0.1:8781/');await page.waitForTimeout(400);
 const content=await page.evaluate(async()=>{const h=await import('./js/help-system.js');return {topics:h.getHelpTopics(),walkthroughs:h.getWalkthroughs()};});
 const controls=new Map();
 async function collect(workspace,context=''){
  const rows=await page.evaluate(({workspace,context})=>{
   const panel=workspace==='shared'?document.body:document.getElementById('ws-'+workspace);const rows=[];
   for(const el of panel.querySelectorAll('button,input,select,textarea,[role="tab"],label')){
    if(workspace==='shared'&&el.closest('.workspace'))continue;
    let selector=el.id?'#'+el.id:el.dataset.tab?`[data-tab="${el.dataset.tab}"]`:el.dataset.group?`[data-group="${el.dataset.group}"]`:el.dataset.libraryAction?`[data-library-action="${el.dataset.libraryAction}"]`:el.htmlFor?`label[for="${el.htmlFor}"]`:null;
    if(!selector)continue;
    const label=(el.getAttribute('aria-label')||el.getAttribute('title')||el.labels?.[0]?.textContent||el.placeholder||(el.tagName==='SELECT'?el.options[el.selectedIndex]?.text:el.textContent)||el.value||'').trim().replace(/\s+/g,' ');
    rows.push({workspace,id:el.id||selector,selector,descriptor:el.tagName.toLowerCase()+(el.type?':'+el.type:''),label,choices:el.options?[...el.options].map(o=>o.text).join('; '):'',context,helpLink:workspace,source:'index.html / app.js runtime'});
   }return rows;
  },{workspace,context});for(const row of rows)controls.set(`${row.workspace}|${row.id}|${row.label}`,row);
 }
 for(const ws of ['home','studio','sign','tools','library','help']){await page.locator(`.bottom-nav__item[data-goto="${ws}"]`).click();await collect(ws);}
 await page.locator('.bottom-nav__item[data-goto="tools"]').click();await page.locator('#toolsPdfInput').setInputFiles('tests/fixtures/document-5-pages.pdf');await page.waitForFunction(()=>!document.getElementById('btnRunToolOp').disabled);
 const groups=await page.locator('#toolsGroups [data-group]').evaluateAll(els=>els.map(e=>e.dataset.group));
 for(const group of groups){if(!await page.locator(`[data-tools-for="${group}"]`).isVisible())await page.locator(`#toolsGroups [data-group="${group}"]`).click();const tabs=await page.locator(`[data-tools-for="${group}"] [data-tab]`).evaluateAll(els=>els.map(e=>e.dataset.tab));for(const tab of tabs){await page.locator(`[data-tools-for="${group}"] [data-tab="${tab}"]`).evaluate(el=>el.click());await page.waitForTimeout(40);await collect('tools',tab);}}
 await page.locator('.bottom-nav__item[data-goto="library"]').click();await page.locator('#btnNewFolder').click();await page.locator('#appInputDialog').waitFor({state:'visible'});await collect('shared');await page.locator('#appInputCancel').click();
 await page.locator('.bottom-nav__item[data-goto="tools"]').click();
 await page.locator('#toolsPdfInput').setInputFiles('tests/fixtures/w9-blank.pdf');await page.locator('#appInputDialog').waitFor({state:'visible'});await collect('shared','XFA conversion choice');await page.locator('#appInputAccept').click();await page.locator('#toolsFormCopyNotice').waitFor();await collect('tools','editable W-9 notice');
 const meta=JSON.parse(await fs.readFile('release.json','utf8'));const output={...meta,topics:content.topics,walkthroughs:content.walkthroughs,controls:[...controls.values()],collectionErrors:errors};
 await fs.writeFile('docs/RELEASE_CONTENT.json',JSON.stringify(output,null,2));
 const tours=Object.fromEntries(Object.entries(content.walkthroughs).map(([k,v])=>[k,v.steps.map(s=>[s.workspace,s.selector,s.title,s.body])]));await fs.writeFile('docs/Tour-Steps-v7.75.0.json',JSON.stringify(tours,null,2));
 console.log(JSON.stringify({topics:output.topics.length,controls:output.controls.length,tourSteps:Object.values(tours).reduce((n,a)=>n+a.length,0),errors}));
}finally{await browser.close();server.kill();}
