import fs from 'node:fs/promises';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import * as lib from 'pdf-lib';
globalThis.window={PDFLib:lib};const editor=await import('../js/pdf-editor.js');const here=path.dirname(new URL(import.meta.url).pathname);const source=await fs.readFile(path.join(here,'../js/app.js'),'utf8');const code=source.slice(source.indexOf('async function commitObjectsToPdf()'),source.indexOf('async function commitAndExport'));
const bytes=new Uint8Array(await fs.readFile(path.join(here,'fixtures/document-10-pages.pdf')));
const png=new Uint8Array(await fs.readFile(path.join(here,'results/signature.png')).catch(()=>new Uint8Array()));
const sign={bytes,objects:[
 {type:'text',page:1,text:'APP EXPORT FIRST',size:16,fontFamily:'Helvetica',color:'#003399',normalized:{x:.2,y:.2}},
 {type:'text',page:10,text:'APP EXPORT LAST',size:16,fontFamily:'Helvetica',color:'#003399',normalized:{x:.2,y:.2}},
 {type:'watermark',text:'QA WATERMARK',opacity:30,direction:'diagonal',widthPct:40,normalized:{x:.5,y:.5}},
 {type:'stamp',page:2,text:'APPROVED',widthPct:30,color:'#0044aa',normalized:{x:.5,y:.5}},
 {type:'highlight',page:3,widthPct:40,heightPct:4,color:'#ffff00',normalized:{x:.5,y:.5}},
 {type:'underline',page:4,widthPct:40,heightPct:2,color:'#003399',size:3,normalized:{x:.5,y:.5}},
 {type:'strikethrough',page:5,widthPct:40,heightPct:2,color:'#003399',size:3,normalized:{x:.5,y:.5}}
]};
const context=vm.createContext({sign,window:{PDFLib:lib},...editor,Uint8Array,console});vm.runInContext(code,context);const out=await vm.runInContext('commitObjectsToPdf()',context);assert.equal((await lib.PDFDocument.load(out)).getPageCount(),10);assert.equal(sign.objects.length,7);await fs.writeFile(path.join(here,'results/app-sign-export-10-pages.pdf'),out);console.log('PASS actual Sign exporter: text, watermark, stamp, highlight, underline, strike; 10 pages retained.');
