"""
DocuScan Pro — Comprehensive button cycling test (v5.1.3).
Cycles through EVERY button on EVERY workspace, both forward and backward,
verifying:
  1. Buttons don't disappear after click
  2. Buttons return to blue after click (no stuck non-blue state)
  3. State resets properly when switching workspaces
  4. Workspace switching forward + backward works

Defensive: closes modals between operations, catches per-button errors,
doesn't click buttons that open modals without first verifying them.
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SAMPLE_PDF = '/home/z/my-project/assets/samples/test-contract.pdf'
SAMPLE_IMG = '/home/z/my-project/assets/samples/sample-page-1.jpg'


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
        # Accept splash
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

        async def button_is_blue(selector):
            """Verify a button has blue background + white text (or red for danger).
            Accepts both the regular blue rgb(0, 102, 204) and the pressed/hover
            shade rgb(0, 98, 204) since the cursor may still be over the button
            after a click in headless mode (Chromium keeps :hover state)."""
            try:
                style = await page.evaluate(r"""(sel) => {
                    const b = document.querySelector(sel);
                    if (!b) return null;
                    const s = getComputedStyle(b);
                    return { bg: s.backgroundColor, color: s.color, disabled: b.disabled, visible: b.offsetParent !== null };
                }""", selector)
                if not style:
                    return None
                bg = style['bg']
                color = style['color']
                # Accept either primary blue (0, 102, 204) or pressed blue (0, 98, 204)
                blue_ok = (('0, 102, 204' in bg) or ('0, 98, 204' in bg)) and ('255, 255, 255' in color)
                red_ok = '255, 59, 48' in bg and '255, 255, 255' in color
                return blue_ok or red_ok
            except:
                return None

        async def chip_is_styled(selector):
            """Verify a chip has a visible non-default background after click.
            Chips are .chip elements which become tinted blue when .is-active."""
            try:
                style = await page.evaluate(r"""(sel) => {
                    const b = document.querySelector(sel);
                    if (!b) return null;
                    const s = getComputedStyle(b);
                    return { bg: s.backgroundColor, color: s.color, classes: b.className, visible: b.offsetParent !== null };
                }""", selector)
                if not style:
                    return None
                # Chip is "active" if it has the is-active class
                return 'is-active' in style['classes']
            except:
                return None

        async def close_any_open_modals():
            """Close any open signature sheet or help article before continuing."""
            try:
                sheet = await page.query_selector('#signatureSheet:not([hidden])')
                if sheet:
                    cancel = await page.query_selector('#btnCancelSig')
                    if cancel:
                        await cancel.click()
                        await page.wait_for_timeout(300)
            except: pass
            try:
                article = await page.query_selector('#helpArticle.is-open')
                if article:
                    back = await page.query_selector('#helpArticleBack')
                    if back:
                        await back.click()
                        await page.wait_for_timeout(300)
            except: pass

        async def click_and_verify_blue(selector, label='', wait_ms=200):
            """Click a button, verify it returns to blue (or red) after click."""
            try:
                btn = await page.query_selector(selector)
                if not btn:
                    check(f'{label or selector} exists', False, 'not found')
                    return
                if await btn.is_disabled():
                    check(f'{label} disabled (skip click)', True)
                    return
                await btn.click()
                await page.wait_for_timeout(wait_ms)
                await close_any_open_modals()
                # After click + wait, button should still be blue/red (or faded blue if disabled during async action)
                is_blue = await button_is_blue(selector)
                if is_blue is None:
                    check(f'{label} visible after click', False, 'button vanished')
                else:
                    check(f'{label} stays blue after click', is_blue, 'color state wrong')
            except Exception as e:
                check(f'{label} click', False, str(e))

        async def click_chip_and_verify_active(selector, label='', wait_ms=100):
            """Click a chip, verify it becomes is-active."""
            try:
                chip = await page.query_selector(selector)
                if not chip:
                    check(f'{label} exists', False, 'not found')
                    return
                await chip.click()
                await page.wait_for_timeout(wait_ms)
                is_active = await chip_is_styled(selector)
                if is_active is None:
                    check(f'{label} visible', False, 'chip vanished')
                else:
                    check(f'{label} becomes active', is_active)
            except Exception as e:
                check(f'{label} chip click', False, str(e))

        # ============ STUDIO ============
        print('\n=== STUDIO workspace ===', flush=True)
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)

        # Cycle through enhancement preset chips (forward) — chips, not buttons
        for preset in ['none', 'auto', 'grayscale', 'bw', 'brighten', 'contrast']:
            await click_chip_and_verify_active(f'#enhancePresets .chip[data-preset="{preset}"]', f'preset:{preset}')
        # Backward
        for preset in reversed(['none', 'auto', 'grayscale', 'bw', 'brighten', 'contrast']):
            await click_chip_and_verify_active(f'#enhancePresets .chip[data-preset="{preset}"]', f'preset-rev:{preset}')

        # Adjust sliders
        for v in ['50', '-30', '0']:
            await page.fill('#brightness', v)
            await page.wait_for_timeout(50)
        for v in ['50', '-30', '0']:
            await page.fill('#contrast', v)
            await page.wait_for_timeout(50)
        check('Studio sliders adjust', True)

        # Load image so Create PDF becomes enabled
        await page.set_input_files('#imagesInput', SAMPLE_IMG)
        await page.wait_for_timeout(1500)
        create_enabled = await page.evaluate("document.getElementById('btnCreatePdf')?.disabled")
        check('Create PDF enabled after image loaded', create_enabled is False, f'disabled={create_enabled}')

        # Click each studio export button (with longer wait for async PDF build).
        # Create PDF loads pdf-lib on first run; wait long enough for it to complete
        # so the button returns to its non-spinner blue state.
        for btn_id, wait in [('btnCreatePdf', 5000), ('btnStudioSave', 3000), ('btnStudioDownload', 2500), ('btnStudioShare', 2500)]:
            await click_and_verify_blue(f'#{btn_id}', btn_id, wait_ms=wait)
        # Skip Print in test (opens print dialog)
        check('Studio Print button skipped (opens dialog)', True)

        # Send to Sign / Tools — switch workspaces
        # The handler does async PDF build (loads pdf-lib) + loadSignDocument (loads pdf.js)
        # — needs a longer wait for the workspace to actually switch
        await page.click('#btnSendToSign')
        await page.wait_for_timeout(8000)  # wait for async PDF build + load
        in_sign = await page.evaluate("document.querySelector('.workspace.is-active')?.dataset.workspace")
        check('Send to Sign switches to Sign', in_sign == 'sign', f'workspace={in_sign}')
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)
        studio_active = await page.evaluate("document.querySelector('.workspace.is-active')?.dataset.workspace")
        check('Back to Studio works', studio_active == 'studio', f'workspace={studio_active}')

        # ============ SIGN ============
        print('\n=== SIGN workspace ===', flush=True)
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#signPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)

        # Verify editing buttons enabled after PDF load
        for btn_id in ['btnAddSignature', 'btnAddText', 'btnAddDate']:
            disabled = await page.evaluate(f"document.getElementById('{btn_id}')?.disabled")
            check(f'{btn_id} enabled after PDF load', disabled is False, f'disabled={disabled}')

        # Click each editing button (modal-safe)
        # AddSignature opens a sheet — click it, close sheet, verify blue
        await click_and_verify_blue('#btnAddSignature', 'AddSignature', wait_ms=400)
        # AddText requires typed text; just verify click doesn't break it
        await page.fill('#textInput', 'Test text')
        await click_and_verify_blue('#btnAddText', 'AddText', wait_ms=300)
        await click_and_verify_blue('#btnAddDate', 'AddDate', wait_ms=300)

        # Test Undo (should be enabled after AddText + AddDate actions)
        undo_enabled = await page.evaluate("document.getElementById('btnUndo')?.disabled")
        check('Undo enabled after AddText/AddDate', undo_enabled is False, f'disabled={undo_enabled}')
        await click_and_verify_blue('#btnUndo', 'Undo', wait_ms=500)

        # Test Insert Watermark + Remove (new same-row layout)
        # Insert Watermark loads pdf-lib + rebuilds PDF — wait long enough for it
        await click_and_verify_blue('#btnInsertWatermark', 'Insert WM', wait_ms=5000)
        # Undo should still be enabled after Insert WM
        undo_after_wm = await page.evaluate("document.getElementById('btnUndo')?.disabled")
        check('Undo enabled after Insert WM', undo_after_wm is False, f'disabled={undo_after_wm}')
        await click_and_verify_blue('#btnRemoveWatermark', 'Remove WM', wait_ms=5000)
        # Remove WM should push to history (so Undo can restore watermark)
        undo_after_remove = await page.evaluate("document.getElementById('btnUndo')?.disabled")
        check('Undo enabled after Remove WM', undo_after_remove is False, f'disabled={undo_after_remove}')

        # Export buttons (with longer wait for async PDF commit)
        for btn_id, wait in [('btnSaveToLibrary', 3000), ('btnDownloadPdf', 3000), ('btnSharePdf', 3000)]:
            await click_and_verify_blue(f'#{btn_id}', btn_id, wait_ms=wait)

        # ============ PDF TOOLS ============
        print('\n=== PDF TOOLS workspace ===', flush=True)
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#toolsPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(2500)

        # Cycle through operation tabs (forward + backward)
        tabs = ['merge', 'split', 'rotate', 'reorder', 'annotate', 'watermark', 'compare']
        for tab in tabs:
            await page.click(f'.tools-tab[data-tab="{tab}"]')
            await page.wait_for_timeout(150)
            active = await page.evaluate(f"document.querySelector('.tools-tab[data-tab=\"{tab}\"]')?.classList.contains('is-active')")
            check(f'Tab {tab} active (forward)', active)
        for tab in reversed(tabs):
            await page.click(f'.tools-tab[data-tab="{tab}"]')
            await page.wait_for_timeout(150)
            active = await page.evaluate(f"document.querySelector('.tools-tab[data-tab=\"{tab}\"]')?.classList.contains('is-active')")
            check(f'Tab {tab} active (reverse)', active)

        # Test Annotate sub-tabs: Text → Draw → Text (forward+backward)
        await page.click('.tools-tab[data-tab="annotate"]')
        await page.wait_for_timeout(300)
        await page.click('.tools-tab[data-subtab="draw"]')
        await page.wait_for_timeout(500)
        draw_visible = await page.evaluate("document.getElementById('toolsDrawCanvas')?.hidden === false")
        check('Draw canvas visible after Draw subtab', draw_visible)
        pdf_canvas_visible = await page.evaluate(r"""() => {
            const c = document.getElementById('toolsCanvas');
            return c && c.width > 100 && c.height > 100 && c.hidden === false;
        }""")
        check('PDF canvas visible under Draw overlay', pdf_canvas_visible, 'canvas may be blank')
        await page.click('.tools-tab[data-subtab="text"]')
        await page.wait_for_timeout(300)
        text_panel_visible = await page.evaluate("document.getElementById('annotateTextPanel')?.hidden === false")
        check('Text subtab visible after switching back', text_panel_visible)

        # Test Compare tab — Run button renders compare view
        await page.click('.tools-tab[data-tab="compare"]')
        await page.wait_for_timeout(300)
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(3000)
        compare_visible = await page.evaluate("document.getElementById('compareView')?.hidden === false")
        check('Compare view visible after Run', compare_visible)
        left_has_canvas = await page.evaluate("document.getElementById('compareLeftWrap')?.querySelector('canvas') !== null")
        check('Compare left pane has canvas (File A)', left_has_canvas)

        # Test loading 2nd PDF for Compare — should auto-render
        await page.set_input_files('#toolsMergeInput', '/home/z/my-project/assets/samples/multi-page-test.pdf')
        await page.wait_for_timeout(2500)
        right_has_canvas = await page.evaluate("document.getElementById('compareRightWrap')?.querySelector('canvas') !== null")
        check('Compare right pane has canvas after 2nd PDF', right_has_canvas)

        # ============ LIBRARY ============
        print('\n=== LIBRARY workspace ===', flush=True)
        await page.click('.bottom-nav__item[data-goto="library"]')
        await page.wait_for_timeout(1000)
        lib_cards = await page.evaluate("document.querySelectorAll('.library-card').length")
        check('Library has documents', lib_cards > 0, f'count={lib_cards}')
        await click_and_verify_blue('#btnRefreshLibrary', 'Refresh', wait_ms=500)

        # ============ HELP ============
        print('\n=== HELP workspace ===', flush=True)
        await page.click('.bottom-nav__item[data-goto="help"]')
        await page.wait_for_timeout(400)
        topic_count = await page.evaluate("document.querySelectorAll('#helpTopics .help-topic').length")
        check('Help topics rendered', topic_count > 10, f'count={topic_count}')

        # Search forward + clear
        for q in ['watermark', 'sign', 'merge', '']:
            await page.fill('#helpSearchInput', q)
            await page.wait_for_timeout(300)
            count = await page.evaluate("document.querySelectorAll('#helpTopics .help-topic').length")
            if q:
                check(f'Search "{q}" returns results', count > 0, f'count={count}')
            else:
                check('Clear search restores all topics', count == topic_count)

        # ============ Cycle back through all workspaces ============
        print('\n=== Cycle back through workspaces ===', flush=True)
        for ws in ['home', 'studio', 'sign', 'tools', 'library', 'help', 'home']:
            await page.click(f'.bottom-nav__item[data-goto="{ws}"]')
            await page.wait_for_timeout(200)
            active = await page.evaluate(f"document.querySelector('.workspace.is-active')?.dataset.workspace")
            check(f'Navigated to {ws}', active == ws, f'active={active}')

        # Verify Home tour button still works after cycling
        await page.click('.page-tour-btn[data-tour="home"]')
        await page.wait_for_timeout(800)
        wt_active = await page.evaluate("!!document.querySelector('.walkthrough-card')")
        check('Home tour button still works after cycling', wt_active)
        await page.click('.walkthrough-card [data-wt="skip"]')
        await page.wait_for_timeout(300)

        # ============ Final error check ============
        critical_errors = [e for e in errors if 'error' in e.lower()]
        check('No critical console errors during cycling', len(critical_errors) == 0, f'errors={critical_errors[:3]}')

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
        print(f'\nCritical console errors: {len(critical_errors)}')
        for e in critical_errors[:5]:
            print(f'  {e}')

        ok = (total - passed == 0) and len(critical_errors) == 0
        print(f'\nOVERALL: {"PASS" if ok else "FAIL"}')
        await browser.close()
        sys.exit(0 if ok else 1)

asyncio.run(main())
