"""Capture screenshots verifying the bug fixes."""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
OUT = Path('/home/z/my-project/download/screenshots')
SAMPLE_PDF = Path('/home/z/my-project/assets/samples/test-contract.pdf')
MULTI_PDF = Path('/home/z/my-project/assets/samples/multi-page-test.pdf')


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == 'error' and 'service worker' not in m.text.lower() else None)

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(800)
        # Dismiss the first-launch welcome modal if it appears
        try:
            skip_btn = await page.wait_for_selector('.welcome-modal [data-welcome="skip"]', timeout=2000)
            if skip_btn:
                await skip_btn.click()
                await page.wait_for_timeout(300)
        except Exception:
            pass


        # Sign workspace — verify Open PDF button is now visible (blue)
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#signPdfInput', str(SAMPLE_PDF))
        await page.wait_for_timeout(3000)
        # Verify the Open PDF button is now blue (not white)
        btn_color = await page.evaluate(r"""() => {
            const btn = document.getElementById('btnOpenPdfSign');
            const s = getComputedStyle(btn);
            return { bg: s.backgroundColor, color: s.color, border: s.borderColor };
        }""")
        print('Open PDF button style:', btn_color)
        # Type some text and click on canvas to drop an element
        await page.fill('#textInput', 'Test Signature')
        # Set ink color via JS (color inputs don't accept .fill reliably)
        await page.evaluate("document.getElementById('inkColor').value = '#0066CC'; document.getElementById('inkColor').dispatchEvent(new Event('input', {bubbles:true}));")
        # Click on the center of the canvas to drop text
        await page.click('#signCanvas', position={'x': 300, 'y': 400})
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(OUT / 'fix-sign-with-dropped-text.png'))

        # Tools workspace — verify Annotate tab + Compare tab exist
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#toolsPdfInput', str(SAMPLE_PDF))
        await page.wait_for_timeout(2500)

        # Click Annotate tab
        await page.click('.tools-tab[data-tab="annotate"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT / 'fix-tools-annotate.png'))
        # Click Draw sub-tab
        await page.click('.tools-tab[data-subtab="draw"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT / 'fix-tools-annotate-draw.png'))

        # Click Compare tab
        await page.click('.tools-tab[data-tab="compare"]')
        await page.wait_for_timeout(300)
        # Open 2nd PDF for compare
        await page.set_input_files('#toolsMergeInput', str(MULTI_PDF))
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(OUT / 'fix-tools-compare-before-run.png'))
        # Click Run to render compare
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(3000)
        await page.screenshot(path=str(OUT / 'fix-tools-compare-after-run.png'))

        await browser.close()
        print(f'errors: {errors}')
        sys.exit(0 if not errors else 1)

asyncio.run(main())
