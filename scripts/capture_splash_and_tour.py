"""Capture screenshots of the new splash page and Help Center for visual verification."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
OUT = Path('/home/z/my-project/download/screenshots')

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(800)
        # Splash screenshot (before accepting)
        await page.screenshot(path=str(OUT / 'splash-page.png'), full_page=False)
        # Accept
        await page.click('#splashAccept')
        await page.wait_for_timeout(200)
        await page.screenshot(path=str(OUT / 'splash-page-accepted.png'), full_page=False)
        await page.click('#splashStart')
        await page.wait_for_timeout(500)
        # Home
        await page.screenshot(path=str(OUT / 'home-with-tour-button.png'))
        # Studio with export row
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'studio-with-export-row.png'), full_page=True)
        # PDF Tools with new export buttons
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'tools-with-new-export-buttons.png'), full_page=True)
        # Help center
        await page.click('.bottom-nav__item[data-goto="help"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'help-center.png'), full_page=True)
        # Mobile splash (390px)
        mctx = await browser.new_context(viewport={'width': 390, 'height': 844})
        mpage = await mctx.new_page()
        await mpage.goto(BASE, wait_until='networkidle', timeout=15000)
        await mpage.wait_for_timeout(500)
        await mpage.screenshot(path=str(OUT / 'mobile-splash-page.png'))
        await browser.close()
        print('Screenshots written')

asyncio.run(main())
