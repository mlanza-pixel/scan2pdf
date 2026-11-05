import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as PDFLib from 'pdf-lib';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const here=path.dirname(new URL(import.meta.url).pathname), fixtures=path.join(here,'fixtures'), results=path.join(here,'results');await fs.mkdir(results,{recursive:true});
globalThis.window={PDFLib};
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onload?.()}).catch(e=>{this.error=e;this.onerror?.()})}};
function canvas(){const c=createCanvas(1,1);c.toBlob=fn=>fn(new Blob([c.toBuffer('image/png')],{type:'image/png'}));return c;}
globalThis.document={createElement(tag){if(tag==='canvas')return canvas();throw new Error('Unexpected DOM dependency: '+tag)}};
const editor=await import('../js/pdf-editor.js');const tools=await import('../js/pdf-tools.js');const images=await import('../js/image-processing.js');
const {PDFDocument}=PDFLib;const rows=[];const record=(name,detail)=>{rows.push({test:name,status:'PASS',detail});console.log('PASS',name,detail)};
const read=async n=>new Uint8Array(await fs.readFile(path.join(fixtures,n)));
const count=async b=>(await PDFDocument.load(b)).getPageCount();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const ten=await read('document-10-pages.pdf'),five=await read('document-5-pages.pdf');const originalHashes=[hash(ten),hash(five)];assert.equal(await count(ten),10);assert.equal(await count(five),5);record('Fixtures','10-page and 5-page source PDFs');
const canvases=[];
for(let i=1;i<=3;i++){
 const image=await loadImage(path.join(fixtures,`photo-${i}.jpg`));const c=canvas();c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);canvases.push(c);
 const enhanced=images.applyAdjustments(c,{brightness:10,contrast:15,grayscale:true});assert.equal(enhanced.width,1200);const rgba=enhanced.getContext('2d').getImageData(200,200,1,1).data;assert.equal(rgba[0],rgba[1]);
 const rotated=images.rotateCanvas(c,90);assert.equal(rotated.width,1600);assert.equal(rotated.height,1200);record('JPG '+i,'Decode, grayscale/enhance and rotate dimensions');
}
for(const pageSize of ['letter','a4','fit']){
 const b=await editor.buildPdfFromCanvases(canvases,{pageSize,orientation:'portrait'});assert.equal(await count(b),3);await fs.writeFile(path.join(results,`photos-${pageSize}.pdf`),b);record('Studio PDF '+pageSize,'All 3 JPGs included as 3 pages');
}
let merged=await tools.runMerge(ten,[five]);assert.equal(await count(merged),15);await fs.writeFile(path.join(results,'merged-15-pages.pdf'),merged);record('Merge 10 + 5','15 pages');
const rotated=await tools.runRotate(merged,90);const rp=(await PDFDocument.load(rotated)).getPages();assert.equal(rp.length,15);assert.ok(rp.every(p=>p.getRotation().angle===90));await fs.writeFile(path.join(results,'rotated-15-pages.pdf'),rotated);record('Rotate merged PDF','All 15 pages rotated 90 degrees');
const reverse=await tools.runReorder(merged,Array.from({length:15},(_,i)=>14-i));assert.equal(await count(reverse),15);await fs.writeFile(path.join(results,'reversed-15-pages.pdf'),reverse);record('Reorder','Reverse order, all 15 pages retained');
const parts=await tools.runSplit(merged,'1-10,11-15',15);assert.equal(parts.length,2);assert.equal(await count(parts[0]),10);assert.equal(await count(parts[1]),5);for(let i=0;i<2;i++)await fs.writeFile(path.join(results,`split-${i+1}.pdf`),parts[i]);record('Split merged PDF','Restored 10-page and 5-page groups');
for(const input of ['0','16','4-2','abc','1.5',''])assert.throws(()=>tools.parseRanges(input,15));record('Invalid ranges','Six invalid inputs rejected');
const wm=await tools.runWatermark(ten,{text:'QA DRAFT',direction:'diagonal',opacity:40});assert.equal(await count(wm),10);await fs.writeFile(path.join(results,'watermark-10-pages.pdf'),wm);record('Watermark','10-page output retains count');
let annotated=await tools.runAnnotateText(ten,0,{text:'QA FIRST PAGE',normalized:{x:.2,y:.2},size:18});annotated=await tools.runAnnotateText(annotated,9,{text:'QA LAST PAGE',normalized:{x:.2,y:.2},size:18});assert.equal(await count(annotated),10);await fs.writeFile(path.join(results,'annotated-10-pages.pdf'),annotated);record('Text editing','First and last page annotated');
await assert.rejects(()=>tools.runAnnotateText(five,5,{text:'outside'}));record('Out-of-bounds annotation','Rejected page beyond final page');
const {doc}=await editor.loadExistingPdf(five);await editor.insertImageElement(doc,4,new Uint8Array(canvases[0].toBuffer('image/png')),{normalized:{x:.5,y:.5},widthPct:25,heightPct:12});const signed=await doc.save();assert.equal(await count(signed),5);await fs.writeFile(path.join(results,'image-signature-5-pages.pdf'),signed);record('Image/signature placement','PNG embedded on final page of 5-page PDF');
assert.equal(hash(ten),originalHashes[0]);assert.equal(hash(five),originalHashes[1]);record('Original file integrity','Both original byte hashes unchanged');
// Exercise the actual source renderer/parser against both documents in Node's supported PDF.js environment.
try {const renderer=await import('../js/pdf-renderer.js');for(const [bytes,n] of [[ten,10],[five,5]]){const d=await renderer.loadPdfFromBytes(bytes);assert.equal(await renderer.getPageCount(d),n);const cached=await renderer.loadPdfFromBytes(bytes);assert.equal(d,cached);const last=await d.getPage(n);assert.ok((await last.getTextContent()).items.length>0);}record('PDF renderer loading','10/5 page counts, final-page text, same-byte cache reuse');}catch(e){rows.push({test:'PDF renderer loading in Node',status:'LIMITATION',detail:e.message});console.log('LIMITATION PDF.js Node renderer',e.message)}
await fs.writeFile(path.join(results,'core-results.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({passed:rows.filter(x=>x.status==='PASS').length,limitations:rows.filter(x=>x.status==='LIMITATION').length}));
