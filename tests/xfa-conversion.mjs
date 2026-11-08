import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const c=vm.createContext({console,setTimeout,clearTimeout,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder});vm.runInContext(fs.readFileSync(new URL('../vendor/pdf-lib.min.js',import.meta.url),'utf8'),c);
globalThis.window={PDFLib:c.PDFLib};
const {inspectXfa,convertBlankStaticXfa}=await import('../js/xfa-copy.js');const lib=c.PDFLib;
const input=new Uint8Array(fs.readFileSync(new URL('../tests/fixtures/w9-blank.pdf',import.meta.url)));const original=Buffer.from(input);
console.log(await inspectXfa(input));assert.equal((await inspectXfa(input)).convertible,true);
await assert.rejects(()=>lib.PDFDocument.load(input),{name:'NotSupportedError'});
const converted=await convertBlankStaticXfa(input);assert.deepEqual(Buffer.from(input),original);
const doc=await lib.PDFDocument.load(converted);assert.equal(doc.getPageCount(),6);assert.equal(doc.getForm().hasXFA(),false);
const fields=doc.getForm().getFields();assert.equal(fields.length,23);
const text=fields.find(f=>f instanceof lib.PDFTextField),check=fields.find(f=>f instanceof lib.PDFCheckBox);text.setText('MOBILE WORKER TEST');check.check();
const filled=await doc.save();const reopen=await lib.PDFDocument.load(filled);
assert.equal(reopen.getForm().getTextField(text.getName()).getText(),'MOBILE WORKER TEST');assert.ok(reopen.getForm().getCheckBox(check.getName()).isChecked());
// Dynamic and populated XFA copies are rejected rather than losing their data.
for(const [config,data] of [['required',''],['forbidden','IMPORTANT SAVED VALUE']]){
 const src=await lib.PDFDocument.loadForXfaInspection(input);const acro=src.catalog.lookup(lib.PDFName.of('AcroForm'));const a=acro.lookup(lib.PDFName.of('XFA'));
 for(let i=0;i<a.size();i+=2){const n=a.lookup(i).decodeText();if(n==='config')a.set(i+1,src.context.stream(`<config><dynamicRender>${config}</dynamicRender></config>`));if(n==='datasets')a.set(i+1,src.context.stream(`<datasets><data>${data}</data></datasets>`));}
 const bytes=await src.save({updateFieldAppearances:false});assert.equal((await inspectXfa(bytes)).convertible,false);await assert.rejects(()=>convertBlankStaticXfa(bytes),{name:'NotSupportedError'});
}
fs.mkdirSync(new URL('./results/xfa-copy/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./results/xfa-copy/w9-editable.pdf',import.meta.url),converted);fs.writeFileSync(new URL('./results/xfa-copy/w9-filled.pdf',import.meta.url),filled);
console.log(JSON.stringify({pass:true,pages:6,fields:fields.length,text:text.getName(),checkbox:check.getName(),originalUnchanged:true,dynamicRejected:true,filledXfaRejected:true}));
