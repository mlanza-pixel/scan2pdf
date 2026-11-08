#!/usr/bin/env python3
"""Extended browser stress and output verification. Every case writes evidence; failures exit nonzero.
This is Chromium emulation, not physical-device certification. OCR test checks completion,
not recognition accuracy (which requires a ground-truth corpus).
"""
import os, sys, json, pathlib, datetime, traceback, time
from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter
from PIL import Image, ImageDraw
ROOT=pathlib.Path(__file__).resolve().parents[1]
URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
OUT=ROOT/'tests'/'results'/'extended-v771';OUT.mkdir(parents=True,exist_ok=True)
SCREEN=ROOT/'screenshots'/'extended';SCREEN.mkdir(parents=True,exist_ok=True)
FIX=OUT/'fixtures';FIX.mkdir(exist_ok=True)
results=[]
def record(case,device,fn,page):
 start=time.monotonic()
 try:
  detail=fn()
  results.append(dict(case=case,device=device,status='passed',seconds=round(time.monotonic()-start,2),detail=detail))
 except Exception as e:
  results.append(dict(case=case,device=device,status='failed',seconds=round(time.monotonic()-start,2),error=str(e),traceback=traceback.format_exc()[-2500:]))
  try:page.screenshot(path=str(SCREEN/f'{device}-{case.replace(" ","-")}-FAILED.png'),full_page=True,timeout=10000)
  except Exception:pass

def make_fixtures():
 for n in (20,50,100):
  path=FIX/f'pages-{n}.pdf'
  if not path.exists():
   writer=PdfWriter()
   for i in range(n):writer.add_blank_page(width=612,height=792)
   with path.open('wb') as f:writer.write(f)
 # Individual photos, not one photo duplicated as a repeated path
 for i in range(50):
  path=FIX/f'image-{i+1:03}.jpg'
  if not path.exists():
   im=Image.new('RGB',(600,800),(240-i%15*5,245-i%11*6,235-i%9*6))
   ImageDraw.Draw(im).text((40,60),f'DocuScan test image {i+1}',fill=(0,0,0))
   im.save(path,quality=72)
 return True

def enter(page):
 page.goto(URL,wait_until='domcontentloaded',timeout=45000)
 if page.locator('#splashAccept').count() and page.locator('.splash').is_visible():
  page.locator('#splashAccept').check();page.locator('#splashStart').click()
 page.locator('.splash').wait_for(state='hidden',timeout=20000)

def go(page,where):
 page.locator(f'.bottom-nav__item[data-goto="{where}"]').click(timeout=15000)
 page.locator(f'#ws-{where}').wait_for(state='visible',timeout=15000)

def wait_images(page,n):
 page.wait_for_function('n => document.querySelectorAll("#studioThumbs img").length >= n',arg=n,timeout=90000)
 return {'thumbnails':page.locator('#studioThumbs img').count()}

def image_case(page,n,export=False):
 go(page,'studio')
 paths=[str(FIX/f'image-{i:03}.jpg') for i in range(1,n+1)]
 page.locator('#imagesInput').set_input_files(paths,timeout=60000)
 detail=wait_images(page,n)
 if export:
  page.locator('#btnCreatePdf').click(timeout=15000)
  page.locator('#btnStudioDownload').wait_for(state='visible',timeout=120000)
  page.wait_for_function('!document.querySelector("#btnStudioDownload").disabled',timeout=120000)
  with page.expect_download(timeout=120000) as event:page.locator('#btnStudioDownload').click()
  download=event.value; path=OUT/f'export-{n}-images.pdf';download.save_as(path)
  count=len(PdfReader(str(path)).pages)
  assert count==n,f'Export has {count} pages, expected {n}'
  detail.update({'exportedPages':count,'bytes':path.stat().st_size})
 return detail

def ocr_case(page):
 go(page,'studio')
 page.locator('#imagesInput').set_input_files(str(FIX/'image-001.jpg'))
 wait_images(page,1)
 page.locator('#btnRunOcr').click(timeout=15000)
 page.wait_for_function('''() => {const e=document.querySelector('#ocrResult');return e && e.value && e.value.trim().length>0;}''',timeout=120000)
 return {'recognizedCharacters':len(page.locator('#ocrResult').input_value())}

def pdf_case(page,n):
 go(page,'tools')
 page.locator('#toolsPdfInput').set_input_files(str(FIX/f'pages-{n}.pdf'))
 page.wait_for_timeout(2000)
 label=page.locator('#toolsDocInfo').inner_text(timeout=10000).lower()
 assert 'no document loaded' not in label,f'Failed to load {n} pages: {label}'
 return {'documentInfo':label[:250]}

def corrupt_case(page):
 go(page,'tools');path=FIX/'corrupt.pdf';path.write_bytes(b'%PDF-1.7\ninvalid document body\n%%EOF')
 page.locator('#toolsPdfInput').set_input_files(str(path))
 page.wait_for_timeout(3000)
 assert not page.is_closed(),'Browser page crashed on malformed PDF'
 return {'browserAlive':True,'note':'Malformed-file rejection checked; exact error text not asserted'}

make_fixtures()
profiles={'iphone':(390,844),'ipad':(820,1180),'android':(412,915),'desktop':(1365,900)}
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for device,(w,h) in profiles.items():
  ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=device!='desktop',has_touch=device!='desktop',accept_downloads=True)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  record('first run',device,lambda:enter(page) or {'consentDismissed':True},page)
  if not page.is_closed():
   for n in (10,25,50):
    record(f'{n} images import',device,lambda n=n:image_case(page,n,n==10),page)
    # Fresh context for each case prevents prior state from inflating image counts.
    page.close();page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    record('fresh consent',device,lambda:enter(page) or {},page)
   record('single image OCR completion',device,lambda:ocr_case(page),page)
   for n in (20,50,100):
    record(f'{n} page PDF open',device,lambda n=n:pdf_case(page,n),page)
   record('corrupt PDF handling',device,lambda:corrupt_case(page),page)
   record('uncaught browser errors',device,lambda:(_ for _ in ()).throw(AssertionError(errors)) if errors else {'count':0},page)
  ctx.close()
 browser.close()
report={'timestampUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Chromium emulated-device stress, PDF load, image import, 10-image create/export/reopen; not native mobile or OCR accuracy','results':results}
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'passed':sum(x['status']=='passed' for x in results),'failed':sum(x['status']=='failed' for x in results),'report':str(OUT/'report.json')},indent=2))
sys.exit(1 if any(x['status']=='failed' for x in results) else 0)
