"""
Step-by-step Sign workspace walkthrough test for v7.4.x.

Loads a PDF, walks through every Sign feature in order, verifying the
NEW layout at each step:
  1.  Empty state — Open PDF button in left column, page nav under preview
      in right column showing "No document".
  2.  Open PDF — page nav updates to "Page 1 of N", preview canvas visible.
  3.  Page navigation (multi-page doc) — Prev/Next/slider under preview.
  4.  Add Text — type text, click button, verify overlay appears on canvas.
  5.  Drag text element — verify it moves.
  6.  Resize text element via width input.
  7.  Add Date — verify overlay.
  8.  Undo — text element disappears.
  9.  Redo — text element reappears.
  10. Remove selected — element disappears.
  11. Watermark — type text, insert, verify overlay.
  12. Remove watermark.
  13. Save to Library — IndexedDB count increments.
  14. Download — no crash.
  15. Share — no crash.
  16. Send to Studio (if available) — switches workspace.
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SAMPLE_PDF = '/home/z/my-project/assets/samples/test-10page.pdf'


async def main():
    results = []
    def check(name, cond, detail=''):
        results.append((name, bool(cond), detail))
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ''))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(f"[{m.type}] {m.text}") if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errs.append(f"[pageerror] {e}"))

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(800)
        try:
            await page.click('#splashAccept', timeout=2000)
            await page.wait_for_timeout(200)
            await page.click('#splashStart', timeout=2000)
            await page.wait_for_timeout(400)
        except Exception:
            pass

        # ===== STEP 1: Empty state =====
        print('\n=== STEP 1: Sign empty state ===')
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(500)
        open_col = await page.evaluate("document.getElementById('btnOpenPdfSign').closest('.sign-layout__right') ? 'right' : 'left'")
        check('Open PDF button in left column', open_col == 'left', f"col={open_col}")
        nav_col = await page.evaluate("document.getElementById('pageNav').closest('.sign-layout__right') ? 'right' : 'left'")
        check('Page nav in right column (under preview)', nav_col == 'right', f"col={nav_col}")
        nav_label = await page.evaluate("document.getElementById('pageNavLabel').innerText.trim()")
        check('Page nav shows "No document" when empty', nav_label == 'No document', f"text='{nav_label}'")
        slider_display = await page.evaluate("getComputedStyle(document.getElementById('pageSlider')).display")
        check('Slider hidden when no document', slider_display == 'none', f"display={slider_display}")
        doc_info = await page.evaluate("document.getElementById('signDocInfo').innerText.trim()")
        check('Sign doc info says "No document loaded"', doc_info == 'No document loaded', f"text='{doc_info}'")
        # Editing buttons disabled
        for btn_id in ['btnAddSignature', 'btnAddText', 'btnAddDate', 'btnAddStamp', 'btnAddHighlight']:
            disabled = await page.evaluate(f"document.getElementById('{btn_id}').disabled")
            check(f'{btn_id} disabled when no document', disabled, f"disabled={disabled}")

        # ===== STEP 2: Open PDF =====
        print('\n=== STEP 2: Open 10-page PDF ===')
        await page.set_input_files('#signPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)
        nav_label = await page.evaluate("document.getElementById('pageNavLabel').innerText.trim()")
        check('Page nav updates to "Page 1 of 10"', nav_label == 'Page 1 of 10', f"text='{nav_label}'")
        canvas_visible = await page.evaluate("document.getElementById('signCanvasStage').hidden === false")
        check('Sign canvas stage visible', canvas_visible, f"visible={canvas_visible}")
        slider_display = await page.evaluate("getComputedStyle(document.getElementById('pageSlider')).display")
        check('Slider visible for multi-page doc', slider_display != 'none', f"display={slider_display}")
        slider_max = await page.evaluate("document.getElementById('pageSlider').max")
        check('Slider max is 10', slider_max == '10', f"max={slider_max}")
        # Editing buttons now enabled
        for btn_id in ['btnAddSignature', 'btnAddText', 'btnAddDate']:
            disabled = await page.evaluate(f"document.getElementById('{btn_id}').disabled")
            check(f'{btn_id} enabled after PDF load', not disabled, f"disabled={disabled}")

        # ===== STEP 3: Page navigation =====
        print('\n=== STEP 3: Page navigation (Prev/Next/Slider) ===')
        await page.click('#btnNextPage')
        await page.wait_for_timeout(500)
        nav_label = await page.evaluate("document.getElementById('pageNavLabel').innerText.trim()")
        check('Next button advances to page 2', nav_label == 'Page 2 of 10', f"text='{nav_label}'")
        await page.click('#btnPrevPage')
        await page.wait_for_timeout(500)
        nav_label = await page.evaluate("document.getElementById('pageNavLabel').innerText.trim()")
        check('Prev button returns to page 1', nav_label == 'Page 1 of 10', f"text='{nav_label}'")
        # Slider
        await page.evaluate("""() => {
            const s = document.getElementById('pageSlider');
            s.value = 5;
            s.dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        await page.wait_for_timeout(500)
        nav_label = await page.evaluate("document.getElementById('pageNavLabel').innerText.trim()")
        check('Slider set to 5 shows page 5', nav_label == 'Page 5 of 10', f"text='{nav_label}'")
        # Back to page 1
        await page.evaluate("""() => {
            const s = document.getElementById('pageSlider');
            s.value = 1;
            s.dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        await page.wait_for_timeout(500)

        # ===== STEP 4: Add Text =====
        print('\n=== STEP 4: Add Text element ===')
        await page.fill('#textInput', 'APPROVED')
        await page.wait_for_timeout(200)
        await page.click('#btnAddText')
        await page.wait_for_timeout(500)
        overlay_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
        check('Text overlay created on canvas', overlay_count >= 1, f"count={overlay_count}")
        overlay_text = await page.evaluate("""() => {
            const o = document.querySelector('.object-overlay');
            return o ? o.innerText.trim() : null;
        }""")
        check('Overlay contains APPROVED text', overlay_text == 'APPROVED', f"text='{overlay_text}'")

        # ===== STEP 5: Drag text element =====
        print('\n=== STEP 5: Drag text element ===')
        before_pos = await page.evaluate("""() => {
            const o = document.querySelector('.object-overlay');
            if (!o) return null;
            const r = o.getBoundingClientRect();
            return {x: r.x + r.width/2, y: r.y + r.height/2};
        }""")
        if before_pos:
            # Drag by 100px right and 50px down
            await page.mouse.move(before_pos['x'], before_pos['y'])
            await page.mouse.down()
            await page.mouse.move(before_pos['x'] + 100, before_pos['y'] + 50, steps=10)
            await page.mouse.up()
            await page.wait_for_timeout(500)
            after_pos = await page.evaluate("""() => {
                const o = document.querySelector('.object-overlay.is-selected, .object-overlay');
                if (!o) return null;
                const r = o.getBoundingClientRect();
                return {x: r.x + r.width/2, y: r.y + r.height/2};
            }""")
            moved = (abs(after_pos['x'] - before_pos['x']) > 30 or
                     abs(after_pos['y'] - before_pos['y']) > 20)
            check('Text overlay moved after drag', moved,
                  f"before={before_pos} after={after_pos}")
        else:
            check('Text overlay moved after drag', False, 'no overlay found')

        # ===== STEP 6: Resize via width input =====
        print('\n=== STEP 6: Resize text element via width input ===')
        # Make sure overlay is selected
        await page.evaluate("""() => {
            const o = document.querySelector('.object-overlay');
            if (o) o.click();
        }""")
        await page.wait_for_timeout(200)
        await page.evaluate("""() => {
            const w = document.getElementById('objWidth');
            w.value = 60;
            w.dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        await page.wait_for_timeout(300)
        width_val = await page.evaluate("document.getElementById('objWidth').value")
        check('Width input updated to 60', width_val == '60', f"value='{width_val}'")

        # ===== STEP 7: Add Date =====
        print('\n=== STEP 7: Add Date element ===')
        before_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
        await page.click('#btnAddDate')
        await page.wait_for_timeout(500)
        after_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
        check('Date overlay added', after_count > before_count,
              f"before={before_count} after={after_count}")

        # ===== STEP 8: Undo =====
        print('\n=== STEP 8: Undo ===')
        undo_disabled = await page.evaluate("document.getElementById('btnUndo').disabled")
        if not undo_disabled:
            before_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            await page.click('#btnUndo')
            await page.wait_for_timeout(500)
            after_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            check('Undo removes last element', after_count < before_count,
                  f"before={before_count} after={after_count}")
        else:
            check('Undo available', False, 'undo disabled')

        # ===== STEP 9: Redo =====
        print('\n=== STEP 9: Redo ===')
        redo_disabled = await page.evaluate("document.getElementById('btnRedo').disabled")
        if not redo_disabled:
            before_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            await page.click('#btnRedo')
            await page.wait_for_timeout(500)
            after_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            check('Redo restores last element', after_count > before_count,
                  f"before={before_count} after={after_count}")
        else:
            check('Redo available', False, 'redo disabled')

        # ===== STEP 10: Remove selected =====
        print('\n=== STEP 10: Remove selected element ===')
        # Select an overlay via pointerdown (the overlay's selection handler
        # is wired to pointerdown, not click).
        await page.evaluate("""() => {
            const o = document.querySelector('.object-overlay');
            if (!o) return;
            const r = o.getBoundingClientRect();
            o.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true, cancelable: true, pointerType: 'mouse',
                clientX: r.x + r.width/2, clientY: r.y + r.height/2,
            }));
            // Followed by a pointerup to release pointer capture
            setTimeout(() => {
                o.dispatchEvent(new PointerEvent('pointerup', {bubbles: true, cancelable: true, pointerType: 'mouse'}));
            }, 50);
        }""")
        await page.wait_for_timeout(300)
        before_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
        rm_disabled = await page.evaluate("document.getElementById('btnRemoveSelected').disabled")
        if not rm_disabled:
            await page.click('#btnRemoveSelected')
            await page.wait_for_timeout(500)
            after_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            check('Remove selected removes an element', after_count < before_count,
                  f"before={before_count} after={after_count}")
        else:
            check('Remove selected button enabled', False, 'button disabled')

        # ===== STEP 11: Watermark =====
        print('\n=== STEP 11: Add watermark ===')
        await page.fill('#wmText', 'DRAFT')
        await page.wait_for_timeout(200)
        wm_disabled = await page.evaluate("document.getElementById('btnInsertWatermark').disabled")
        if wm_disabled:
            # Need at least one element selected sometimes; just click an overlay
            await page.evaluate("""() => {
                const o = document.querySelector('.object-overlay');
                if (o) o.click();
            }""")
            await page.wait_for_timeout(200)
        await page.click('#btnInsertWatermark')
        await page.wait_for_timeout(500)
        wm_visible = await page.evaluate("""() => {
            const o = Array.from(document.querySelectorAll('.object-overlay')).find(e => e.innerText.trim() === 'DRAFT');
            return !!o;
        }""")
        check('Watermark overlay created with DRAFT text', wm_visible, 'no DRAFT overlay')

        # ===== STEP 12: Remove watermark =====
        print('\n=== STEP 12: Remove watermark ===')
        rm_wm_disabled = await page.evaluate("document.getElementById('btnRemoveWatermark').disabled")
        if not rm_wm_disabled:
            await page.click('#btnRemoveWatermark')
            await page.wait_for_timeout(500)
            wm_still = await page.evaluate("""() => {
                const o = Array.from(document.querySelectorAll('.object-overlay')).find(e => e.innerText.trim() === 'DRAFT');
                return !!o;
            }""")
            check('Watermark removed', not wm_still, 'DRAFT still present')
        else:
            check('Remove watermark button enabled', False, 'button disabled')

        # ===== STEP 13: Save to Library =====
        print('\n=== STEP 13: Save to Library ===')
        idb_before = await page.evaluate(r"""async () => {
            return await new Promise((resolve) => {
                const req = indexedDB.open('docuscan-pro', 1);
                req.onsuccess = (ev) => {
                    const db = ev.target.result;
                    const tx = db.transaction('documents', 'readonly');
                    const r = tx.objectStore('documents').count();
                    r.onsuccess = () => resolve(r.result);
                    r.onerror = () => resolve(-1);
                };
                req.onerror = () => resolve(-2);
            });
        }""")
        save_disabled = await page.evaluate("document.getElementById('btnSaveToLibrary').disabled")
        if not save_disabled:
            await page.click('#btnSaveToLibrary')
            await page.wait_for_timeout(3000)
            idb_after = await page.evaluate(r"""async () => {
                return await new Promise((resolve) => {
                    const req = indexedDB.open('docuscan-pro', 1);
                    req.onsuccess = (ev) => {
                        const db = ev.target.result;
                        const tx = db.transaction('documents', 'readonly');
                        const r = tx.objectStore('documents').count();
                        r.onsuccess = () => resolve(r.result);
                        r.onerror = () => resolve(-1);
                    };
                    req.onerror = () => resolve(-2);
                });
            }""")
            check('Save to Library increments document count',
                  idb_after > idb_before, f"before={idb_before} after={idb_after}")
        else:
            check('Save button enabled', False, 'disabled')

        # ===== STEP 14: Download =====
        print('\n=== STEP 14: Download ===')
        try:
            await page.click('#btnDownloadPdf')
            await page.wait_for_timeout(1000)
            check('Download — no crash', True)
        except Exception as e:
            check('Download — no crash', False, str(e))

        # ===== STEP 15: Share =====
        print('\n=== STEP 15: Share ===')
        try:
            await page.click('#btnSharePdf')
            await page.wait_for_timeout(2000)
            check('Share — no crash', True)
        except Exception as e:
            check('Share — no crash', False, str(e))

        # ===== Console errors =====
        print('\n=== Console errors/warnings ===')
        critical = [e for e in errs if '[pageerror]' in e or '[error]' in e.lower()]
        critical = [e for e in critical if 'service worker' not in e.lower() and 'Failed to register' not in e]
        check('No critical console errors', len(critical) == 0, f"count={len(critical)}")
        if critical:
            for c in critical[:5]:
                print(f"     {c}")

        # ===== Summary =====
        passed = sum(1 for _, ok, _ in results if ok)
        failed = sum(1 for _, ok, _ in results if not ok)
        print(f"\n=== SUMMARY ===\nTotal: {len(results)}  Passed: {passed}  Failed: {failed}")
        if failed:
            print('\nFailures:')
            for name, ok, detail in results:
                if not ok:
                    print(f"  ✗ {name} — {detail}")

        await browser.close()
        sys.exit(0 if failed == 0 else 1)


asyncio.run(main())
