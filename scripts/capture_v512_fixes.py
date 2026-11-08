"""Capture screenshots to verify the v5.1.2 fixes."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
OUT = Path('/home/z/my-project/download/screenshots')
SAMPLE_PDF = '/home/z/my-project/assets/samples/test-contract.pdf'

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        # Accept splash
        try:
            cb = await page.wait_for_selector('#splashAccept', timeout=2000)
            if cb:
                await cb.click()
                await page.wait_for_timeout(200)
                await page.click('#splashStart')
                await page.wait_for_timeout(500)
        except: pass

        # Sign workspace — verify blue buttons + Insert+Remove on same row
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#signPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)
        await page.screenshot(path=str(OUT / 'v512-sign-blue-buttons.png'), full_page=False)

        # Verify button color
        btn_color = await page.evaluate(r"""() => {
            const btn = document.getElementById('btnAddText');
            const s = getComputedStyle(btn);
            return { bg: s.backgroundColor, color: s.color };
        }""")
        print('Editing button style:', btn_color)

        # Studio with shortened export labels
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'v512-studio-export-labels.png'), full_page=False)
        labels = await page.evaluate(r"""() => Array.from(document.querySelectorAll('#btnStudioSave, #btnStudioDownload, #btnStudioShare, #btnStudioPrint')).map(b => b.textContent.trim())""")
        print('Studio export labels:', labels)

        # PDF Tools with shortened export labels + new blue styling
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'v512-tools-export-labels.png'), full_page=False)
        tools_labels = await page.evaluate(r"""() => Array.from(document.querySelectorAll('#btnToolsSave, #btnToolsDownload, #btnToolsShare, #btnToolsPrint')).map(b => b.textContent.trim())""")
        print('Tools export labels:', tools_labels)

        # Sign export labels (should be Save to Library / Download / Share / Print)
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(400)
        sign_labels = await page.evaluate(r"""() => Array.from(document.querySelectorAll('#btnSaveToLibrary, #btnDownloadPdf, #btnSharePdf, #btnPrintPdf')).map(b => b.textContent.trim())""")
        print('Sign export labels:', sign_labels)

        await browser.close()

asyncio.run(main())
