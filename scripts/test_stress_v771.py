#!/usr/bin/env python3
"""Real navigation/collapse stress; no DOM-forced navigation or consent bypass."""
import json,sys,pathlib,datetime
from playwright.sync_api import sync_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
ROOT=pathlib.Path(__file__).resolve().parents[1]
DEVICES={'iphone':(390,844),'ipad':(820,1180),'android':(412,915),'desktop':(1365,900)}
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for name,(w,h) in DEVICES.items():
  ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=name!='desktop',has_touch=name!='desktop')
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   page.goto(URL,wait_until='domcontentloaded',timeout=30000)
   if page.locator('#splashAccept').count():
    page.locator('#splashAccept').check();page.locator('#splashStart').click()
   for cycle in range(5):
    for workspace in ['home','sign','tools','studio','library','help','home']:
     page.locator(f'.bottom-nav__item[data-goto="{workspace}"]').click(timeout=10000)
     assert page.locator(f'#ws-{workspace}').is_visible(),f'{workspace} not visible'
     if workspace=='tools':
      for group in ['content','extract','pages','properties','combine','batch']:
       button=page.locator(f'#toolsGroups .tools-group-tab[data-group="{group}"]')
       if button.get_attribute('aria-selected')=='true':
        button.click()
       button.click();assert button.get_attribute('aria-selected')=='true'
       button.click();assert button.get_attribute('aria-selected')=='false'
   assert not errors,errors
   results.append({'device':name,'cycles':5,'status':'passed','pageErrors':[]})
  except Exception as error:results.append({'device':name,'status':'failed','error':str(error),'pageErrors':errors})
  ctx.close()
 browser.close()
out=ROOT/'tests/results/v771-browser-stress.json';out.parent.mkdir(exist_ok=True,parents=True)
out.write_text(json.dumps({'timestampUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results,'scope':'browser-emulated navigation and tool-category toggles; NOT physical device or max-document certification'},indent=2))
print(json.dumps(results,indent=2))
sys.exit(1 if any(r['status']!='passed' for r in results) else 0)
