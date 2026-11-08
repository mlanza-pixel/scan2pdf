import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const outputDir=path.resolve(process.env.DOCUSCAN_DOC_OUTPUT||path.join(root,'generated-docs'));
const source=JSON.parse(await fs.readFile(root+'/docs/RELEASE_CONTENT.json','utf8'));
await fs.mkdir(outputDir,{recursive:true});
const plain=x=>String(x??'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&');
const testIds={btnCreatePdf:'WF-STUDIO-02',btnNewFolder:'WF-DIALOG-02',btnAddText:'WF-SIGN-02',btnUndo:'WF-SIGN-03',btnRedo:'WF-SIGN-03',btnRunToolOp:'WF-TOOLS-01 / WF-FORMS-01',btnRunOcr:'UI-OCR-PROGRESS (stub engine)',imagesInput:'WF-STUDIO-01',signPdfInput:'WF-SIGN-01'};
function sheet(wb,name,title,headers,rows,widths){
 const s=wb.worksheets.add(name);s.showGridLines=false;
 s.getRange('A2').values=[[title]];s.getRange('A2').format.font={name:'Arial',size:14,bold:true};
 s.getRange('A3:D3').values=[['Version',source.version,'Build',source.build]];
 s.getRange('A4:B4').values=[['Source','Current app content; generated '+source.buildUtc]];
 const last=String.fromCharCode(64+headers.length);s.getRange(`A6:${last}6`).values=[headers];
 if(rows.length)s.getRange(`A7:${last}${rows.length+6}`).values=rows;
 const all=s.getRange(`A3:${last}${Math.max(7,rows.length+6)}`);all.format.font={name:'Arial',size:10};all.format.verticalAlignment='top';
 s.getRange(`A6:${last}6`).format={fill:'#253B53',font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true,rowHeight:30};
 widths.forEach((w,i)=>s.getRange(`${String.fromCharCode(65+i)}6:${String.fromCharCode(65+i)}${rows.length+6}`).format.columnWidthPx=w);
 if(rows.length)s.getRange(`A7:${last}${rows.length+6}`).format.wrapText=true;
 rows.forEach((row,i)=>{const lines=Math.max(...row.map((v,c)=>Math.ceil(plain(v).length/Math.max(15,(widths[c]-10)/5.4))));s.getRange(`A${i+7}:${last}${i+7}`).format.rowHeight=Math.max(30,lines*13+8);});
 s.freezePanes.freezeRows(6);s.getRange('B4').format.columnWidthPx=Math.max(widths[1],230);
 return s;
}
const ui=Workbook.create();
const rows=source.controls.map(c=>[c.workspace,c.id,c.descriptor,plain(c.label),'',plain(c.choices),testIds[c.id]||'NOT RUN / no dedicated workflow',c.helpLink,source.version]);
sheet(ui,'UI Fields','DocuScan Pro UI Field Reference',['Page','ID or selector','Descriptor','Current Text','Change To','Choices or behavior','Test linked to ID','Help linkage','Version'],rows,[95,230,130,360,260,410,255,100,85]);
const tours=Object.entries(source.walkthroughs).flatMap(([workspace,t])=>t.steps.map((s,i)=>[workspace,i+1,s.selector||'(workspace introduction)',s.title,plain(s.body),source.version]));
sheet(ui,'Tour This Page','DocuScan Pro Tour Steps',['Page','Step','Selector','Title','Current Text','Version'],tours,[95,70,300,220,650,85]);
ui.recalculate();console.log((await ui.inspect({kind:'table',range:'UI Fields!A6:D9',tableMaxRows:4,tableMaxCols:4})).ndjson);
const uiFile=await SpreadsheetFile.exportXlsx(ui);await uiFile.save(outputDir+'/DocuScan-Pro-UI-Field-Reference-v7.75.0.xlsx');
for(const name of ['UI Fields','Tour This Page']){const image=await ui.render({sheetName:name,range:'A1:E10',scale:1});await fs.writeFile(outputDir+'/'+name.replaceAll(' ','-')+'.png',new Uint8Array(await image.arrayBuffer()));}
const help=Workbook.create();const content=[];
for(const t of source.topics){
 for(const key of ['title','sub','purpose','prerequisites','troubleshooting'])if(t[key])content.push([t.workspace||'help',t.id,t.id+'.'+key,plain(t[key]),'',(t.related||[]).join(', '),source.version]);
 for(const [i,s]of(t.steps||[]).entries())for(const key of ['title','body'])content.push([t.workspace||'help',t.id,`${t.id}.step.${i+1}.${key}`,plain(s[key]),'',(t.related||[]).join(', '),source.version]);
}
sheet(help,'Help Content','DocuScan Pro Help Content Inventory',['Page','Topic ID','Field ID','Current Text','Change To','Related topics','Version'],content,[95,195,280,650,300,260,85]);
help.recalculate();console.log((await help.inspect({kind:'table',range:'Help Content!A6:D9',tableMaxRows:4,tableMaxCols:4})).ndjson);
const h=await SpreadsheetFile.exportXlsx(help);await h.save(outputDir+'/DocuScan-Pro-Help-Content-Inventory-v7.75.0.xlsx');
const image=await help.render({sheetName:'Help Content',range:'A1:E10',scale:1});await fs.writeFile(outputDir+'/Help-Content.png',new Uint8Array(await image.arrayBuffer()));
for(const name of ['DocuScan-Pro-UI-Field-Reference-v7.75.0.xlsx','DocuScan-Pro-Help-Content-Inventory-v7.75.0.xlsx'])await fs.copyFile(outputDir+'/'+name,root+'/docs/'+name);
console.log(JSON.stringify({version:source.version,controls:rows.length,tourSteps:tours.length,helpFields:content.length}));
