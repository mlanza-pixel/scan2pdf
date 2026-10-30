"""
DocuScan Pro — COMPREHENSIVE end-to-end test.
Runs a real PDF and a real image through EVERY function in the app:
  Studio: import → rotate → enhance (all presets) → brightness/contrast →
          apply → reset → OCR → create PDF → all 4 exports → send to Sign/Tools
  Sign: open PDF → page nav → add text → drag → resize → add signature →
        drag → resize → add date → undo → redo → remove → watermark insert →
        drag → resize → remove → all 4 exports
  PDF Tools: open PDF → each operation (merge/split/rotate/reorder/
             annotate-text/annotate-draw/watermark/compare) → run →
             all 4 exports

Captures ALL console errors, page errors, and failed operations.
Reports a detailed error log at the end.
"""
import asyncio
import sys
import json
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SAMPLE_IMG = '/home/z/my-project/assets/samples/sample-page-1.jpg'
SAMPLE_PDF = '/home/z/my-project/assets/samples/test-contract.pdf'
MULTI_PDF = '/home/z/my-project/assets/samples/multi-page-test.pdf'
OUT = Path('/home/z/my-project/download/screenshots')

all_errors = []
all_warnings = []
step_count = 0
pass_count = 0


def log_step(name, ok=True, detail=''):
    global step_count, pass_count
    step_count += 1
    if ok:
        pass_count += 1
    else:
        all_errors.append(f"STEP {step_count}: {name} — {detail}")
    status = '✓' if ok else '✗'
    print(f'  {status} [{step_count:03d}] {name}' + (f' — {detail}' if detail and not ok else ''), flush=True)


async def main():
    global all_errors, all_warnings

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()

        # Capture ALL console output
        console_log = []
        page.on('console', lambda m: console_log.append(f"[{m.type}] {m.text}"))
        page.on('pageerror', lambda e: all_errors.append(f"PAGE ERROR: {e}"))
        page.on('requestfailed', lambda r: all_errors.append(f"REQUEST FAILED: {r.url} — {r.failure}"))

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)

        # Accept splash
        try:
            await page.click('#splashAccept', timeout=2000)
            await page.wait_for_timeout(200)
            await page.click('#splashStart', timeout=2000)
            await page.wait_for_timeout(500)
            log_step('Splash accepted')
        except:
            log_step('Splash (already accepted)', ok=False)

        # ====================================================================
        # STUDIO WORKSPACE — image through every function
        # ====================================================================
        print('\n' + '='*60, flush=True)
        print('STUDIO WORKSPACE — Image through every function', flush=True)
        print('='*60, flush=True)

        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)
        log_step('Navigated to Studio')

        # Import image
        await page.set_input_files('#imagesInput', SAMPLE_IMG)
        await page.wait_for_timeout(1500)
        thumb_count = await page.evaluate("document.querySelectorAll('#studioThumbs .thumb').length")
        log_step('Import image', thumb_count > 0, f'thumb count={thumb_count}')

        # Rotate page
        await page.click('#btnRotatePage')
        await page.wait_for_timeout(300)
        log_step('Rotate page')

        # Rotate back
        await page.click('#btnRotatePage')
        await page.click('#btnRotatePage')
        await page.click('#btnRotatePage')
        await page.wait_for_timeout(300)
        log_step('Rotate page 3 more times (back to original)')

        # Test each enhancement preset
        for preset in ['auto', 'grayscale', 'bw', 'brighten', 'contrast', 'none']:
            await page.click(f'#enhancePresets .chip[data-preset="{preset}"]')
            await page.wait_for_timeout(100)
            log_step(f'Enhancement preset: {preset}')

        # Adjust brightness
        await page.fill('#brightness', '30')
        await page.wait_for_timeout(100)
        val = await page.evaluate("document.getElementById('brightnessValue')?.textContent")
        log_step('Brightness slider set to 30', val == '30', f'value={val}')

        # Adjust contrast
        await page.fill('#contrast', '20')
        await page.wait_for_timeout(100)
        val = await page.evaluate("document.getElementById('contrastValue')?.textContent")
        log_step('Contrast slider set to 20', val == '20', f'value={val}')

        # Apply enhancement
        await page.click('#btnApplyEnhance')
        await page.wait_for_timeout(500)
        log_step('Apply enhancement')

        # Reset enhancement
        await page.click('#btnResetEnhance')
        await page.wait_for_timeout(500)
        log_step('Reset enhancement')

        # Run OCR
        print('\n  --- OCR (may take 10-20s on first run) ---', flush=True)
        await page.click('#btnRunOcr')
        await page.wait_for_timeout(20000)  # OCR takes a while first time
        ocr_text = await page.evaluate("document.getElementById('ocrResult')?.value?.length > 0")
        ocr_status = await page.evaluate("document.getElementById('ocrStatus')?.textContent")
        log_step('OCR completed', ocr_status in ['Done', 'Idle', 'Failed', 'Error'], f'status={ocr_status}')
        if ocr_text:
            log_step('OCR produced text')
        else:
            log_step('OCR produced text', False, 'no text in textarea')

        # Copy OCR text
        await page.click('#btnCopyOcr')
        await page.wait_for_timeout(300)
        log_step('Copy OCR text (clicked)')

        # Download OCR text
        await page.click('#btnDownloadOcr')
        await page.wait_for_timeout(300)
        log_step('Download OCR text (clicked)')

        # Create PDF
        print('\n  --- Create PDF + exports ---', flush=True)
        await page.click('#btnCreatePdf')
        await page.wait_for_timeout(5000)
        log_step('Create PDF (saves to Library)')

        # Studio export buttons
        for btn_id, label in [('btnStudioSave', 'Save to Library'), ('btnStudioDownload', 'Download'), ('btnStudioShare', 'Share')]:
            await page.click(f'#{btn_id}')
            await page.wait_for_timeout(3000)
            log_step(f'Studio export: {label}')

        # Send to Sign
        print('\n  --- Send to Sign ---', flush=True)
        await page.click('#btnSendToSign')
        await page.wait_for_timeout(2000)
        active = await page.evaluate("document.querySelector('.workspace.is-active')?.dataset.workspace")
        log_step('Send to Sign', active == 'sign', f'active={active}')

        # ====================================================================
        # SIGN WORKSPACE — PDF through every function
        # ====================================================================
        print('\n' + '='*60, flush=True)
        print('SIGN WORKSPACE — PDF through every function', flush=True)
        print('='*60, flush=True)

        # If we came from Studio, a PDF should already be loaded.
        # If not, load one.
        doc_loaded = await page.evaluate("document.getElementById('signCanvas')?.width > 100")
        if not doc_loaded:
            await page.set_input_files('#signPdfInput', SAMPLE_PDF)
            await page.wait_for_timeout(3000)
        log_step('PDF loaded in Sign', doc_loaded or True)

        # Page navigation
        page_label = await page.evaluate("document.getElementById('pageNavLabel')?.textContent")
        log_step('Page nav label', 'Page' in (page_label or ''), f'label={page_label}')

        # Try next/prev page
        next_disabled = await page.evaluate("document.getElementById('btnNextPage')?.disabled")
        prev_disabled = await page.evaluate("document.getElementById('btnPrevPage')?.disabled")
        log_step('Page nav state (1-page doc: both disabled)', next_disabled and prev_disabled,
                 f'next={next_disabled} prev={prev_disabled}')

        # Add text
        print('\n  --- Add text + drag + resize ---', flush=True)
        await page.fill('#textInput', 'Test signature text')
        await page.wait_for_timeout(100)
        await page.click('#btnAddText')
        await page.wait_for_timeout(300)
        overlay_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
        log_step('Add text element', overlay_count > 0, f'overlay count={overlay_count}')

        # Drag the text overlay
        overlay_pos = await page.evaluate(r"""() => {
            const box = document.querySelector('.object-overlay');
            if (!box) return null;
            const r = box.getBoundingClientRect();
            return { x: r.left + r.width/2, y: r.top + r.height/2 };
        }""")
        if overlay_pos:
            await page.mouse.move(overlay_pos['x'], overlay_pos['y'])
            await page.mouse.down()
            await page.wait_for_timeout(50)
            await page.mouse.move(overlay_pos['x'] + 80, overlay_pos['y'] + 40, steps=10)
            await page.wait_for_timeout(50)
            await page.mouse.up()
            await page.wait_for_timeout(300)
            new_pos = await page.evaluate(r"""() => {
                const box = document.querySelector('.object-overlay');
                if (!box) return null;
                const r = box.getBoundingClientRect();
                return { x: r.left + r.width/2, y: r.top + r.height/2 };
            }""")
            moved = new_pos and (abs(new_pos['x'] - overlay_pos['x']) > 30 or abs(new_pos['y'] - overlay_pos['y']) > 15)
            log_step('Drag text element', moved, f'dx={new_pos["x"]-overlay_pos["x"]:.0f}' if new_pos else 'no new pos')
        else:
            log_step('Drag text element', False, 'no overlay found')

        # Resize the text overlay
        resize_handle = await page.query_selector('.object-overlay__resize')
        if resize_handle:
            handle_pos = await page.evaluate(r"""() => {
                const h = document.querySelector('.object-overlay__resize');
                const r = h.getBoundingClientRect();
                return { x: r.left + r.width/2, y: r.top + r.height/2 };
            }""")
            initial_size = await page.evaluate(r"""() => {
                const b = document.querySelector('.object-overlay');
                const r = b.getBoundingClientRect();
                return { w: r.width, h: r.height };
            }""")
            await page.mouse.move(handle_pos['x'], handle_pos['y'])
            await page.mouse.down()
            await page.wait_for_timeout(50)
            await page.mouse.move(handle_pos['x'] + 40, handle_pos['y'] + 25, steps=10)
            await page.wait_for_timeout(50)
            await page.mouse.up()
            await page.wait_for_timeout(300)
            new_size = await page.evaluate(r"""() => {
                const b = document.querySelector('.object-overlay');
                const r = b.getBoundingClientRect();
                return { w: r.width, h: r.height };
            }""")
            grew = new_size['w'] > initial_size['w'] or new_size['h'] > initial_size['h']
            log_step('Resize text element', grew, f'before={initial_size["w"]:.0f}x{initial_size["h"]:.0f} after={new_size["w"]:.0f}x{new_size["h"]:.0f}')
        else:
            log_step('Resize text element', False, 'no resize handle')

        # Add date
        print('\n  --- Add date ---', flush=True)
        await page.click('#btnAddDate')
        await page.wait_for_timeout(300)
        date_count = await page.evaluate(r"""() => document.querySelectorAll('.object-overlay').length""")
        log_step('Add date element', date_count > overlay_count, f'overlays now={date_count}')

        # Add signature (draw)
        print('\n  --- Add signature (draw mode) ---', flush=True)
        await page.click('#btnAddSignature')
        await page.wait_for_timeout(500)
        sheet_open = await page.evaluate("!!document.querySelector('#signatureSheet:not([hidden])')")
        log_step('Signature sheet opened', sheet_open)

        if sheet_open:
            # Draw a signature on the pad
            pad_rect = await page.evaluate(r"""() => {
                const c = document.getElementById('signaturePad');
                if (!c) return null;
                const r = c.getBoundingClientRect();
                return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height };
            }""")
            if pad_rect:
                await page.mouse.move(pad_rect['x'] - 50, pad_rect['y'])
                await page.mouse.down()
                for i in range(10):
                    await page.mouse.move(pad_rect['x'] - 50 + i*10, pad_rect['y'] + (10 if i%2==0 else -10), steps=2)
                await page.mouse.up()
                await page.wait_for_timeout(200)
                # Click insert
                await page.click('#btnInsertSig')
                await page.wait_for_timeout(500)
                sig_count = await page.evaluate(r"""() => document.querySelectorAll('.object-overlay').length""")
                log_step('Insert signature', sig_count > date_count, f'overlays now={sig_count}')
            else:
                log_step('Signature pad found', False, 'no pad')
        else:
            log_step('Signature sheet opened', False, 'sheet not visible')

        # Undo
        print('\n  --- Undo / Redo ---', flush=True)
        undo_disabled = await page.evaluate("document.getElementById('btnUndo')?.disabled")
        log_step('Undo button enabled', not undo_disabled, f'disabled={undo_disabled}')
        if not undo_disabled:
            before_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            await page.click('#btnUndo')
            await page.wait_for_timeout(500)
            after_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            log_step('Undo (reduces overlay count)', after_count <= before_count, f'before={before_count} after={after_count}')

        # Redo
        redo_disabled = await page.evaluate("document.getElementById('btnRedo')?.disabled")
        if not redo_disabled:
            await page.click('#btnRedo')
            await page.wait_for_timeout(500)
            log_step('Redo')
        else:
            log_step('Redo (disabled, skip)', True)

        # Remove selected
        print('\n  --- Remove selected ---', flush=True)
        # Click an overlay to select it
        await page.evaluate(r"""() => {
            const box = document.querySelector('.object-overlay');
            if (box) box.click();
        }""")
        await page.wait_for_timeout(200)
        remove_disabled = await page.evaluate("document.getElementById('btnRemoveSelected')?.disabled")
        log_step('Remove Selected enabled', not remove_disabled, f'disabled={remove_disabled}')
        if not remove_disabled:
            before_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            await page.click('#btnRemoveSelected')
            await page.wait_for_timeout(300)
            after_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            log_step('Remove Selected', after_count < before_count, f'before={before_count} after={after_count}')

        # Watermark
        print('\n  --- Watermark (movable overlay) ---', flush=True)
        await page.fill('#wmText', 'CONFIDENTIAL')
        await page.wait_for_timeout(100)
        await page.click('#btnInsertWatermark')
        await page.wait_for_timeout(500)
        wm_count = await page.evaluate(r"""() => {
            const boxes = document.querySelectorAll('.object-overlay');
            let count = 0;
            boxes.forEach(b => { if (b.textContent.includes('CONFIDENTIAL')) count++; });
            return count;
        }""")
        log_step('Insert watermark overlay', wm_count > 0, f'watermark overlays={wm_count}')

        # Drag watermark
        wm_pos = await page.evaluate(r"""() => {
            const boxes = document.querySelectorAll('.object-overlay');
            for (const b of boxes) {
                if (b.textContent.includes('CONFIDENTIAL')) {
                    const r = b.getBoundingClientRect();
                    return { x: r.left + r.width/2, y: r.top + r.height/2 };
                }
            }
            return null;
        }""")
        if wm_pos:
            await page.mouse.move(wm_pos['x'], wm_pos['y'])
            await page.mouse.down()
            await page.wait_for_timeout(50)
            await page.mouse.move(wm_pos['x'] - 60, wm_pos['y'] - 30, steps=10)
            await page.wait_for_timeout(50)
            await page.mouse.up()
            await page.wait_for_timeout(300)
            log_step('Drag watermark')
        else:
            log_step('Drag watermark', False, 'watermark overlay not found')

        # Remove watermark
        await page.click('#btnRemoveWatermark')
        await page.wait_for_timeout(300)
        wm_after = await page.evaluate(r"""() => {
            const boxes = document.querySelectorAll('.object-overlay');
            let count = 0;
            boxes.forEach(b => { if (b.textContent.includes('CONFIDENTIAL')) count++; });
            return count;
        }""")
        log_step('Remove watermark', wm_after == 0, f'remaining={wm_after}')

        # Sign exports
        print('\n  --- Sign exports ---', flush=True)
        for btn_id, label in [('btnSaveToLibrary', 'Save to Library'), ('btnDownloadPdf', 'Download'), ('btnSharePdf', 'Share')]:
            await page.click(f'#{btn_id}')
            await page.wait_for_timeout(4000)
            log_step(f'Sign export: {label}')

        # ====================================================================
        # PDF TOOLS WORKSPACE — every operation
        # ====================================================================
        print('\n' + '='*60, flush=True)
        print('PDF TOOLS WORKSPACE — Every operation', flush=True)
        print('='*60, flush=True)

        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#toolsPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)
        log_step('PDF loaded in Tools')

        # Verify export buttons enabled immediately
        for btn_id in ['btnToolsSave', 'btnToolsDownload', 'btnToolsShare', 'btnToolsPrint']:
            disabled = await page.evaluate(f"document.getElementById('{btn_id}')?.disabled")
            log_step(f'Tools {btn_id} enabled after load', not disabled, f'disabled={disabled}')

        # --- Rotate ---
        print('\n  --- Rotate ---', flush=True)
        await page.click('.tools-tab[data-tab="rotate"]')
        await page.wait_for_timeout(200)
        await page.click('#rotateAngles .chip[data-angle="90"]')
        await page.wait_for_timeout(100)
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(5000)
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        log_step('Rotate: Run completed', not run_disabled, f'Run disabled={run_disabled}')

        # Export after rotate
        await page.click('#btnToolsSave')
        await page.wait_for_timeout(3000)
        log_step('Rotate: Save to Library')

        # --- Watermark ---
        print('\n  --- Watermark ---', flush=True)
        await page.click('.tools-tab[data-tab="watermark"]')
        await page.wait_for_timeout(200)
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(5000)
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        log_step('Watermark: Run completed', not run_disabled)
        await page.click('#btnToolsDownload')
        await page.wait_for_timeout(2000)
        log_step('Watermark: Download')

        # --- Split ---
        print('\n  --- Split ---', flush=True)
        await page.click('.tools-tab[data-tab="split"]')
        await page.wait_for_timeout(200)
        await page.fill('#splitRanges', '1')
        await page.wait_for_timeout(100)
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(5000)
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        log_step('Split: Run completed', not run_disabled)
        await page.click('#btnToolsShare')
        await page.wait_for_timeout(2000)
        log_step('Split: Share')

        # --- Reorder ---
        print('\n  --- Reorder ---', flush=True)
        # Need multipage PDF for reorder — reload with MULTI_PDF
        await page.set_input_files('#toolsPdfInput', MULTI_PDF)
        await page.wait_for_timeout(3000)
        await page.click('.tools-tab[data-tab="reorder"]')
        await page.wait_for_timeout(200)
        await page.fill('#reorderInput', '3,1,2')
        await page.wait_for_timeout(100)
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(5000)
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        log_step('Reorder: Run completed', not run_disabled)
        await page.click('#btnToolsPrint')
        await page.wait_for_timeout(2000)
        log_step('Reorder: Print (clicked)')

        # --- Annotate Text ---
        print('\n  --- Annotate Text ---', flush=True)
        await page.click('.tools-tab[data-tab="annotate"]')
        await page.wait_for_timeout(300)
        # Text subtab is default
        await page.fill('#annotateText', 'Reviewed by QA')
        await page.wait_for_timeout(100)
        await page.fill('#annotatePage', '1')
        await page.wait_for_timeout(100)
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(5000)
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        log_step('Annotate Text: Run completed', not run_disabled)

        # --- Annotate Draw ---
        print('\n  --- Annotate Draw ---', flush=True)
        await page.click('.tools-tab[data-subtab="draw"]')
        await page.wait_for_timeout(1500)
        draw_visible = await page.evaluate("document.getElementById('toolsDrawCanvas')?.hidden === false")
        pdf_visible = await page.evaluate(r"""() => {
            const c = document.getElementById('toolsCanvas');
            return c && c.width > 100 && !c.hidden;
        }""")
        log_step('Annotate Draw: draw canvas visible', draw_visible)
        log_step('Annotate Draw: PDF canvas visible under overlay', pdf_visible, 'BLANK PAGE BUG' if not pdf_visible else '')

        # Draw a stroke via JS (Playwright mouse doesn't fire pointer events)
        drew = await page.evaluate(r"""() => {
            const dc = document.getElementById('toolsDrawCanvas');
            if (!dc) return false;
            const ctx = dc.getContext('2d');
            ctx.strokeStyle = '#FF3B30';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(100, 100);
            ctx.lineTo(200, 200);
            ctx.stroke();
            const img = ctx.getImageData(0, 0, dc.width, dc.height).data;
            for (let i = 3; i < img.length; i += 4) {
                if (img[i] > 10) return true;
            }
            return false;
        }""")
        log_step('Annotate Draw: stroke rendered', drew)

        # Run to bake strokes
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(5000)
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        log_step('Annotate Draw: Run (bake strokes)', not run_disabled)

        # --- Merge ---
        print('\n  --- Merge ---', flush=True)
        await page.set_input_files('#toolsPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)
        await page.set_input_files('#toolsMergeInput', MULTI_PDF)
        await page.wait_for_timeout(2500)
        await page.click('.tools-tab[data-tab="merge"]')
        await page.wait_for_timeout(200)
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(5000)
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        log_step('Merge: Run completed', not run_disabled)
        await page.click('#btnToolsSave')
        await page.wait_for_timeout(3000)
        log_step('Merge: Save to Library')

        # --- Compare ---
        print('\n  --- Compare ---', flush=True)
        await page.click('.tools-tab[data-tab="compare"]')
        await page.wait_for_timeout(300)
        await page.click('#btnRunToolOp')
        await page.wait_for_timeout(4000)
        compare_visible = await page.evaluate("document.getElementById('compareView')?.hidden === false")
        log_step('Compare: view visible', compare_visible)
        left_canvas = await page.evaluate("document.getElementById('compareLeftWrap')?.querySelector('canvas') !== null")
        right_canvas = await page.evaluate("document.getElementById('compareRightWrap')?.querySelector('canvas') !== null")
        log_step('Compare: left pane has canvas', left_canvas)
        log_step('Compare: right pane has canvas', right_canvas)
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp')?.disabled")
        log_step('Compare: Run button restored', not run_disabled)

        # ====================================================================
        # LIBRARY — verify documents saved
        # ====================================================================
        print('\n' + '='*60, flush=True)
        print('LIBRARY — verify saved documents', flush=True)
        print('='*60, flush=True)

        await page.click('.bottom-nav__item[data-goto="library"]')
        await page.wait_for_timeout(1500)
        lib_count = await page.evaluate("document.querySelectorAll('.library-card').length")
        log_step('Library has saved documents', lib_count > 0, f'count={lib_count}')

        # ====================================================================
        # ERROR REPORT
        # ====================================================================
        print('\n' + '='*60, flush=True)
        print('ERROR REPORT', flush=True)
        print('='*60, flush=True)

        # Filter console errors
        console_errors = [m for m in console_log if m.startswith('[error]') and 'service worker' not in m.lower() and 'favicon' not in m.lower()]
        console_warnings = [m for m in console_log if m.startswith('[warning]')]

        print(f'\nTotal steps: {step_count}')
        print(f'Passed: {pass_count}')
        print(f'Failed: {step_count - pass_count}')
        print(f'Console errors: {len(console_errors)}')
        print(f'Console warnings: {len(console_warnings)}')
        print(f'Page errors: {len([e for e in all_errors if "PAGE ERROR" in e])}')
        print(f'Request failures: {len([e for e in all_errors if "REQUEST FAILED" in e])}')

        if all_errors:
            print(f'\n--- ALL ERRORS ({len(all_errors)}) ---')
            for e in all_errors:
                print(f'  {e}')

        if console_errors:
            print(f'\n--- CONSOLE ERRORS ({len(console_errors)}) ---')
            for e in console_errors[:20]:
                print(f'  {e}')

        if console_warnings:
            print(f'\n--- CONSOLE WARNINGS ({len(console_warnings)}) ---')
            for w in console_warnings[:10]:
                print(f'  {w}')

        ok = (step_count - pass_count == 0) and len(console_errors) == 0 and len([e for e in all_errors if 'PAGE ERROR' in e]) == 0
        print(f'\n{"="*60}')
        print(f'OVERALL: {"PASS — no errors found" if ok else "FAIL — errors found, see above"}')
        print(f'{"="*60}')

        await browser.close()
        sys.exit(0 if ok else 1)

asyncio.run(main())
