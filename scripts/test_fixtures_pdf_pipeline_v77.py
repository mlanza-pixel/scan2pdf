#!/usr/bin/env python3
"""Independent PDF fixture pipeline; DOES NOT test browser application UI."""
import json,datetime,sys
from pathlib import Path
import fitz
from PIL import Image
root=Path(__file__).resolve().parents[1]; fixtures=root/'tests/fixtures';out=root/'tests/results/v77-fixture-pipeline';out.mkdir(parents=True,exist_ok=True)
checks=[]
def record(label,ok,detail=''):
 checks.append({'test':label,'pass':bool(ok),'detail':str(detail)})
 print(('PASS' if ok else 'FAIL'),label,detail)
try:
 photos=[fixtures/f'photo-{i}.jpg' for i in range(1,4)]
 for f in photos:
  with Image.open(f) as im:im.verify()
 record('3 input photos decode',True)
 for name,w,h in [('letter',612,792),('a4',595,842),('fit',900,1200)]:
  pdf=fitz.open()
  for f in photos:
   page=pdf.new_page(width=w,height=h);page.insert_image(page.rect,filename=str(f),keep_proportion=True)
  target=out/f'three-images-{name}.pdf';pdf.save(target);pdf.close()
  with fitz.open(target) as check:record(f'3 photos to {name} PDF',len(check)==3 and all(p.get_images() for p in check),f'{len(check)} pages')
 five=fitz.open(fixtures/'document-5-pages.pdf');ten=fitz.open(fixtures/'document-10-pages.pdf')
 record('5-page source readable',len(five)==5,len(five));record('10-page source readable',len(ten)==10,len(ten))
 merged=fitz.open();merged.insert_pdf(five);merged.insert_pdf(ten);merged.save(out/'merged-15-pages.pdf');record('merge 5 + 10',len(merged)==15,len(merged))
 merged[0].set_rotation(90);merged[0].insert_text((60,60),'DocuScan v7.7 fixture test',fontsize=12)
 merged.save(out/'rotated-annotated-15-pages.pdf');merged.close()
 with fitz.open(out/'rotated-annotated-15-pages.pdf') as doc:record('rotation + text survives save',len(doc)==15 and doc[0].rotation==90 and 'DocuScan v7.7' in doc[0].get_text())
 split=fitz.open();split.insert_pdf(ten,from_page=0,to_page=4);split.save(out/'split-first-five.pdf');split.close()
 with fitz.open(out/'split-first-five.pdf') as doc:record('split 10-page source to 5 pages',len(doc)==5,len(doc))
 five.close();ten.close()
except Exception as e:record('pipeline exception',False,repr(e))
report={'runUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Independent PyMuPDF and Pillow fixture processing; does NOT certify application PDF Tools, Studio, OCR, browser import/export, or native devices','checks':checks}
(root/'tests/results/v77-fixture-pipeline.json').write_text(json.dumps(report,indent=2))
sys.exit(0 if all(x['pass'] for x in checks) else 1)
