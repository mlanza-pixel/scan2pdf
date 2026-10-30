"""Capture screenshots of every workspace after the layout restructure."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
OUT = Path('/home/z/my-project/download/screenshots/v740')
OUT.mkdir(parents=True, exist_ok=True)
SAMPLE_PDF = '/home/z/my-project/assets/samples/test-contract.pdf'


async def accept_splash(page):
    try:
        cb = await page.wait_for_selector('#splashAccept', timeout=2000)
        if cb:
            await cb.click()
            await page.wait_for_timeout(200)
            start = await page.wait_for_selector('#splashStart', timeout=1000)
            if start:
                await start.click()
                await page.wait_for_timeout(400)
    except Exception:
        pass


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ============ Desktop 1280 ============
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        await accept_splash(page)

        # Studio empty
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'desktop-studio-empty.png'), full_page=True)

        # Studio with image (import one)
        await page.set_input_files('#imagesInput', '/home/z/my-project/assets/samples/sample-page-1.jpg')
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(OUT / 'desktop-studio-loaded.png'), full_page=True)

        # Sign empty
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT / 'desktop-sign-empty.png'), full_page=True)

        # Sign with PDF
        await page.set_input_files('#signPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)
        await page.screenshot(path=str(OUT / 'desktop-sign-loaded.png'), full_page=True)

        # Tools empty
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT / 'desktop-tools-empty.png'), full_page=True)

        # Tools with PDF
        await page.set_input_files('#toolsPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(OUT / 'desktop-tools-loaded.png'), full_page=True)

        # Tools — switch to OCR tab
        await page.click('#toolsTabs .tools-tab[data-tab="ocrpdf"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'desktop-tools-ocr-tab.png'), full_page=True)

        # Tools — switch to Split tab to verify 2nd PDF button hides
        await page.click('#toolsTabs .tools-tab[data-tab="split"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT / 'desktop-tools-split-tab.png'), full_page=True)

        # Home
        await page.click('.bottom-nav__item[data-goto="home"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT / 'desktop-home.png'), full_page=True)

        await ctx.close()

        # ============ Mobile 390 ============
        ctxm = await browser.new_context(viewport={'width': 390, 'height': 844},
                                          device_scale_factor=2)
        pagem = await ctxm.new_page()
        await pagem.goto(BASE, wait_until='networkidle', timeout=15000)
        await pagem.wait_for_timeout(500)
        await accept_splash(pagem)

        # Studio mobile
        await pagem.click('.bottom-nav__item[data-goto="studio"]')
        await pagem.wait_for_timeout(400)
        await pagem.screenshot(path=str(OUT / 'mobile-studio-empty.png'), full_page=True)

        await pagem.set_input_files('#imagesInput', '/home/z/my-project/assets/samples/sample-page-1.jpg')
        await pagem.wait_for_timeout(1500)
        await pagem.screenshot(path=str(OUT / 'mobile-studio-loaded.png'), full_page=True)

        # Sign mobile
        await pagem.click('.bottom-nav__item[data-goto="sign"]')
        await pagem.wait_for_timeout(300)
        await pagem.set_input_files('#signPdfInput', SAMPLE_PDF)
        await pagem.wait_for_timeout(3000)
        await pagem.screenshot(path=str(OUT / 'mobile-sign-loaded.png'), full_page=True)

        # Tools mobile
        await pagem.click('.bottom-nav__item[data-goto="tools"]')
        await pagem.wait_for_timeout(300)
        await pagem.set_input_files('#toolsPdfInput', SAMPLE_PDF)
        await pagem.wait_for_timeout(2000)
        await pagem.screenshot(path=str(OUT / 'mobile-tools-loaded.png'), full_page=True)

        await pagem.click('#toolsTabs .tools-tab[data-tab="ocrpdf"]')
        await pagem.wait_for_timeout(400)
        await pagem.screenshot(path=str(OUT / 'mobile-tools-ocr-tab.png'), full_page=True)

        await ctxm.close()
        await browser.close()
        print('Wrote screenshots to', OUT)


asyncio.run(main())
