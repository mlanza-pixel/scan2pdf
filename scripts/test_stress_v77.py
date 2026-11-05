#!/usr/bin/env python3
"""Repeatable browser UI stress test, NOT proof of native device or large-file OCR support."""
import json,sys,time,pathlib,datetime
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for name,width,height in [('iphone',390,844),('ipad',820,1180),('android',412,915)]:
  ctx=b.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(url,wait_until='domcontentloaded',timeout=25000)
   for cycle in range(5):
    for target in ['home','sign','tools','studio','library','help']:
     page.evaluate('''name=>{document.querySelectorAll('.workspace').forEach(el=>el.classList.toggle('is-active',el.dataset.workspace===name))}''',target)
     if target=='tools':
      for group in ['content','extract','pages','properties','combine','batch']:
       page.locator(f'#toolsGroups [data-group="{group}"]').click(force=True,timeout=3000)
   results.append({'device':name,'cycles':5,'status':'completed','pageErrors':errors})
  except Exception as e:results.append({'device':name,'status':'failed','exception':str(e),'pageErrors':errors})
  ctx.close()
 b.close()
out=root/'tests/results/v77-browser-stress.json';out.write_text(json.dumps({'timeUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results,'limitations':'UI navigation stress only; not native memory/crash test, image import or OCR stress'},indent=2))
print(out);print(json.dumps(results,indent=2))
sys.exit(1 if any(r['status']=='failed' or r['pageErrors'] for r in results) else 0)
