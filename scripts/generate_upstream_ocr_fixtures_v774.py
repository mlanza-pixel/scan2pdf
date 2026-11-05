#!/usr/bin/env python3
"""Generate reproducible realistic OCR load fixtures with vendored digidigital/ocrtestdata.
These are image-only PDFs. OCR accuracy is NOT scored by this script.
"""
import argparse,sys,hashlib,json,datetime,time
from pathlib import Path
from faker import Faker
import fitz
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tests/vendor/ocrtestdata-upstream'))
from ocrtestdata.generator import generate_pdf

def run():
 p=argparse.ArgumentParser()
 p.add_argument('--pages',nargs='+',type=int,default=[5,10,25])
 p.add_argument('--dpi',type=int,default=100)
 p.add_argument('--locale',default='en_US')
 p.add_argument('--out',default='tests/fixtures/upstream-generated')
 p.add_argument('--max-pages',type=int,default=100)
 a=p.parse_args()
 if a.dpi<72 or a.dpi>300: p.error('DPI must be 72–300')
 if not a.pages or any(n<1 or n>a.max_pages for n in a.pages):p.error('Invalid page count or exceeds safety cap')
 out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
 records=[]
 for pages in a.pages:
  seed=774000+pages
  fake=Faker(a.locale);fake.seed_instance(seed)
  dest=out/f'ocrtestdata_{pages:03d}pages_{a.dpi}dpi.pdf'
  started=time.monotonic()
  produced=generate_pdf(fake,str(dest),pages,a.dpi,'DOCUSCAN QR SEPARATOR')
  with fitz.open(dest) as doc:
   actual=len(doc)
   images=[len(page.get_images(full=True)) for page in doc]
   extractable=sum(len(page.get_text().strip()) for page in doc)
  if produced!=pages or actual!=pages or any(i==0 for i in images):raise RuntimeError(f'Invalid image-backed fixture {dest}')
  if extractable>0:raise RuntimeError(f'Fixture unexpectedly contains searchable text: {dest}')
  size=dest.stat().st_size
  if size<pages*3000:raise RuntimeError(f'Fixture suspiciously small: {size} bytes')
  record={'file':dest.name,'pages':pages,'dpi':a.dpi,'locale':a.locale,'seed':seed,'bytes':size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'image_pages':sum(i>0 for i in images),'extractable_text_chars':extractable,'seconds':round(time.monotonic()-started,2),'generator':'digidigital/ocrtestdata (vendored MIT)'}
  records.append(record);print(json.dumps(record),flush=True)
 (out/'manifest.json').write_text(json.dumps({'generated_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'records':records,'ocr_accuracy_scored':False},indent=2)+'\n')
if __name__=='__main__':run()
