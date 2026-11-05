#!/usr/bin/env python3
"""Actual UI-driven workflow regression; failures and unsupported operations are explicit.
Runs against a local/remote deployment in Chromium device emulation, not native iOS.
Each scenario starts in a clean browser context; synthetic documents only.
"""
import re, json, os, pathlib, sys, time, traceback, datetime, argparse
from playwright.sync_api import expect, sync_playwright
from pypdf import PdfReader
from PIL import Image, ImageDraw, ImageFont
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/results/complete-app-v7741';OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser(description='Run independent DocuScan browser workflow tests')
parser.add_argument('url',nargs='?',default='http://127.0.0.1:8765/')
parser.add_argument('--profile',choices=['desktop','iphone-emulated','ipad-emulated','all'],default='all')
parser.add_argument('--case',choices=['consent','import','ocr','edit','annotations','tools','library','errors','studio-capture','sign-history','tools-pages','tools-text','folders','help','tools-raster','tools-batch','tools-forms','tools-size','tools-ocr','all'],default='all')
args=parser.parse_args()
URL=args.url
FIX=OUT/'synthetic'/f'{args.profile}-{args.case}';FIX.mkdir(parents=True,exist_ok=True)
img=FIX/'ocr-source.png'; im=Image.new('RGB',(1300,800),'white'); d=ImageDraw.Draw(im)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
f=ImageFont.truetype(font,65) if pathlib.Path(font).exists() else ImageFont.load_default()
d.text((75,150),'DOCUSCAN INVOICE 12345',font=f,fill='black');d.text((75,300),'TOTAL 789.50',font=f,fill='black');im.save(img)
results=[]
def consent(page):
 page.goto(URL,wait_until='domcontentloaded',timeout=45000)
 page.locator('#splashAccept').wait_for(state='visible',timeout=20000)
 page.locator('#splashAccept').check()
 page.locator('#splashStart').click()
 page.locator('.splash').wait_for(state='hidden',timeout=20000)
def nav(page,target):
 page.locator(f'.bottom-nav__item[data-goto="{target}"]').click()
 page.locator(f'#ws-{target}').wait_for(state='visible')
def download_pdf(page,selector,dest):
 page.locator(selector).wait_for(state='visible',timeout=45000)
 page.wait_for_function('(s)=>{let e=document.querySelector(s);return e&&!e.disabled}',arg=selector,timeout=90000)
 with page.expect_download(timeout=90000) as ev:page.locator(selector).click()
 ev.value.save_as(dest)
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
 page.locator('#btnDeletePage').click()
 assert page.locator('#studioThumbs img').count()==0,'Studio Remove left the page in place'
 page.locator('#btnStudioUndo').click()
 page.locator('#studioThumbs img').wait_for(state='visible')
 page.locator('#btnStudioRedo').click()
 assert page.locator('#studioThumbs img').count()==0,'Studio Redo did not remove the page'
 page.locator('#btnStudioUndo').click()
 page.locator('#studioThumbs img').wait_for(state='visible')
 page.once('dialog',lambda dialog: dialog.dismiss())
 page.locator('#btnCreatePdf').click()
 page.wait_for_function('!document.querySelector("#btnStudioDownload").disabled',timeout=90000)
 exported=download_pdf(page,'#btnStudioDownload',str(OUT/f'{profile}-{args.case}-studio-export.pdf'))
 nav(page,'tools');page.locator('#toolsPdfInput').set_input_files(str(OUT/f'{profile}-{args.case}-studio-export.pdf'))
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
 assert not recognized.startswith('(OCR FAILED:'),recognized
 expected=['DOCUSCAN','INVOICE','12345','TOTAL','789.50']
 matched=[s for s in expected if s in recognized]
 assert len(matched)>=4,f'OCR accuracy below 4/5 tokens: {recognized[:300]!r}'
 return {'tokensMatched':len(matched),'tokensExpected':len(expected),'recognizedSample':recognized[:250]}
def sign_workflow(page,profile):
 # Use previously generated synthetic PDF; this exercises actual import and export UI.
 src=OUT/f'{profile}-{args.case}-studio-export.pdf'
 assert src.exists(),'Studio export prerequisite not met'
 nav(page,'sign');page.locator('#signPdfInput').set_input_files(str(src))
 page.wait_for_function('!document.querySelector("#btnAddText").disabled',timeout=60000)
 page.locator('#textInput').fill('DocuScan workflow check')
 page.locator('#btnAddText').click()
 # A click alone is not proof of an edit. Require edited output to differ from source.
 dst=str(OUT/f'{profile}-sign-edited.pdf')
 exported=download_pdf(page,'#btnDownloadPdf',dst)
 original=src.read_bytes();changed=pathlib.Path(dst).read_bytes()
 assert original!=changed,'Sign export identical to original; edit not proven'
 assert 'DocuScan workflow check' in PdfReader(dst).pages[0].extract_text()
 page.locator('#btnAddSignature').click()
 pad=page.locator('#signaturePad')
 pad.scroll_into_view_if_needed()
 rect=pad.bounding_box()
 page.mouse.move(rect['x']+20,rect['y']+25)
 page.mouse.down()
 page.mouse.move(rect['x']+100,rect['y']+45,steps=5)
 page.mouse.move(rect['x']+145,rect['y']+20,steps=5)
 page.mouse.up()
 page.locator('#btnInsertSig').click()
 page.locator('#signatureSheet').wait_for(state='hidden')
 signature=page.locator('.object-overlay.is-selected').filter(has=page.get_by_alt_text('Signature'))
 handle=signature.locator('.object-overlay__resize')
 handle.scroll_into_view_if_needed()
 rect=handle.bounding_box()
 x,y=rect['x']+rect['width']/2,rect['y']+rect['height']/2
 before=signature.locator('img').bounding_box()
 page.mouse.move(x,y)
 page.mouse.down()
 page.mouse.move(x+26,y+16,steps=6)
 page.mouse.up()
 after=signature.locator('img').bounding_box()
 assert after['width']>before['width'] and after['height']>before['height'],'Drawn signature did not resize'
 stage=page.locator('#signCanvasStage').bounding_box()
 signed=OUT/f'{profile}-resized-signature.pdf'
 download_pdf(page,'#btnDownloadPdf',str(signed))
 signed_page=PdfReader(signed).pages[0]
 width,height=float(signed_page.mediabox.width),float(signed_page.mediabox.height)
 image_sizes=[]
 def image_size(operator,args,matrix,_):
  if operator==b'Do':
   image_sizes.append((abs(matrix[0])/width,abs(matrix[3])/height))
 signed_page.extract_text(visitor_operand_before=image_size)
 assert any(abs(w-after['width']/stage['width'])<.015 and abs(h-after['height']/stage['height'])<.015
            for w,h in image_sizes),'Exported signature dimensions differ from preview'
 return {'editControl':'Add Text','export':exported,'changedBytes':True,'drawnSignatureResizedAndExported':True}
def drag(page, target, dx, dy):
 target.scroll_into_view_if_needed()
 rect=target.bounding_box()
 x,y=rect['x']+rect['width']/2,rect['y']+rect['height']/2
 page.mouse.move(x,y)
 page.mouse.down()
 page.mouse.move(x+dx,y+dy,steps=8)
 page.mouse.up()

def annotation_geometry(overlay):
 return overlay.evaluate("""element => {
   const box=element.getBoundingClientRect(), stage=element.parentElement.getBoundingClientRect();
   return {x:(box.left+box.width/2-stage.left)/stage.width,
           y:1-(box.top+box.height/2-stage.top)/stage.height,
           width:box.width/stage.width,height:box.height/stage.height};
 }""")

def annotation_workflow(page,profile):
 nav(page,'sign')
 page.locator('#signPdfInput').set_input_files(str(ROOT/'tests/fixtures/document-5-pages.pdf'))
 page.locator('#btnAddHighlight').click()
 selected=page.locator('.object-overlay.is-selected')
 selected.wait_for(state='visible')
 drag(page,selected,15,30)
 drag(page,selected.locator('.object-overlay__resize'),18,10)
 highlight=annotation_geometry(selected)
 assert abs(highlight['y']-.5)>.02 and highlight['width']>.43 and highlight['height']>.07
 page.locator('#btnAddWatermark').click()
 page.locator('#wmText').fill('QA CHECK')
 page.locator('#wmDirection').select_option('horizontal')
 page.locator('#wmOpacity').fill('60')
 page.locator('#btnInsertWatermark').click()
 mark=selected.filter(has_text='QA CHECK')
 mark.wait_for(state='visible')
 initial=annotation_geometry(mark)
 drag(page,mark,-14,-30)
 drag(page,mark.locator('.object-overlay__resize'),15,8)
 watermark=annotation_geometry(mark)
 assert watermark['width']>initial['width']+.02 and watermark['y']>initial['y']+.02
 dest=OUT/f'{profile}-annotations.pdf'
 exported=download_pdf(page,'#btnDownloadPdf',str(dest))
 pdf=PdfReader(dest)
 assert exported['pages']==5
 first=pdf.pages[0]
 width,height=float(first.mediabox.width),float(first.mediabox.height)
 rectangles=[]
 points=[]
 def record_path(operator,args,matrix,_):
  if operator==b'm': points.clear()
  if operator in (b'm',b'l'):
   x,y=map(float,args)
   a,b,c,d,e,f=matrix
   points.append((a*x+c*y+e,b*x+d*y+f))
  if operator in (b'f',b'f*') and len(points)==4:
   xs,ys=zip(*points)
   rectangles.append((min(xs),min(ys),max(xs)-min(xs),max(ys)-min(ys)))
 first.extract_text(visitor_operand_before=record_path)
 assert any(abs((x+w/2)/width-highlight['x'])<.02 and
            abs((y+h/2)/height-highlight['y'])<.02 and
            abs(w/width-highlight['width'])<.02 and
            abs(h/height-highlight['height'])<.02 for x,y,w,h in rectangles), 'Exported highlight geometry differs from preview'
 watermark_text=[]
 first.extract_text(visitor_text=lambda text,cm,tm,font,size: watermark_text.append((tm,size)) if 'QA CHECK' in text else None)
 assert len(watermark_text)==1
 tm,size=watermark_text[0]
 assert abs((tm[5]+size/2)/height-watermark['y'])<.02,'Exported watermark vertical placement differs from preview'
 assert all('QA CHECK' in item.extract_text() for item in pdf.pages)
 page.locator('#btnRemoveWatermark').click()
 mark.wait_for(state='detached')
 removed=OUT/f'{profile}-watermark-removed.pdf'
 download_pdf(page,'#btnDownloadPdf',str(removed))
 assert all('QA CHECK' not in item.extract_text() for item in PdfReader(removed).pages)
 return {'highlightGeometryVerified':True,'watermarkPages':5,'watermarkPlacementVerified':True,'watermarkRemovalVerified':True}

def tools_workflow(page,profile):
 fixtures=ROOT/'tests/fixtures'
 nav(page,'tools')
 with page.expect_file_chooser() as chooser:
  page.locator('#btnOpenPdfTools').click()
 chooser.value.set_files(str(fixtures/'document-5-pages.pdf'))
 page.get_by_text("Loaded PDF.",exact=True).wait_for(state="visible")
 pages=page.locator('#toolsGroups [data-group="pages"]')
 pages.click()
 assert not page.locator('.tools-tab[data-tab="rotate"]').is_visible()
 pages.click()
 page.locator('.tools-tab[data-tab="rotate"]').click()
 page.locator('#rotateAngles [data-angle="90"]').click()
 page.locator('#btnRunToolOp').click()
 dest=OUT/f'{profile}-tools.pdf'
 def exported_rotations():
  download_pdf(page,'#btnToolsDownload',str(dest))
  return [item.rotation for item in PdfReader(dest).pages]
 assert exported_rotations()==[90]*5,'Rotate did not affect all exported pages'
 page.locator('#btnToolsUndo').click()
 page.get_by_text('Undone.',exact=True).wait_for(state='visible')
 assert exported_rotations()==[0]*5,'Undo did not restore original page rotations'
 page.locator('#btnToolsRedo').click()
 page.get_by_text('Redone.',exact=True).wait_for(state='visible')
 assert exported_rotations()==[90]*5,'Redo did not restore page rotations'
 page.locator('#toolsGroups [data-group="combine"]').click()
 page.locator('.tools-tab[data-tab="merge"]').click()
 with page.expect_file_chooser() as chooser:
  page.locator('#btnAddSecondPdf').click()
 chooser.value.set_files(str(fixtures/'document-10-pages.pdf'))
 page.get_by_text("Added \"document-10-pages.pdf\" for merge",exact=False).wait_for(state="visible")
 page.locator('#btnRunToolOp').click()
 result=download_pdf(page,'#btnToolsDownload',str(dest))
 assert result['pages']==15,'Merge export did not contain both source PDFs'
 page.locator('#btnToolsRemove').click()
 page.get_by_text('Output removed',exact=False).wait_for(state='visible')
 assert exported_rotations()==[0]*5,'Remove did not restore the original five-page PDF'
 return {'rotateUndoRedoVerified':True,'mergedPages':15,'removeRestoredSource':True}

def studio_capture_workflow(page, profile):
 nav(page,'studio')
 with page.expect_file_chooser() as chooser:
  page.locator('#btnCaptureCamera').click()
 assert chooser.value.element.get_attribute('capture')=='environment'
 chooser.value.set_files(str(ROOT/'tests/fixtures/photo-1.jpg'))
 page.locator('#studioThumbs img').wait_for(state='visible')
 preview=page.locator('#studioPreviewCanvas')
 original=preview.evaluate('(canvas)=>canvas.toDataURL()')
 preset=page.locator('#enhancePresets [data-preset="grayscale"]')
 preset.click()
 assert preset.get_attribute('aria-pressed')=='true'
 page.locator('#btnApplyEnhance').click()
 enhanced=preview.evaluate('(canvas)=>canvas.toDataURL()')
 assert enhanced!=original,'Enhancement left preview unchanged'
 page.locator('#btnStudioUndo').click()
 assert preview.evaluate('(canvas)=>canvas.toDataURL()')==original
 page.locator('#btnStudioRedo').click()
 assert preview.evaluate('(canvas)=>canvas.toDataURL()')==enhanced
 dest=OUT/f'{profile}-capture.pdf'
 download_pdf(page,'#btnStudioDownload',str(dest))
 image=next(iter(PdfReader(dest).pages[0].images)).image.convert('RGB')
 pixels=list(image.resize((40,40)).getdata())
 assert all(max(pixel)-min(pixel)<=3 for pixel in pixels),'Exported image was not grayscale'
 page.locator('#btnResetEnhance').click()
 assert preview.evaluate('(canvas)=>canvas.toDataURL()')==original
 dims=preview.evaluate('(canvas)=>[canvas.width,canvas.height]')
 page.locator('#btnRotatePage').click()
 turned=preview.evaluate('(canvas)=>[canvas.width,canvas.height]')
 assert (dims[0]>dims[1])!=(turned[0]>turned[1])
 page.once('dialog',lambda dialog: dialog.dismiss())
 page.locator('#btnClearAllPages').click()
 assert page.locator('#studioThumbs img').count()==1
 page.once('dialog',lambda dialog: dialog.accept())
 page.locator('#btnClearAllPages').click()
 assert page.locator('#studioThumbs img').count()==0
 page.locator('#btnStudioUndo').click()
 page.locator('#studioThumbs img').wait_for()
 return {'captureInput':True,'grayscaleExport':True,'undoRedo':True,'resetRotateAndClear':True}

def open_fixture(page, workspace):
 nav(page,workspace)
 selector='#signPdfInput' if workspace=='sign' else '#toolsPdfInput'
 page.locator(selector).set_input_files(str(ROOT/'tests/fixtures/document-5-pages.pdf'))
 control='#btnAddDate' if workspace=='sign' else '#btnToolsDownload'
 page.wait_for_function('(s)=>!document.querySelector(s).disabled',arg=control)
 if workspace=='tools': page.get_by_text('Loaded PDF.',exact=True).wait_for()

def sign_history_workflow(page, profile):
 open_fixture(page,'sign')
 overlays=page.locator('.object-overlay')
 page.locator('#btnAddDate').click()
 date=overlays.first.inner_text()
 assert date.strip()
 page.once('dialog',lambda dialog: dialog.accept('1'))
 page.locator('#btnAddStamp').click()
 assert 'APPROVED' in overlays.all_inner_texts()
 page.locator('#btnAddUnderline').click()
 page.locator('#btnAddStrike').click()
 assert overlays.count()==4
 page.locator('#btnRemoveSelected').click()
 assert overlays.count()==3
 page.locator('#btnUndo').click()
 page.wait_for_function("document.querySelectorAll('.object-overlay').length===4")
 page.locator('#btnRedo').click()
 page.wait_for_function("document.querySelectorAll('.object-overlay').length===3")
 page.locator('#btnAddSignature').click()
 page.locator('#signatureSheet [data-sigtab="type"]').click()
 page.locator('#typedSig').fill('QA signature')
 page.locator('#btnInsertSig').click()
 page.locator('#signatureSheet').wait_for(state='hidden')
 dest=OUT/f'{profile}-sign-history.pdf'
 download_pdf(page,'#btnDownloadPdf',str(dest))
 pdf_page=PdfReader(dest).pages[0]
 text=pdf_page.extract_text()
 assert 'APPROVED' in text and date in text
 assert list(pdf_page.images),'Typed signature missing from export'
 return {'dateStampAndTypedSignatureExported':True,'underlineAndStrikeCreated':True,'removeUndoRedo':True}

def tools_pages_workflow(page, profile):
 open_fixture(page,'tools')
 dest=OUT/f'{profile}-pages.pdf'
 def apply():
  page.locator('#btnRunToolOp').click()
  download_pdf(page,'#btnToolsDownload',str(dest))
  return PdfReader(dest)
 page.locator('.tools-tab[data-tab="split"]').click()
 page.locator('#splitRanges').fill('2-3')
 result=apply()
 assert len(result.pages)==2 and 'DOC5-PAGE02' in result.pages[0].extract_text()
 page.locator('.tools-tab[data-tab="insert"]').click()
 page.locator('#insertAfterPage').fill('1')
 result=apply()
 assert len(result.pages)==3 and not result.pages[1].extract_text().strip()
 page.locator('.tools-tab[data-tab="deletes"]').click()
 page.locator('#deleteThumbStrip .thumb').nth(1).click()
 result=apply()
 assert len(result.pages)==2 and 'DOC5-PAGE03' in result.pages[1].extract_text()
 page.locator('.tools-tab[data-tab="reorder"]').click()
 thumbs=page.locator('#reorderThumbStrip .thumb')
 second=thumbs.nth(1).locator('canvas').evaluate('(canvas)=>canvas.toDataURL()')
 for index in range(3):
  thumbs.nth(1).drag_to(thumbs.first)
  expected='2,1' if index%2==0 else '1,2'
  assert page.locator('#reorderInput').input_value()==expected
 assert thumbs.first.locator('canvas').evaluate('(canvas)=>canvas.toDataURL()')==second
 result=apply()
 assert 'DOC5-PAGE03' in result.pages[0].extract_text()
 page.locator('.tools-tab[data-tab="crop"]').click()
 result=apply()
 assert all(float(item.cropbox.width)<float(item.mediabox.width) for item in result.pages)
 return {'splitVerified':True,'insertedBlankPage':True,'deletedSelectedPage':True,'reorderAndCropVerified':True}

def tools_text_workflow(page, profile):
 open_fixture(page,'tools')
 page.locator('#toolsGroups [data-group="extract"]').click()
 page.locator('.tools-tab[data-tab="extracttext"]').click()
 page.locator('#btnExtractText').click()
 page.wait_for_function("document.querySelector('#extractedTextResult').value.includes('DOC5-PAGE05')")
 with page.expect_download() as event:
  page.locator('#btnDownloadExtracted').click()
 dest=OUT/f'{profile}-extracted.txt'
 event.value.save_as(dest)
 assert all(f'DOC5-PAGE0{i}' in dest.read_text() for i in range(1,6))
 page.locator('#toolsGroups [data-group="content"]').click()
 page.locator('.tools-tab[data-tab="annotate"]').click()
 page.locator('#annotateText').fill('QA tools annotation')
 page.locator('#btnRunToolOp').click()
 output=OUT/f'{profile}-tools-markup.pdf'
 download_pdf(page,'#btnToolsDownload',str(output))
 assert 'QA tools annotation' in PdfReader(output).pages[0].extract_text()
 def export_tool():
  page.locator('#btnRunToolOp').click()
  download_pdf(page,'#btnToolsDownload',str(output))
  return PdfReader(output)
 page.locator('#annotateSubTabs [data-subtab="draw"]').click()
 draw=page.locator('#toolsDrawCanvas')
 draw.scroll_into_view_if_needed()
 initial=draw.evaluate('(canvas)=>canvas.toDataURL()')
 drag(page,draw,32,20)
 assert draw.evaluate('(canvas)=>canvas.toDataURL()')!=initial
 page.locator('#btnClearDraw').click()
 assert draw.evaluate('(canvas)=>canvas.toDataURL()')==initial
 drag(page,draw,35,22)
 page.once('dialog',lambda dialog: dialog.dismiss())
 drawn=export_tool()
 assert list(drawn.pages[0].images),'Freehand drawing missing from PDF output'
 page.locator('.tools-tab[data-tab="watermark"]').click()
 page.locator('#twmText').fill('QA tools watermark')
 page.locator('#twmDirection').select_option('horizontal')
 assert all('QA tools watermark' in item.extract_text() for item in export_tool().pages)
 page.locator('.tools-tab[data-tab="header"]').click()
 page.locator('#headerText').fill('QA header')
 page.locator('#footerText').fill('QA footer')
 page.locator('#pageNumFormat').select_option('of')
 assert all('QA header' in item.extract_text() and f'Page {n} of 5' in item.extract_text()
            for n,item in enumerate(export_tool().pages,1))
 page.locator('.tools-tab[data-tab="imagewatermark"]').click()
 page.locator('#imageWmFile').set_input_files(str(ROOT/'tests/fixtures/photo-1.jpg'))
 assert all(list(item.images) for item in export_tool().pages)
 page.locator('#toolsGroups [data-group="properties"]').click()
 page.locator('.tools-tab[data-tab="metadata"]').click()
 page.locator('#metaTitle').fill('QA updated title')
 page.locator('#metaAuthor').fill('QA author')
 metadata=export_tool().metadata
 assert metadata.title=='QA updated title' and metadata.author=='QA author'
 page.locator('.tools-tab[data-tab="bookmarks"]').click()
 page.locator('#bookmarkTitle').fill('QA page three')
 page.locator('#bookmarkPage').fill('3')
 page.locator('#btnAddBookmark').click()
 bookmarked=export_tool()
 assert bookmarked.outline[0].title=='QA page three'
 assert bookmarked.get_destination_page_number(bookmarked.outline[0])==2
 return {'textExtractedFromAllPages':True,'textAndFreehandAnnotationsExported':True,'textAndImageWatermarks':True,'headerFooterAndMetadata':True,'bookmarkDestinationVerified':True}

def tools_raster_workflow(page, profile):
 open_fixture(page,'tools')
 dest=OUT/f'{profile}-raster.pdf'
 page.locator('#toolsGroups [data-group="extract"]').click()
 page.locator('.tools-tab[data-tab="toimage"]').click()
 with page.expect_download() as event:
  page.locator('#btnRunToolOp').click()
 image_path=OUT/f'{profile}-page.jpg'
 event.value.save_as(image_path)
 with Image.open(image_path) as image:
  assert image.width>0 and image.height>0
 page.locator('.tools-tab[data-tab="invert"]').click()
 page.locator('#btnRunToolOp').click()
 download_pdf(page,'#btnToolsDownload',str(dest))
 inverted=PdfReader(dest)
 assert len(inverted.pages)==5
 picture=next(iter(inverted.pages[0].images)).image.convert('RGB')
 assert max(picture.getpixel((10,10)))<50
 page.locator('#toolsGroups [data-group="properties"]').click()
 page.locator('.tools-tab[data-tab="compress"]').click()
 page.locator('#compressLevels [data-level="strong"]').click()
 page.locator('#btnRunToolOp').click()
 download_pdf(page,'#btnToolsDownload',str(dest))
 compressed=PdfReader(dest)
 assert len(compressed.pages)==5 and all(list(item.images) for item in compressed.pages)
 return {'pageImageDownload':True,'inversionPixelsVerified':True,'compressedPdfReopened':True}

def tools_batch_workflow(page, profile):
 open_fixture(page,'tools')
 fixtures=ROOT/'tests/fixtures'
 page.locator('#toolsGroups [data-group="combine"]').click()
 page.locator('.tools-tab[data-tab="compare"]').click()
 with page.expect_file_chooser() as chooser:
  page.locator('#btnAddSecondPdf').click()
 chooser.value.set_files(str(fixtures/'document-10-pages.pdf'))
 page.locator('#compareLeftWrap canvas').wait_for()
 page.locator('#compareRightWrap canvas').wait_for()
 page.locator('#btnRunToolOp').click()
 page.locator('#compareRightWrap canvas').wait_for()
 page.locator('#toolsGroups [data-group="batch"]').click()
 page.locator('#batchOp').select_option('rotate90')
 with page.expect_file_chooser() as chooser:
  page.locator('#btnBatchAddFiles').click()
 chooser.value.set_files([str(fixtures/'document-5-pages.pdf'),str(fixtures/'document-10-pages.pdf')])
 page.get_by_text('document-10-pages.pdf',exact=False).last.wait_for()
 page.locator('#btnRunToolOp').click()
 page.get_by_text('Batch complete: 2/2 files processed.',exact=True).wait_for()
 nav(page,'library')
 expect(page.locator('#libraryGrid .library-card')).to_have_count(2)
 for count in (5,10):
  card=page.locator('#libraryGrid .library-card').filter(has_text=f'document-{count}-pages')
  card.get_by_role('button',name='Tools',exact=True).click()
  page.locator('#ws-tools').wait_for()
  dest=OUT/f'{profile}-batch-{count}.pdf'
  download_pdf(page,'#btnToolsDownload',str(dest))
  assert [item.rotation for item in PdfReader(dest).pages]==[90]*count
  nav(page,'library')
 return {'twoPreviewsRendered':True,'twoBatchPdfsVerified':True}

def tools_forms_workflow(page, profile):
 from reportlab.pdfgen.canvas import Canvas
 fixture=OUT/f'{profile}-form.pdf'
 form=Canvas(str(fixture))
 form.acroForm.textfield(name='customer',x=100,y=650,width=220,height=25,value='Before')
 form.showPage()
 form.save()
 nav(page,'tools')
 page.locator('#toolsPdfInput').set_input_files(str(fixture))
 page.locator('#toolsGroups [data-group="content"]').click()
 page.locator('.tools-tab[data-tab="forms"]').click()
 page.locator('#btnRunToolOp').click()
 page.locator('[data-form-field="customer"]').fill('After')
 page.locator('#btnRunToolOp').click()
 dest=OUT/f'{profile}-filled.pdf'
 download_pdf(page,'#btnToolsDownload',str(dest))
 assert PdfReader(dest).get_fields()['customer']['/V']=='After'
 page.locator('#toolsGroups [data-group="properties"]').click()
 page.locator('.tools-tab[data-tab="protect"]').click()
 page.locator('#protectUserPwd').fill('first')
 page.locator('#protectConfirmPwd').fill('second')
 page.locator('#btnRunToolOp').click()
 page.get_by_text('Operation failed: Passwords do not match.',exact=True).wait_for()
 return {'filledFormValueVerified':True,'mismatchedPasswordsRejected':True}

def tools_size_workflow(page, profile):
 nav(page,'tools')
 fixture=ROOT/'tests/fixtures/sample/ocr_010pages_q78.pdf'
 page.locator('#toolsPdfInput').set_input_files(str(fixture))
 page.get_by_text('Loaded PDF.',exact=True).wait_for()
 page.locator('.tools-tab[data-tab="splitbysize"]').click()
 page.locator('#splitSizeLimit').fill('1')
 page.locator('#btnRunToolOp').click()
 first=OUT/f'{profile}-split-first.pdf'
 download_pdf(page,'#btnToolsDownload',str(first))
 assert first.stat().st_size<=1048576
 pages=len(PdfReader(first).pages)
 nav(page,'library')
 part=page.locator('#libraryGrid .library-card').filter(has_text='Split part 2')
 part.get_by_role('button',name='Tools',exact=True).click()
 page.locator('#ws-tools').wait_for()
 second=OUT/f'{profile}-split-second.pdf'
 download_pdf(page,'#btnToolsDownload',str(second))
 assert second.stat().st_size<=1048576
 assert pages+len(PdfReader(second).pages)==10
 return {'bothChunksUnderOneMiB':True,'allTenPagesRetained':True}

def tools_ocr_workflow(page, profile):
 nav(page,'tools')
 fixture=ROOT/'tests/fixtures/sample/ocr_005pages_q78.pdf'
 ground_truth=json.loads(fixture.with_suffix('.pdf.groundtruth.json').read_text())['groundTruth'][0]
 page.locator('#toolsPdfInput').set_input_files(str(fixture))
 page.get_by_text('Loaded PDF.',exact=True).wait_for()
 page.locator('#toolsGroups [data-group="extract"]').click()
 page.locator('.tools-tab[data-tab="ocrpdf"]').click()
 page.locator('#pdfOcrPages').select_option('1')
 page.locator('#btnRunToolOp').click()
 page.wait_for_function("document.querySelector('#pdfOcrResult').value.trim().length>0",timeout=120000)
 raw=page.locator('#pdfOcrResult').input_value()
 assert 'OCR engine failed' not in raw,raw
 recognized=' '.join(raw.splitlines()[1:]).upper()
 assert ground_truth['invoice'] in recognized and ground_truth['amount'] in recognized,recognized
 return {'fixturePage':1,'invoiceVerified':True,'amountVerified':True}

def folders_workflow(page, profile):
 open_fixture(page,'sign')
 page.locator('#btnSaveToLibrary').click()
 nav(page,'library')
 doc=page.locator('#libraryGrid .library-card')
 doc.wait_for(state='visible')
 page.once('dialog',lambda dialog: dialog.accept('QA folder'))
 page.locator('#btnNewFolder').click()
 folder=page.locator('#libraryFolders [data-folder-id]').filter(has_text='QA folder')
 folder.get_by_text('0 document(s)',exact=True).wait_for()
 page.once('dialog',lambda dialog: dialog.accept('1'))
 doc.get_by_role('button',name='Move',exact=True).click()
 folder.get_by_text('1 document(s)',exact=True).wait_for()
 page.reload(wait_until='domcontentloaded')
 nav(page,'library')
 folder.get_by_text('1 document(s)',exact=True).wait_for()
 folder.get_by_role('button',name='Open',exact=True).click()
 page.get_by_text('Showing 1 doc(s) in "QA folder".',exact=True).wait_for()
 doc.wait_for(state='visible')
 page.once('dialog',lambda dialog: dialog.dismiss())
 folder.get_by_role('button',name='Delete',exact=True).click()
 assert folder.is_visible()
 page.once('dialog',lambda dialog: dialog.accept())
 folder.get_by_role('button',name='Delete',exact=True).click()
 folder.wait_for(state='detached')
 doc.get_by_role('button',name='Open in Sign').click()
 page.locator('#signCanvasStage').wait_for(state='visible')
 return {'createMoveOpenDelete':True,'membershipSurvivedReload':True,'pdfSurvivedFolderDelete':True}

def help_workflow(page, profile):
 nav(page,'help')
 search=page.locator('#helpSearchInput')
 search.fill('zznoresultszz')
 page.locator('#helpTopics .help-empty').wait_for()
 search.fill('watermark')
 topic=page.locator('#helpTopics button').filter(has_text='Watermark').first
 topic.click()
 title=page.locator('#helpArticleTitle')
 title.wait_for()
 assert 'watermark' in title.inner_text().lower()
 page.locator('#helpArticleBack').click()
 title.wait_for(state='hidden')
 for workspace in ('home','sign','tools','studio','library','help'):
  nav(page,workspace)
  page.locator('#globalTour').click()
  step=page.locator('.walkthrough-card__step-badge')
  step.wait_for()
  expect(step).to_have_text(re.compile(r'^Step 1 '))
  page.locator('[data-wt="next"]').click()
  expect(step).to_have_text(re.compile(r'^Step 2 '))
  page.locator('[data-wt="back"]').click()
  expect(step).to_have_text(re.compile(r'^Step 1 '))
  page.locator('[data-wt="skip"]').click()
  step.wait_for(state='detached')
 nav(page,'help')
 page.locator('#btnRestartTutorial').click()
 page.locator('.walkthrough-card').wait_for()
 page.locator('[data-wt="skip"]').click()
 return {'searchArticleBack':True,'toursTested':6,'restartTutorial':True}

def save_reopen_workflow(page,profile):
 src=OUT/f'{profile}-{args.case}-studio-export.pdf'
 assert src.exists(),'Studio export prerequisite not met'
 nav(page,'sign');page.locator('#signPdfInput').set_input_files(str(src))
 page.wait_for_function('!document.querySelector("#btnSaveToLibrary").disabled',timeout=60000)
 page.locator('#btnSaveToLibrary').click()
 nav(page,'library')
 saved=page.locator('#libraryGrid .library-card').filter(has_text='Signed_')
 saved.get_by_role('button',name='Open in Sign').click()
 page.locator('#ws-sign').wait_for(state='visible')
 page.locator('#signCanvasStage').wait_for(state='visible')
 assert page.locator('#signCanvas').evaluate('(canvas) => canvas.width > 0 && canvas.height > 0')
 saved_name=page.locator('#signDocInfo').inner_text()[:200]
 nav(page,'library')
 page.once('dialog',lambda dialog: dialog.accept('QA renamed scan'))
 saved.get_by_role('button',name='Rename',exact=True).click()
 renamed=page.locator('#libraryGrid .library-card').filter(has_text='QA renamed scan')
 renamed.wait_for(state='visible')
 page.locator('#librarySearchInput').fill('QA renamed scan')
 renamed.get_by_role('button',name='Delete',exact=True).wait_for(state='visible')
 page.once('dialog',lambda dialog: dialog.dismiss())
 renamed.get_by_role('button',name='Delete',exact=True).click()
 assert renamed.is_visible(),'Cancel should preserve the saved PDF'
 page.once('dialog',lambda dialog: dialog.accept())
 renamed.get_by_role('button',name='Delete',exact=True).click()
 renamed.wait_for(state='detached')
 page.reload(wait_until='domcontentloaded')
 nav(page,'library')
 page.get_by_text('No documents yet',exact=False).wait_for(state='visible')
 return {'savedLibraryText':saved_name,'reopenedInSign':True,'renameSearchDeleteVerified':True}
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
 if kind=='annotations': return annotation_workflow(page,profile)
 if kind=='tools': return tools_workflow(page,profile)
 if kind=='library':
  studio_workflow(page,profile)
  return save_reopen_workflow(page,profile)
 if kind=='studio-capture': return studio_capture_workflow(page,profile)
 if kind=='sign-history': return sign_history_workflow(page,profile)
 if kind=='tools-pages': return tools_pages_workflow(page,profile)
 if kind=='tools-text': return tools_text_workflow(page,profile)
 if kind=='folders': return folders_workflow(page,profile)
 if kind=='help': return help_workflow(page,profile)
 if kind=='tools-raster': return tools_raster_workflow(page,profile)
 if kind=='tools-batch': return tools_batch_workflow(page,profile)
 if kind=='tools-forms': return tools_forms_workflow(page,profile)
 if kind=='tools-size': return tools_size_workflow(page,profile)
 if kind=='tools-ocr': return tools_ocr_workflow(page,profile)
 if kind=='errors':
  for dest in ['home','sign','tools','studio','library','help']:
   nav(page,dest)
   overflow=page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
   assert overflow<=2,f'{dest}: {overflow}px horizontal overflow'
  return {'navigated':6}
 raise ValueError(kind)
cases=['consent','import','ocr','edit','annotations','tools','library','errors','studio-capture','sign-history','tools-pages','tools-text','folders','help','tools-raster','tools-batch','tools-forms','tools-size','tools-ocr'] if args.case=='all' else [args.case]
ocr_assets=os.environ.get('DOCUSCAN_OCR_NODE_MODULES')

def route_ocr_assets(context, modules):
 def fulfill(route):
  url=route.request.url
  filename=url.rsplit('/',1)[-1]
  if filename=='eng.traineddata.gz':
   asset=modules/'@tesseract.js-data/eng/4.0.0'/filename
  elif '/tesseract.js-core@' in url:
   asset=modules/'tesseract.js-core'/filename
  else:
   asset=modules/'tesseract.js/dist'/filename
  route.fulfill(path=str(asset),headers={'Access-Control-Allow-Origin':'*'})
 context.route(re.compile(r'^https://cdn\.jsdelivr\.net/npm/tesseract\.js(?:-core)?@'),fulfill)
 context.route('https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',fulfill)

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH') or None,args=['--no-sandbox'])
 for profile,(w,h) in selected.items():
  for kind in cases:
   local_ocr=bool(ocr_assets and kind in ('ocr','tools-ocr'))
   ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=profile!='desktop',has_touch=profile!='desktop',accept_downloads=True,
                           service_workers='block' if local_ocr else 'allow')
   if local_ocr: route_ocr_assets(ctx,pathlib.Path(ocr_assets))

   page=ctx.new_page();errors=[]
   page.on('pageerror',lambda err:errors.append(str(err)))
   def task():
    detail=run_selected(page,profile,kind)
    if errors:raise AssertionError('Uncaught browser errors: '+str(errors[:5]))
    if kind in ('ocr','tools-ocr'): detail['assetSource']='local npm assets' if local_ocr else 'production CDN'
    return detail
   case(page,kind,task,profile)
   ctx.close()
 browser.close()
report={'suite':'complete-app-workflows-v7741-split','generatedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'selectedCase':args.case,'selectedProfile':args.profile,
 'limitations':['Chromium emulation is not native iOS Safari','Native camera, sharing, printing excluded'], 'results':results}
filename=f'report-{args.profile}-{args.case}.json'
(OUT/filename).write_text(json.dumps(report,indent=2))
print(json.dumps({'passed':sum(r['status']=='passed' for r in results),'failed':sum(r['status']=='failed' for r in results),'report':str(OUT/filename)}))
sys.exit(1 if any(r['status']=='failed' for r in results) else 0)
