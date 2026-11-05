#!/usr/bin/env python3
"""Strict, first-run-aware screenshot and navigation audit for DocuScan Pro."""
import sys, pathlib, json, datetime, traceback
from playwright.sync_api import sync_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'screenshots';OUT.mkdir(exist_ok=True)
DEVICES={'iphone':(390,844,True),'ipad':(820,1180,True),'android':(412,915,True),'desktop':(1365,900,False)}
WORKSPACES=['home','sign','tools','studio','library','help']
GROUPS=['content','extract','pages','properties','combine','batch']
records=[];failures=[]
def verify(condition,message):
 if not condition: raise AssertionError(message)
def capture(page,directory,name):
 verify(not page.locator('.splash').is_visible(),'Welcome splash still covers '+name)
 path=directory/(name+'.png');page.screenshot(path=str(path),full_page=True,timeout=30000)
 verify(path.exists() and path.stat().st_size>2000,'Screenshot missing/empty: '+str(path))
 records.append({'device':directory.name,'screen':name,'status':'captured','bytes':path.stat().st_size})
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 for name,(w,h,mobile) in DEVICES.items():
  directory=OUT/name;directory.mkdir(exist_ok=True)
  context=browser.new_context(viewport={'width':w,'height':h},is_mobile=mobile,has_touch=mobile,device_scale_factor=1,accept_downloads=True)
  page=context.new_page();errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  try:
   response=page.goto(URL,wait_until='domcontentloaded',timeout=30000)
   verify(response is not None and response.status<400,'HTTP failure')
   page.locator('#ws-home').wait_for(state='attached',timeout=15000)
   if page.locator('#splashAccept').count():
    page.locator('#splashAccept').check()
    page.locator('#splashStart').click()
   page.locator('.splash').wait_for(state='hidden',timeout=10000)
   for ws in WORKSPACES:
    nav=page.locator(f'.bottom-nav__item[data-goto="{ws}"]')
    verify(nav.count()==1,'Missing navigation for '+ws)
    nav.click(timeout=10000)
    section=page.locator(f'#ws-{ws}')
    verify(section.is_visible(),'Workspace not visible: '+ws)
    page.wait_for_timeout(250)
    capture(page,directory,ws)
    if ws=='tools':
     for group in GROUPS:
      button=page.locator(f'#toolsGroups .tools-group-tab[data-group="{group}"]')
      verify(button.count()==1 and button.is_visible(),'Missing visible category '+group)
      button.click(timeout=10000)
      verify(button.get_attribute('aria-selected')=='true','Category did not activate: '+group)
      visible=page.locator('#toolsTabs .tools-tools-for-group:visible')
      verify(visible.count()==1 and visible.first.get_attribute('data-tools-for')==group,'Incorrect tool panel: '+group)
      capture(page,directory,'tools-'+group)
      button.click()
      verify(button.get_attribute('aria-selected')=='false','Category did not collapse: '+group)
      verify(page.locator('#toolsTabs .tools-tools-for-group:visible').count()==0,'Tool panel remains visible after collapse')
   # Tour smoke: open from Help and verify tour UI is present, then close.
   page.locator('.bottom-nav__item[data-goto="tools"]').click()
   tour=page.locator('#globalTour')
   if tour.is_visible():
    tour.click();page.wait_for_timeout(200)
    capture(page,directory,'tools-tour')
    page.keyboard.press('Escape')
   overflow=page.evaluate('''() => ({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})''')
   records.append({'device':name,'layout':overflow,'horizontalOverflowPx':max(0,overflow['scroll']-overflow['viewport'])})
  except Exception as error:
   failures.append({'device':name,'error':str(error),'trace':traceback.format_exc(limit=2)})
   try:page.screenshot(path=str(directory/'FAILURE.png'),full_page=True)
   except Exception:pass
  if errors:failures.append({'device':name,'pageErrors':errors})
  context.close()
 browser.close()
expected=len(DEVICES)*(len(WORKSPACES)+len(GROUPS)+1)
actual=sum(r.get('status')=='captured' for r in records)
if actual!=expected:failures.append({'error':f'Missing screenshots: expected {expected}, got {actual}'})
report={'timestampUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':URL,'expectedScreenshots':expected,'capturedScreenshots':actual,'results':records,'failures':failures}
(OUT/'capture-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'expected':expected,'captured':actual,'failures':failures},indent=2))
sys.exit(1 if failures else 0)
