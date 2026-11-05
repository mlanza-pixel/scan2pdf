#!/usr/bin/env python3
"""Reusable screenshot capture. Run: python scripts/universal_capture_v77.py [url]."""
import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
root=pathlib.Path(__file__).resolve().parents[1]/'screenshots'; root.mkdir(exist_ok=True)
devices={'iphone':(390,844,True),'ipad':(820,1180,True),'android':(412,915,True),'desktop':(1365,900,False)}
report=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for device,(w,h,mobile) in devices.items():
  ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=mobile,has_touch=mobile,device_scale_factor=1)
  page=ctx.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(url,wait_until='domcontentloaded',timeout=25000);page.wait_for_timeout(1400)
   for ws in ['home','studio','sign','tools','library','help']:
    # direct UI navigation by existing bottom nav
    nav=page.locator(f'[data-goto="{ws}"]')
    if nav.count():nav.last.click(force=True,timeout=5000)
    else:page.evaluate('''ws=>{document.querySelectorAll('.workspace').forEach(x=>x.classList.toggle('is-active',x.dataset.workspace===ws))}''',ws)
    page.wait_for_timeout(200)
    dest=root/device;dest.mkdir(exist_ok=True)
    page.screenshot(path=str(dest/f'{ws}.png'),full_page=True,timeout=20000)
    report.append({'device':device,'screen':ws,'status':'captured'})
    if ws=='tools':
     for group in ['content','extract','pages','properties','combine','batch']:
      page.locator(f'#toolsGroups [data-group="{group}"]').click(force=True)
      page.screenshot(path=str(dest/f'tools-{group}.png'),full_page=True,timeout=20000)
      report.append({'device':device,'screen':'tools-'+group,'status':'captured'})
   report.append({'device':device,'errors':errors})
  except Exception as e:report.append({'device':device,'error':str(e),'errors':errors})
  ctx.close()
 browser.close()
(root/'capture-report.json').write_text(json.dumps({'timestampUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':report},indent=2))
print('Screenshots:',sum(x.get('status')=='captured' for x in report),'Errors:',sum(bool(x.get('error') or x.get('errors')) for x in report))
