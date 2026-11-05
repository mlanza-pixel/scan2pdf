#!/usr/bin/env python3
"""Actual UI-driven workflow regression; failures and unsupported operations are explicit.
Runs against a local/remote deployment in Chromium device emulation, not native iOS.
Each scenario starts in a clean browser context; synthetic documents only.
"""
import json, os, pathlib, sys, time, traceback, datetime, argparse
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from PIL import Image, ImageDraw, ImageFont
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/results/complete-app-v7741';OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser(description='Run independent DocuScan browser workflow tests')
parser.add_argument('url',nargs='?',default='http://127.0.0.1:8765/')
parser.add_argument('--profile',choices=['desktop','iphone-emulated','ipad-emulated','all'],default='all')
parser.add_argument('--case',choices=['consent','import','ocr','edit','library','errors','all'],default='all')
args=parser.parse_args()
URL=args.url
FIX=OUT/'synthetic';FIX.mkdir(exist_ok=True)
img=FIX/'ocr-source.png'; im=Image.new('RGB',(1300,800),'white'); d=ImageDraw.Draw(im)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
f=ImageFont.truetype(font,65) if pathlib.Path(font).exists() else ImageFont.load_default()
d.text((75,150),'DOCUSCAN INVOICE 12345',font=f,fill='black');d.text((75,300),'TOTAL 789.50',font=f,fill='black');im.save(img)
results=[]
def consent(page):
 page.goto(URL,wait_until='domcontentloaded',timeout=45000)
 if page.locator('#splashAccept').count() and page.locator('.splash').is_visible():
  page.locator('#splashAccept').check();page.locator('#splashStart').click()
 page.locator('.splash').wait_for(state='hidden',timeout=20000)
def nav(page,target):
 page.locator(f'.bottom-nav__item[data-goto="{target}"]').click()
 page.locator(f'#ws-{target}').wait_for(state='visible')
def download_pdf(page,selector,dest):
 page.locator(selector).wait_for(state='visible',timeout=45000)
 page.wait_for_function('(s)=>{let e=document.querySelector(s);return e&&!e.disabled}',arg=selector,timeout=90000)
 with page.expect_download(timeout=90000) as ev:page.locator(selector).click()
 ev.value.save_as(dest)
 assert pathlib.Path(dest).stat().st_size>2000,'Downloaded PDF suspiciously small'
 assert len(PdfReader(dest).pages)>0,'Exported PDF cannot reopen in independent parser'
 return {'bytes':pathlib.Path(dest).stat().st_size,'pages':len(PdfReader(dest).pages)}
def case(page,name,fn,profile):
 start=time.monotonic()
 try:
  details=fn();results.append(dict(profile=profile,case=name,status='passed',seconds=round(time.monotonic()-start,2),details=details))
 except Exception as ex:
  shot=OUT/f'{profile}-{name.replace(" ","-")}-FAIL.png'
  try:page.screenshot(path=str(shot),full_page=True,timeout=12000)
  except Exception:pass
  results.append(dict(profile=profile,case=name,status='failed',seconds=round(time.monotonic()-start,2),error=str(ex),traceback=traceback.format_exc()[-2000:],screenshot=str(shot.relative_to(ROOT))))
def studio_workflow(page,profile):
 nav(page,'studio');page.locator('#imagesInput').set_input_files(str(img))
 page.wait_for_function('document.querySelectorAll("#studioThumbs img").length>=1',timeout=45000)
 page.locator('#btnCreatePdf').click()
 page.wait_for_function('!document.querySelector("#btnStudioDownload").disabled',timeout=90000)
 exported=download_pdf(page,'#btnStudioDownload',str(OUT/f'{profile}-studio-export.pdf'))
 nav(page,'tools');page.locator('#toolsPdfInput').set_input_files(str(OUT/f'{profile}-studio-export.pdf'))
 page.wait_for_function('!document.querySelector("#btnToolsDownload").disabled',timeout=60000)
 info=page.locator('#toolsDocInfo').inner_text()
 assert 'no document loaded' not in info.lower(),info
 return {'importedImages':1,'export':exported,'reopenedInTools':True,'documentInfo':info[:200]}
def ocr_workflow(page):
 nav(page,'studio');page.locator('#imagesInput').set_input_files(str(img))
 page.wait_for_function('document.querySelectorAll("#studioThumbs img").length>=1',timeout=45000)
 page.locator('#btnRunOcr').click()
 page.wait_for_function('document.querySelector("#ocrResult")?.value?.trim().length>0',timeout=120000)
 recognized=page.locator('#ocrResult').input_value().upper()
 expected=['DOCUSCAN','INVOICE','12345','TOTAL','789.50']
 matched=[s for s in expected if s in recognized]
 assert len(matched)>=4,f'OCR accuracy below 4/5 tokens: {recognized[:300]!r}'
 return {'tokensMatched':len(matched),'tokensExpected':len(expected),'recognizedSample':recognized[:250]}
def sign_workflow(page,profile):
 # Use previously generated synthetic PDF; this exercises actual import and export UI.
 src=OUT/f'{profile}-studio-export.pdf'
 assert src.exists(),'Studio export prerequisite not met'
 nav(page,'sign');page.locator('#signPdfInput').set_input_files(str(src))
 page.wait_for_function('!document.querySelector("#btnAddText").disabled',timeout=60000)
 page.locator('#btnAddText').click()
 # A click alone is not proof of an edit. Require edited output to differ from source.
 dst=str(OUT/f'{profile}-sign-edited.pdf')
 exported=download_pdf(page,'#btnDownloadPdf',dst)
 original=src.read_bytes();changed=pathlib.Path(dst).read_bytes()
 assert original!=changed,'Sign export identical to original; edit not proven'
 return {'editControl':'Add Text','export':exported,'changedBytes':True,'note':'Further visual/text placement assertions required'}
def save_reopen_workflow(page,profile):
 src=OUT/f'{profile}-studio-export.pdf'
 assert src.exists(),'Studio export prerequisite not met'
 nav(page,'sign');page.locator('#signPdfInput').set_input_files(str(src))
 page.wait_for_function('!document.querySelector("#btnSaveToLibrary").disabled',timeout=60000)
 page.locator('#btnSaveToLibrary').click()
 nav(page,'library')
 page.wait_for_timeout(2000)
 text=page.locator('#libraryGrid').inner_text()
 assert text.strip() and 'no documents' not in text.lower(),'Saved document absent from Library'
 # We do not claim reopen without activating a saved entry and checking a rendered page.
 candidates=page.locator('#libraryGrid button')
 assert candidates.count()>0,'Library has no actionable saved-document button; reopen not proven'
 candidates.first.click()
 page.wait_for_timeout(1000)
 return {'savedLibraryText':text[:200],'clickedSavedItem':True,'note':'Opened saved-item action; full PDF canvas reopen must be independently verified'}
profiles={'desktop':(1365,900),'iphone-emulated':(390,844),'ipad-emulated':(820,1180)}
selected=profiles if args.profile=='all' else {args.profile:profiles[args.profile]}
# Every case starts with its own clean context; dependent workflows generate their own fixture.
# This prevents one failed import from causing unrelated tests to be incorrectly marked passed.
def run_selected(page,profile,kind):
 consent(page)
 if kind=='consent': return {'dismissed':True}
 if kind=='import': return studio_workflow(page,profile)
 if kind=='ocr': return ocr_workflow(page)
 if kind=='edit':
  studio_workflow(page,profile)
  return sign_workflow(page,profile)
 if kind=='library':
  studio_workflow(page,profile)
  return save_reopen_workflow(page,profile)
 if kind=='errors':
  for dest in ['home','sign','tools','studio','library','help']: nav(page,dest)
  return {'navigated':6}
 raise ValueError(kind)
cases=['consent','import','ocr','edit','library','errors'] if args.case=='all' else [args.case]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH') or None,args=['--no-sandbox'])
 for profile,(w,h) in selected.items():
  for kind in cases:
   ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=profile!='desktop',has_touch=profile!='desktop',accept_downloads=True)
   page=ctx.new_page();errors=[]
   page.on('pageerror',lambda err:errors.append(str(err)))
   def task():
    detail=run_selected(page,profile,kind)
    if errors:raise AssertionError('Uncaught browser errors: '+str(errors[:5]))
    return detail
   case(page,kind,task,profile)
   ctx.close()
 browser.close()
report={'suite':'complete-app-workflows-v7741-split','generatedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'selectedCase':args.case,'selectedProfile':args.profile,
 'limitations':['Chromium emulation is not native iOS Safari','Edit requires stronger rendered annotation assertions','Library reopen requires stronger PDF canvas assertions','Native camera, sharing, printing excluded'], 'results':results}
filename=f'report-{args.profile}-{args.case}.json'
(OUT/filename).write_text(json.dumps(report,indent=2))
print(json.dumps({'passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results),'report':str(OUT/filename)}))
sys.exit(1 if any(r['status']=='failed' for r in results) else 0)
