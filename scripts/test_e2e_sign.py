"""
DocuScan Pro — Sign workspace integration test.
1. Build a tiny PDF in-process using pdf-lib (Node-side, no CDN).
2. Load that PDF into the Sign workspace via the file input.
3. Verify the page renders on the canvas.
4. Verify the page navigation label reads "Page 1 of 1".
5. Verify the editing buttons become enabled.
"""
import asyncio
import io
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SAMPLE_PDF = Path('/home/z/my-project/assets/samples/test-contract.pdf')


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        all_console = []
        page.on('console', lambda m: all_console.append(f"[{m.type}] {m.text}"))
        page.on('pageerror', lambda e: all_console.append(f"[pageerror] {e}"))
        failed = []
        page.on('response', lambda r: failed.append(f"{r.status} {r.url}") if r.status >= 400 else None)

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


        # Go to Sign workspace
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(400)

        # Upload the sample PDF
        await page.set_input_files('#signPdfInput', str(SAMPLE_PDF))
        await page.wait_for_timeout(3000)  # PDF.js needs time

        # Verify state
        state = await page.evaluate(r"""() => {
            const label = document.querySelector('#pageNavLabel')?.textContent || '';
            const signDocInfo = document.querySelector('#signDocInfo')?.textContent || '';
            const addSigDisabled = document.querySelector('#btnAddSignature')?.disabled;
            const addTextDisabled = document.querySelector('#btnAddText')?.disabled;
            const saveDisabled = document.querySelector('#btnSaveToLibrary')?.disabled;
            const downloadDisabled = document.querySelector('#btnDownloadPdf')?.disabled;
            const canvasHidden = document.querySelector('#signCanvas')?.hidden;
            const canvasW = document.querySelector('#signCanvas')?.width || 0;
            const canvasH = document.querySelector('#signCanvas')?.height || 0;
            return { label, signDocInfo, addSigDisabled, addTextDisabled, saveDisabled, downloadDisabled, canvasHidden, canvasW, canvasH };
        }""")

        ok = True
        report = {'checks': [], 'issues': []}
        def chk(n, c, d=''):
            report['checks'].append({'name': n, 'ok': bool(c), 'detail': d})
            if not c: report['issues'].append(f'{n}: {d}'); nonlocal_ok[0] = False

        nonlocal_ok = [True]
        chk('Page nav label correct', state['label'] == 'Page 1 of 1', f"got '{state['label']}'")
        chk('Sign doc info reflects loaded PDF', 'page' in state['signDocInfo'].lower() or 'pdf' in state['signDocInfo'].lower(), f"got '{state['signDocInfo']}'")
        chk('Add Signature enabled', state['addSigDisabled'] is False, f"disabled={state['addSigDisabled']}")
        chk('Add Text enabled', state['addTextDisabled'] is False, f"disabled={state['addTextDisabled']}")
        chk('Save to Library enabled', state['saveDisabled'] is False, f"disabled={state['saveDisabled']}")
        chk('Download enabled', state['downloadDisabled'] is False, f"disabled={state['downloadDisabled']}")
        chk('Canvas is visible', state['canvasHidden'] is False, f"hidden={state['canvasHidden']}")
        chk('Canvas has nonzero size', state['canvasW'] > 100 and state['canvasH'] > 100, f"w={state['canvasW']} h={state['canvasH']}")

        # Capture screenshot
        await page.screenshot(path='/home/z/my-project/download/screenshots/integration-sign-with-pdf.png')

        print(json.dumps({
            'ok': nonlocal_ok[0],
            'state': state,
            'checks': report['checks'],
            'issues': report['issues'],
            'failed_requests': failed,
            'console_errors': [m for m in all_console if 'error' in m.lower() and 'service worker' not in m.lower()],
        }, indent=2))

        await browser.close()
        sys.exit(0 if nonlocal_ok[0] else 1)

asyncio.run(main())
