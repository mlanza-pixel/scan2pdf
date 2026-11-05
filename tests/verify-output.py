from pathlib import Path
from pypdf import PdfReader
import json
r=Path(__file__).parent/'results'; checks=[]
def check(name,ok):
 assert ok,name
 checks.append({'test':name,'status':'PASS'});print('PASS',name)
merged=PdfReader(r/'merged-15-pages.pdf');texts=[p.extract_text() for p in merged.pages]
check('Merge order retains 10 original page markers followed by 5',all(f'DOC10-PAGE{i:02d}' in texts[i-1]for i in range(1,11))and all(f'DOC5-PAGE{i:02d}'in texts[i+9]for i in range(1,6)))
rev=PdfReader(r/'reversed-15-pages.pdf');check('Reverse order verified by first and last markers','DOC5-PAGE05'in rev.pages[0].extract_text() and 'DOC10-PAGE01'in rev.pages[-1].extract_text())
for n,count in [(1,10),(2,5)]:check(f'Split {n}: correct pages and final marker',len(PdfReader(r/f'split-{n}.pdf').pages)==count and f'DOC{count}-PAGE{count:02d}'in PdfReader(r/f'split-{n}.pdf').pages[-1].extract_text())
wm=PdfReader(r/'watermark-10-pages.pdf');check('Watermark appears on every page',all('QA DRAFT'in p.extract_text()for p in wm.pages))
a=PdfReader(r/'annotated-10-pages.pdf');check('Annotations on intended first and final pages','QA FIRST PAGE'in a.pages[0].extract_text() and 'QA LAST PAGE'in a.pages[9].extract_text())
a=PdfReader(r/'app-sign-export-10-pages.pdf');check('Actual app Sign exporter text and stamp','APP EXPORT FIRST'in a.pages[0].extract_text() and 'APP EXPORT LAST'in a.pages[-1].extract_text() and 'APPROVED'in a.pages[1].extract_text());check('Actual app Sign watermark on all 10 pages',all('QA WATERMARK'in p.extract_text()for p in a.pages))
for sz in ['letter','a4','fit']:
 d=PdfReader(r/f'photos-{sz}.pdf');check(f'Photo PDF {sz}: 3 embedded page images',len(d.pages)==3 and all(len(p.images)>0 for p in d.pages))
check('Signature image on final page of five-page PDF',len(PdfReader(r/'image-signature-5-pages.pdf').pages[-1].images)>0)
(r/'independent-verification.json').write_text(json.dumps(checks,indent=2))
