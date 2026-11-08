"""Repeated real-browser reload/cache regression. Writes an evidence JSON report."""
import argparse, json, os, pathlib, time
from playwright.sync_api import sync_playwright

ap=argparse.ArgumentParser()
ap.add_argument('url',nargs='?',default='http://127.0.0.1:8765/')
ap.add_argument('--cycles',type=int,choices=[10,20,100,1000],default=10)
ap.add_argument('--profile',choices=['desktop','iphone','ipad'],default='desktop')
a=ap.parse_args()
root=pathlib.Path('tests/results/cache-reload');root.mkdir(parents=True,exist_ok=True)
report={'url':a.url,'profile':a.profile,'cyclesRequested':a.cycles,'runs':[],'failures':[],'note':'Chromium emulation is not physical Safari'}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH') or None)
    opts={'viewport':{'width':1280,'height':800}}
    if a.profile=='iphone':opts={'viewport':{'width':390,'height':844},'is_mobile':True,'has_touch':True,'device_scale_factor':3}
    if a.profile=='ipad':opts={'viewport':{'width':820,'height':1180},'is_mobile':True,'has_touch':True,'device_scale_factor':2}
    ctx=browser.new_context(**opts,service_workers='allow')
    page=ctx.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    for i in range(a.cycles):
        start=time.monotonic()
        item={'cycle':i+1}
        try:
            page.goto(a.url,wait_until='domcontentloaded',timeout=30000) if i==0 else page.reload(wait_until='domcontentloaded',timeout=30000)
            page.locator('#selfTestDialog').wait_for(state='attached',timeout=15000)
            title=page.title()
            if title != 'DocuScan Pro 7.72':raise AssertionError('stale title '+title)
            page.wait_for_function('!!navigator.serviceWorker?.controller',timeout=15000)
            item['title']=title
            item['cacheKeys']=page.evaluate('async()=>"caches" in window ? await caches.keys() : []')
            item['controller']=page.evaluate('()=>!!navigator.serviceWorker?.controller')
            item['horizontalOverflow']=page.evaluate('()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)')
            assert 'docuscan-app-v7-72-ci-diagnostics' in item['cacheKeys'], 'Expected application cache missing'
            assert item['horizontalOverflow']<=2, 'Horizontal overflow on reload'
            item['status']='pass'
        except Exception as e:
            item['status']='fail';item['error']=str(e);report['failures'].append(item)
            try:page.screenshot(path=str(root/f'{a.profile}-{a.cycles}-cycle{i+1}-FAIL.png'),full_page=True,timeout=5000)
            except Exception:pass
        item['ms']=round((time.monotonic()-start)*1000)
        report['runs'].append(item)
        if len(report['failures'])>=5:break
    report['pageErrors']=errors
    browser.close()
report['passed']=not report['failures'] and not report['pageErrors'] and len(report['runs'])==a.cycles
path=root/f'{a.profile}-{a.cycles}.json';path.write_text(json.dumps(report,indent=2))
print(json.dumps({'passed':report['passed'],'cycles':len(report['runs']),'failures':len(report['failures']),'pageErrors':len(report['pageErrors']),'report':str(path)}))
raise SystemExit(0 if report['passed'] else 1)
