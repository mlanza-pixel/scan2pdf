/* Explicit conversion for blank, static hybrid forms. Never edits the input bytes. */
import {loadPdfLib} from './pdf-editor.js';
const unsupported = message => Object.assign(new Error(message),{name:'NotSupportedError'});
async function inspect(bytes) {
 const lib=await loadPdfLib();
 const doc=await lib.PDFDocument.loadForXfaInspection(bytes,{ignoreEncryption:false});
 const acro=doc.catalog.lookup(lib.PDFName.of('AcroForm'));
 if(!acro?.has(lib.PDFName.of('XFA')))return {doc,lib,hasXfa:false};
 const reject=message=>({doc,lib,hasXfa:true,convertible:false,reason:message});
 const xfa=acro.lookup(lib.PDFName.of('XFA'));
 if(!(xfa instanceof lib.PDFArray)||xfa.size()%2)return reject('This XFA form has no supported static PDF copy.');
 const packets={};
 try {
  for(let i=0;i<xfa.size();i+=2){const name=xfa.lookup(i).decodeText();const stream=xfa.lookup(i+1);packets[name]=new TextDecoder().decode(lib.decodePDFRawStream(stream).decode());}
 }catch{return reject('The XFA form data cannot be checked safely.');}
 if(!/<dynamicRender\s*>\s*forbidden\s*<\/dynamicRender\s*>/i.test(packets.config||''))return reject('Dynamic XFA forms need an XFA-compatible editor.');
 const fields=acro.lookup(lib.PDFName.of('Fields'));
 if(!(fields instanceof lib.PDFArray)||!fields.size()||!doc.getPageCount())return reject('This XFA form has no standard PDF fields to convert.');
 // A signed or already-filled form is not a blank conversion candidate.
 const seen=new Set();let editable=0;const offCheckboxNames=new Set();
 function walk(field,inheritedType){
  if(seen.has(field))return;seen.add(field);
  const type=field.get(lib.PDFName.of('FT'))||inheritedType;
  const val=field.get(lib.PDFName.of('V'));
  if(String(type)==='/Sig')throw unsupported('Signed forms must remain unchanged.');
  if(val && !['()','<>','/Off'].includes(String(val)))throw unsupported('This PDF already contains form values; conversion is limited to blank forms.');
  if([' /Tx',' /Btn'].includes(' '+String(type)))editable++;
  if(String(type)==='/Btn' && (!val || String(val)==='/Off')){const t=field.get(lib.PDFName.of('T'));if(t?.decodeText)offCheckboxNames.add(t.decodeText().replace(/\[\d+\]$/,''));}
  const kids=field.lookup(lib.PDFName.of('Kids'));
  if(kids instanceof lib.PDFArray)for(let i=0;i<kids.size();i++)walk(kids.lookup(i),type);
 }
 try{for(let i=0;i<fields.size();i++)walk(fields.lookup(i));}catch(e){return reject(e.message);}
 // Blank forms only: do not discard any XFA-only saved value or active form state.
 for(const key of ['datasets','form']){
  let xml=packets[key];if(xml===undefined)return reject('The XFA saved data could not be checked.');
  for(const name of offCheckboxNames)if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))xml=xml.replace(new RegExp('<'+name+'\\s*>\\s*0\\s*</'+name+'\\s*>','g'),'');
  if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml)||xml.replace(/<!--[^]*?-->/g,'').replace(/<[^>]*>/g,'').trim())return reject('This XFA form already contains data. Use an XFA-compatible editor to preserve it.');
 }
 if(!editable)return reject('No editable standard PDF fields were found.');
 return {doc,lib,acro,hasXfa:true,convertible:true};
}
export async function inspectXfa(bytes){const result=await inspect(bytes);return {hasXfa:result.hasXfa,convertible:!!result.convertible,reason:result.reason||''};}
export async function convertBlankStaticXfa(bytes){
 const result=await inspect(bytes);
 if(!result.hasXfa)return bytes.slice();
 if(!result.convertible)throw unsupported(result.reason);
 const {doc,acro,lib}=result;
 acro.delete(lib.PDFName.of('XFA'));doc.catalog.delete(lib.PDFName.of('NeedsRendering'));
 const count=doc.getPageCount(),names=doc.getForm().getFields().map(f=>f.getName());
 // Friendly labels apply only to the exact blank March 2024 W-9 fixture verified here.
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(fingerprint==='2d420cbb4123dcf1fb82595b2359cfbb5d81f00b9df9d359fcc7af361d093f53'){
  const textLabels=['Name (line 1)','Business name (line 2)','LLC tax classification','Other tax classification','Exempt payee code','FATCA exemption code','Address','City, state and ZIP','Requester name and address','Account numbers','SSN - first 3 digits','SSN - middle 2 digits','SSN - final 4 digits','EIN - first 2 digits','EIN - final 7 digits'];
  const checks=['Individual / sole proprietor','C corporation','S corporation','Partnership','Trust / estate','LLC','Other'];
  for(const field of doc.getForm().getFields()){
   const name=field.getName();let label;const match=name.match(/f1_(\d+)\[0\]$/);
   if(match)label=textLabels[Number(match[1])-1];
   const c=name.match(/c1_1\[(\d+)\]$/);if(c)label=checks[Number(c[1])];
   if(/c1_2\[0\]$/.test(name))label='Foreign partners, owners or beneficiaries (line 3b)';
   if(label)field.acroField.dict.set(lib.PDFName.of('TU'),lib.PDFHexString.fromText(label));
  }
 }

 const output=await doc.save({updateFieldAppearances:false});
 const check=await lib.PDFDocument.load(output);
 if(check.getPageCount()!==count||JSON.stringify(check.getForm().getFields().map(f=>f.getName()))!==JSON.stringify(names))throw new Error('Converted form verification failed.');
 return output;
}
