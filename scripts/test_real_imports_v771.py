#!/usr/bin/env python3
"""Strict browser upload smoke tests. Tests that file inputs accept fixtures and UI responds.
Does not certify OCR accuracy or export correctness; those require dedicated assertions.
"""
import json, pathlib, sys, datetime, traceback
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
url=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/'
fixtures=root/'tests'/'fixtures'
results=[]
def run_case(page,case,action):
    try:
        action()
        results.append({'case':case,'status':'passed'})
    except Exception as e:
        results.append({'case':case,'status':'failed','error':str(e)})
        try:page.screenshot(path=str(out/(case.replace(' ','-')+'-FAIL.png')),full_page=True)
        except Exception:pass
out=root/'screenshots'/'import-tests';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
    page=browser.new_page(accept_downloads=True)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(url,wait_until='domcontentloaded',timeout=30000)
    if page.locator('#splashAccept').count() and page.locator('.splash').is_visible():
        page.locator('#splashAccept').check();page.locator('#splashStart').click()
    page.locator('.splash').wait_for(state='hidden',timeout=15000)
    def studio():
        page.locator('.bottom-nav__item[data-goto="studio"]').click()
        assert page.locator('#ws-studio').is_visible()
        files=[str(fixtures/f'photo-{i}.jpg') for i in (1,2,3)]
        assert all(pathlib.Path(f).is_file() for f in files)
        page.locator('#imagesInput').set_input_files(files)
        page.wait_for_timeout(3000)
        assert page.locator('#studioThumbs').locator('img').count()>=3, 'Three image thumbnails not displayed'
        page.screenshot(path=str(out/'studio-three-images.png'),full_page=True)
    run_case(page,'Studio three-image import',studio)
    for count in (5,10):
        def load_pdf(count=count):
            page.locator('.bottom-nav__item[data-goto="tools"]').click()
            assert page.locator('#ws-tools').is_visible()
            fixture=fixtures/f'document-{count}-pages.pdf'
            assert fixture.is_file()
            page.locator('#toolsPdfInput').set_input_files(str(fixture))
            page.wait_for_timeout(3000)
            label=page.locator('#toolsDocInfo').inner_text().lower()
            assert 'no document loaded' not in label, f'PDF was not loaded: {label}'
            page.screenshot(path=str(out/f'tools-{count}-page-import.png'),full_page=True)
        run_case(page,f'Tools {count}-page PDF import',load_pdf)
    if errors:results.append({'case':'Uncaught browser exceptions','status':'failed','errors':errors})
    browser.close()
report={'timestampUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'url':url,'scope':'real browser file input and visible UI response; NOT OCR accuracy or exported PDF validation','results':results}
(root/'tests/results').mkdir(parents=True,exist_ok=True)
(root/'tests/results/v771-real-imports.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
sys.exit(1 if any(r['status']=='failed' for r in results) else 0)
