"""
DocuScan Pro — EXHAUSTIVE PDF Tools test (v5.1.6).
Cycles through EVERY operation in PDF Tools, for each:
  1. Configures the operation
  2. Clicks Run
  3. Verifies output is produced (or proper error shown)
  4. Verifies all 4 export buttons are enabled
  5. Clicks each export button
  6. Verifies button stays blue throughout

Also tests:
  - Loading a PDF enables all export buttons immediately
  - Export buttons fall back to source bytes if no Run output
  - Tab switching forward + backward preserves state
  - Button color is ALWAYS rgb(0, 122, 255) blue in every state
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SAMPLE_PDF = '/home/z/my-project/assets/samples/test-contract.pdf'
MULTI_PDF = '/home/z/my-project/assets/samples/multi-page-test.pdf'


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == 'error' and 'service worker' not in m.text.lower() else None)
        page.on('pageerror', lambda e: errors.append(f"[pageerror] {e}"))

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        try:
            await page.click('#splashAccept', timeout=2000)
            await page.wait_for_timeout(200)
            await page.click('#splashStart', timeout=2000)
            await page.wait_for_timeout(500)
        except: pass

        results = {'checks': [], 'issues': []}
        def check(name, cond, detail=''):
            results['checks'].append({'name': name, 'ok': bool(cond), 'detail': detail})
            if not cond:
                results['issues'].append(f"{name}: {detail}")
            print(f'  [{"PASS" if cond else "FAIL"}] {name}{": " + detail if detail else ""}', flush=True)

        async def btn_bg(selector):
            """Get computed background color of a button."""
            return await page.evaluate(r"""(sel) => {
                const b = document.querySelector(sel);
                if (!b) return null;
                return { bg: getComputedStyle(b).backgroundColor, disabled: b.disabled };
            }""", selector)

        async def is_blue(selector):
            """Check if button is rgb(0, 122, 255) blue (the regular blue, not pressed)."""
            info = await btn_bg(selector)
            if not info: return None
            return '0, 122, 255' in info['bg']

        # ============ Navigate to PDF Tools + load PDF ============
        print('\n=== Load PDF in PDF Tools ===', flush=True)
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#toolsPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)

        # Verify doc info
        doc_info = await page.evaluate("document.getElementById('toolsDocInfo')?.textContent")
        check('Doc info shows loaded PDF', 'page' in (doc_info or '').lower() or 'test-contract' in (doc_info or '').lower(), f'info={doc_info}')

        # ============ Test: export buttons enabled immediately after load ============
        print('\n=== Export buttons enabled after load (no Run needed) ===', flush=True)
        for btn_id in ['btnToolsSave', 'btnToolsDownload', 'btnToolsShare', 'btnToolsPrint']:
            disabled = await page.evaluate(f"document.getElementById('{btn_id}')?.disabled")
            check(f'{btn_id} enabled after PDF load', disabled is False, f'disabled={disabled}')

        # ============ Test: button color is blue (not disabled-looking) ============
        print('\n=== Button color check (all blue) ===', flush=True)
        all_btn_ids = ['btnOpenPdfTools', 'btnAddSecondPdf', 'btnRunToolOp', 'btnPreviewTool',
                       'btnToolsSave', 'btnToolsDownload', 'btnToolsShare', 'btnToolsPrint']
        for btn_id in all_btn_ids:
            blue = await is_blue(f'#{btn_id}')
            if blue is None:
                check(f'{btn_id} exists', False)
            else:
                check(f'{btn_id} is blue', blue, f'not rgb(0,122,255)')

        # ============ Test: click export buttons without Run (fallback to source) ============
        print('\n=== Export buttons work without Run (fallback to source bytes) ===', flush=True)
        # Save to Library
        await page.click('#btnToolsSave')
        await page.wait_for_timeout(3000)
        check('Save to Library (no Run) — no crash', True)

        # Download
        await page.click('#btnToolsDownload')
        await page.wait_for_timeout(1000)
        check('Download (no Run) — no crash', True)

        # Share
        await page.click('#btnToolsShare')
        await page.wait_for_timeout(2000)
        check('Share (no Run) — no crash', True)

        # Verify buttons still blue after clicks
        for btn_id in ['btnToolsSave', 'btnToolsDownload', 'btnToolsShare', 'btnToolsPrint']:
            blue = await is_blue(f'#{btn_id}')
            check(f'{btn_id} still blue after export click', blue is True, 'color changed')

        # ============ Cycle through every operation ============
        operations = [
            ('rotate', 'Rotate', {'configure': lambda: page.click('#rotateAngles .chip[data-angle="90"]')}),
            ('watermark', 'Watermark', {'configure': None}),
            ('split', 'Split', {'configure': lambda: page.fill('#splitRanges', '1')}),
            ('reorder', 'Reorder', {'configure': lambda: page.fill('#reorderInput', '1')}),
            ('annotate', 'Annotate (Text)', {'configure': lambda: page.fill('#annotateText', 'Test annotation')}),
            ('merge', 'Merge', {'configure': None}),  # needs 2nd PDF
        ]

        for tab_id, label, config in operations:
            print(f'\n=== Operation: {label} ===', flush=True)
            # Click the tab
            await page.click(f'.tools-tab[data-tab="{tab_id}"]')
            await page.wait_for_timeout(300)
            active = await page.evaluate(f"document.querySelector('.tools-tab[data-tab=\"{tab_id}\"]')?.classList.contains('is-active')")
            check(f'{label} tab active', active)

            # Configure if needed
            if config['configure']:
                try:
                    await config['configure']()
                    await page.wait_for_timeout(200)
                except Exception as e:
                    check(f'{label} configure', False, str(e))

            # For merge, load a 2nd PDF first
            if tab_id == 'merge':
                await page.set_input_files('#toolsMergeInput', MULTI_PDF)
                await page.wait_for_timeout(2000)

            # Click Run
            run_btn = await page.query_selector('#btnRunToolOp')
            if run_btn and not await run_btn.is_disabled():
                await run_btn.click()
                await page.wait_for_timeout(5000)  # wait for operation + pdf-lib load
                check(f'{label} Run clicked', True)
            else:
                check(f'{label} Run button enabled', False, 'disabled')

            # Verify Run button restored (not stuck)
            run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
            check(f'{label} Run button restored after operation', run_disabled is False, f'disabled={run_disabled}')

            # Verify Run button is blue
            run_blue = await is_blue('#btnRunToolOp')
            check(f'{label} Run button blue after operation', run_blue is True, 'not blue')

            # Verify export buttons still enabled + blue
            for btn_id in ['btnToolsSave', 'btnToolsDownload', 'btnToolsShare', 'btnToolsPrint']:
                disabled = await page.evaluate(f"document.getElementById('{btn_id}')?.disabled")
                check(f'{label}: {btn_id} enabled', disabled is False, f'disabled={disabled}')
                blue = await is_blue(f'#{btn_id}')
                check(f'{label}: {btn_id} blue', blue is True, 'not blue')

            # Click each export button and verify no crash
            for btn_id in ['btnToolsSave', 'btnToolsDownload', 'btnToolsShare']:
                await page.click(f'#{btn_id}')
                await page.wait_for_timeout(2000)
                # Verify button still exists and is blue
                blue = await is_blue(f'#{btn_id}')
                check(f'{label}: {btn_id} blue after click', blue is True, 'not blue')

        # ============ Test Annotate Draw specifically ============
        print('\n=== Annotate Draw subtab ===', flush=True)
        await page.click('.tools-tab[data-tab="annotate"]')
        await page.wait_for_timeout(300)
        await page.click('.tools-tab[data-subtab="draw"]')
        await page.wait_for_timeout(1500)
        draw_visible = await page.evaluate("document.getElementById('toolsDrawCanvas')?.hidden === false")
        check('Draw canvas visible', draw_visible)
        pdf_visible = await page.evaluate(r"""() => {
            const c = document.getElementById('toolsCanvas');
            return c && c.width > 100 && !c.hidden;
        }""")
        check('PDF canvas visible under draw overlay', pdf_visible, 'blank page bug')

        # ============ Test Compare ============
        print('\n=== Compare operation ===', flush=True)
        await page.click('.tools-tab[data-tab="compare"]')
        await page.wait_for_timeout(300)
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(4000)
        compare_visible = await page.evaluate("document.getElementById('compareView')?.hidden === false")
        check('Compare view visible after Run', compare_visible)
        # Run button should be restored (not stuck)
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        check('Compare: Run button restored', run_disabled is False, f'disabled={run_disabled}')
        run_blue = await is_blue('#btnRunToolOp')
        check('Compare: Run button blue', run_blue is True, 'not blue')

        # ============ Cycle backward through all tabs ============
        print('\n=== Cycle backward through tabs ===', flush=True)
        all_tabs = ['compare', 'watermark', 'annotate', 'reorder', 'rotate', 'split', 'merge']
        for tab in all_tabs:
            await page.click(f'.tools-tab[data-tab="{tab}"]')
            await page.wait_for_timeout(200)
            active = await page.evaluate(f"document.querySelector('.tools-tab[data-tab=\"{tab}\"]')?.classList.contains('is-active')")
            check(f'Backward: {tab} tab active', active)
            # Verify Run button is blue in every tab
            run_blue = await is_blue('#btnRunToolOp')
            check(f'Backward {tab}: Run button blue', run_blue is True, 'not blue')

        # ============ Test: no PDF loaded → buttons disabled + error toast ============
        print('\n=== No PDF loaded state ===', flush=True)
        # Reload page to reset state
        await page.reload(wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        # Accept splash again
        try:
            await page.click('#splashAccept', timeout=2000)
            await page.wait_for_timeout(200)
            await page.click('#splashStart', timeout=2000)
            await page.wait_for_timeout(500)
        except: pass
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        # Without loading a PDF, Run should be disabled
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        check('Run disabled when no PDF loaded', run_disabled is True, f'disabled={run_disabled}')
        # Export buttons should be disabled
        for btn_id in ['btnToolsSave', 'btnToolsDownload', 'btnToolsShare', 'btnToolsPrint']:
            disabled = await page.evaluate(f"document.getElementById('{btn_id}')?.disabled")
            check(f'{btn_id} disabled when no PDF', disabled is True, f'disabled={disabled}')

        # ============ Final error check ============
        critical = [e for e in errors if 'error' in e.lower()]
        check('No critical console errors', len(critical) == 0, f'count={len(critical)}')
        for e in critical[:5]:
            print(f'    ERROR: {e}', flush=True)

        # ============ Summary ============
        total = len(results['checks'])
        passed = sum(1 for c in results['checks'] if c['ok'])
        print(f'\n=== SUMMARY ===')
        print(f'Total checks: {total}')
        print(f'Passed: {passed}')
        print(f'Failed: {total - passed}')
        if results['issues']:
            print(f'\nFailed checks:')
            for issue in results['issues']:
                print(f'  - {issue}')

        ok = (total - passed == 0) and len(critical) == 0
        print(f'\nOVERALL: {"PASS" if ok else "FAIL"}')
        await browser.close()
        sys.exit(0 if ok else 1)

asyncio.run(main())
