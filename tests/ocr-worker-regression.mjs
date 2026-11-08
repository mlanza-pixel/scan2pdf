import assert from 'node:assert/strict';
let creates=0,terminations=0,recognitions=0,active=0,maxActive=0;
globalThis.window={Tesseract:{createWorker:async(lang,mode,{logger})=>{
 creates++;return {setParameters:async()=>{},terminate:async()=>{terminations++;},recognize:async image=>{
  active++;maxActive=Math.max(maxActive,active);
  if(image==='hang')return new Promise(()=>{});
  await new Promise(r=>setTimeout(r,5));logger({status:'recognizing text',progress:.5});active--;recognitions++;
  return {data:{text:String(image),lines:[]}};
 }};
}}};
const {recognizeText}=await import('../js/ocr.js');
const a=[],b=[];assert((await recognizeText('FIRST',{onProgress:m=>a.push(m)})).ok);const len=a.length;
assert((await recognizeText('SECOND',{onProgress:m=>b.push(m)})).ok);assert.equal(a.length,len,'old callback received new job progress');assert(b.some(m=>m.progress===.5));assert.equal(creates,1);
await Promise.all([recognizeText('QUEUED 1'),recognizeText('QUEUED 2')]);assert.equal(maxActive,1,'worker used concurrently');
await recognizeText('SPANISH',{lang:'spa'});assert.equal(terminations,1,'old language worker leaked');
const controller=new AbortController();const pending=recognizeText('hang',{lang:'spa',signal:controller.signal});await new Promise(r=>setTimeout(r,10));controller.abort();await assert.rejects(pending,{name:'AbortError'});
assert(terminations>=2,'cancelled worker was not disposed');
assert((await recognizeText('RETRY')).ok,'worker could not restart after cancel');
const timed=await recognizeText('hang',{timeoutMs:10});assert.equal(timed.ok,false);assert.match(timed.error,/timed out/);
console.log(JSON.stringify({status:'PASS',checks:['active progress callback','serial worker access','language disposal','cancel disposal','restart after cancel','timeout returns failure'],creates,terminations,recognitions}));
