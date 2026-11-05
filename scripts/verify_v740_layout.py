"""Verify DOM positions of key elements in the restructured workspaces."""
import asyncio
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
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


def box(page, selector):
    return page.evaluate("""(sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {x: r.x, y: r.y, w: r.width, h: r.height, text: el.innerText ? el.innerText.slice(0,40) : ''};
    }""", selector)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        # Capture console errors
        errs = []
        page.on('console', lambda msg: errs.append(f'[{msg.type}] {msg.text}') if msg.type in ('error', 'warning') else None)
        page.on('pageerror', lambda err: errs.append(f'[pageerror] {err}'))

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        await accept_splash(page)

        # ---------- STUDIO ----------
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)
        print('=== STUDIO (empty) ===')
        print('Capture button text:', await page.evaluate("document.getElementById('btnCaptureCamera').innerText"))
        print('Capture button box:', await box(page, '#btnCaptureCamera'))
        print('Import button text:', await page.evaluate("document.getElementById('btnImportImages').innerText"))
        print('OCR Scan button text:', await box(page, '#btnRunOcr'))
        print('Run OCR btn text:', await page.evaluate("document.getElementById('btnRunOcr').innerText"))
        print('Studio right preview box:', await box(page, '#studioPreviewWrap'))
        print('Studio page nav box:', await box(page, '#studioPageNav'))
        print('Studio OCR result card box:', await box(page, '#studioOcrResultCard'))

        # Verify the right column starts to the right of the left column
        left = await box(page, '.sign-layout__left')
        right = await box(page, '.sign-layout__right')
        print(f'Left col x={left["x"]} w={left["w"]}, right col x={right["x"]} w={right["w"]}')
        assert right['x'] > left['x'] + left['w'] - 50, 'right column should be to right of left'

        # Studio loaded
        await page.set_input_files('#imagesInput', '/home/z/my-project/assets/samples/sample-page-1.jpg')
        await page.wait_for_timeout(1500)
        print('\n=== STUDIO (loaded) ===')
        print('Page nav label:', await page.evaluate("document.getElementById('studioPageNavLabel').innerText"))
        print('Slider display:', await page.evaluate("getComputedStyle(document.getElementById('studioPageSlider')).display"))
        print('Canvas hidden?', await page.evaluate("document.getElementById('studioPreviewCanvas').hidden"))

        # ---------- SIGN ----------
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(300)
        print('\n=== SIGN (empty) ===')
        # Verify pageNav is in the right column now (under preview)
        nav = await box(page, '#pageNav')
        nav_parent = await page.evaluate("document.getElementById('pageNav').closest('.sign-layout__right') ? 'right' : (document.getElementById('pageNav').closest('.sign-layout__left') ? 'left' : 'neither')")
        print(f'Page nav parent column: {nav_parent}')
        print(f'Page nav box: {nav}')
        # Verify the "Open PDF" button is still on the left
        open_btn = await box(page, '#btnOpenPdfSign')
        open_parent = await page.evaluate("document.getElementById('btnOpenPdfSign').closest('.sign-layout__right') ? 'right' : 'left'")
        print(f'Open PDF button parent: {open_parent}, box: {open_btn}')

        # Sign loaded
        await page.set_input_files('#signPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)
        print('\n=== SIGN (loaded) ===')
        print('Page nav label:', await page.evaluate("document.getElementById('pageNavLabel').innerText"))
        print('Slider display:', await page.evaluate("getComputedStyle(document.getElementById('pageSlider')).display"))

        # ---------- TOOLS ----------
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(300)
        print('\n=== TOOLS (empty) ===')
        second_hidden = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        print(f'2nd PDF button hidden (merge tab default): {second_hidden}')

        await page.set_input_files('#toolsPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(2000)
        print('\n=== TOOLS (loaded, merge tab) ===')
        second_hidden = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        second_disabled = await page.evaluate("document.getElementById('btnAddSecondPdf').disabled")
        print(f'2nd PDF button hidden: {second_hidden}, disabled: {second_disabled}')
        print(f'Tools page nav label:', await page.evaluate("document.getElementById('toolsPageNavLabel').innerText"))
        run_btn_label = await page.evaluate("document.getElementById('btnRunToolOp').innerText")
        print(f'Run button label: {run_btn_label}')

        # Switch to Split tab — 2nd PDF should hide
        await page.click('#toolsTabs .tools-tab[data-tab="split"]')
        await page.wait_for_timeout(300)
        second_hidden = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        run_btn_label = await page.evaluate("document.getElementById('btnRunToolOp').innerText")
        print(f'\n=== TOOLS (split tab) ===')
        print(f'2nd PDF button hidden: {second_hidden}')
        print(f'Run button label: {run_btn_label}')

        # Switch to OCR tab — Run becomes "Scan", OCR card visible
        await page.click('#toolsTabs .tools-tab[data-tab="ocrpdf"]')
        await page.wait_for_timeout(300)
        run_btn_label = await page.evaluate("document.getElementById('btnRunToolOp').innerText")
        ocr_card_hidden = await page.evaluate("document.getElementById('toolsOcrResultCard').hidden")
        print(f'\n=== TOOLS (ocr tab) ===')
        print(f'Run button label: {run_btn_label}')
        print(f'OCR result card hidden: {ocr_card_hidden}')
        # Left panel should NOT have textarea in OCR tab (it moved to right)
        left_textarea = await page.evaluate("document.querySelector('#toolsPanel textarea#pdfOcrResult') ? 'still in left panel' : 'moved out of left'")
        print(f'Textarea in left panel: {left_textarea}')

        # Console errors summary
        if errs:
            print(f'\n=== Console errors/warnings ({len(errs)}) ===')
            for e in errs[:10]:
                print(' ', e)
        else:
            print('\nNo console errors.')

        await browser.close()


asyncio.run(main())
