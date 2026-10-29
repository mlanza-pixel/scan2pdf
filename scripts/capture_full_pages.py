"""
DocuScan Pro — capture full-page screenshots showing the complete Sign workspace
including the export actions that are below the fold.
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
OUT = Path('/home/z/my-project/download/screenshots')
SAMPLE_PDF = Path('/home/z/my-project/assets/samples/test-contract.pdf')


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Desktop full page
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#signPdfInput', str(SAMPLE_PDF))
        await page.wait_for_timeout(3000)
        # Full page screenshot
        await page.screenshot(path=str(OUT / 'sign-full-page.png'), full_page=True)
        # Also scroll the left column into view of export actions
        # Then capture the export region specifically
        await page.evaluate("document.getElementById('btnSaveToLibrary').scrollIntoView({block:'center'})")
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT / 'sign-export-actions.png'), full_page=False)
        # Tools workspace with PDF loaded
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(300)
        await page.set_input_files('#toolsPdfInput', str(SAMPLE_PDF))
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(OUT / 'tools-with-pdf.png'), full_page=True)
        # Library
        await page.click('.bottom-nav__item[data-goto="library"]')
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(OUT / 'library-full-page.png'), full_page=True)
        await browser.close()
        print('screenshots written to', OUT)


asyncio.run(main())
