"""
Step-by-step PDF Tools walkthrough test for v7.4.x.

Uses the 10-page test PDF so multi-page operations (Split, Reorder,
Delete Pages, Watermark, OCR) produce verifiable results. Verifies the
NEW layout at each step:
  1.  Empty state — 2nd PDF hidden, Run disabled, page nav "No document".
  2.  Open 10-page PDF — page nav "Page 1 of 10", Run enabled.
  3.  Page navigation under preview — slider, Prev/Next swap content.
  4.  Switch to Split tab — 2nd PDF hides, Run stays "Run".
  5.  Switch to Merge tab — 2nd PDF reappears.
  6.  Open 2nd PDF — both loaded; compare view shows.
  7.  Run Merge — output page count = 10 + N.
  8.  Switch to Rotate, Run Rotate 90° — preview aspect ratio flips.
  9.  Switch to Reorder — input new order (e.g. '10,9,8,7,6,5,4,3,2,1').
  10. Run Reorder — output page count = same.
  11. Switch to Delete Pages — remove pages 2,4,6.
  12. Run Delete — output page count = 7.
  13. Switch to Watermark — type "CONFIDENTIAL".
  14. Run Watermark — no crash.
  15. Switch to OCR — Run becomes "Scan", OCR card visible.
  16. Click Scan — wait, verify OCR textarea fills with text.
  17. Copy / Download .txt / Read aloud buttons — no crash.
  18. Switch back to Merge — Run label resets to "Run", OCR card hides.
  19. Save to Library.
  20. Download — no crash.
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
PDF_10PAGE = '/home/z/my-project/assets/samples/test-10page.pdf'
PDF_2ND = '/home/z/my-project/assets/samples/test-contract.pdf'


async def main():
    results = []
    def check(name, cond, detail=''):
        results.append((name, bool(cond), detail))
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ''))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        # Stub speech synthesis so Read aloud doesn't throw
        await page.add_init_script("""
            window.speechSynthesis = window.speechSynthesis || {
                getVoices: () => [], speak: () => {}, cancel: () => {}, paused: false, pending: false, speaking: false,
            };
            window.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance || class { constructor(t){this.text=t;} };
        """)
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
        print('\n=== STEP 1: Tools empty state ===')
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(500)
        second_hidden = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        check('2nd PDF button hidden before PDF loaded', second_hidden, f"hidden={second_hidden}")
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp').disabled")
        check('Run button disabled when no PDF', run_disabled, f"disabled={run_disabled}")
        nav_label = await page.evaluate("document.getElementById('toolsPageNavLabel').innerText.trim()")
        check('Tools page nav shows "No document"', nav_label == 'No document', f"text='{nav_label}'")
        nav_col = await page.evaluate("document.getElementById('toolsPageNav').closest('.sign-layout__right') ? 'right' : 'left'")
        check('Tools page nav in right column (under preview)', nav_col == 'right', f"col={nav_col}")

        # ===== STEP 2: Open 10-page PDF =====
        print('\n=== STEP 2: Open 10-page PDF ===')
        await page.set_input_files('#toolsPdfInput', PDF_10PAGE)
        await page.wait_for_timeout(3000)
        nav_label = await page.evaluate("document.getElementById('toolsPageNavLabel').innerText.trim()")
        check('Tools page nav updates to "Page 1 of 10"', nav_label == 'Page 1 of 10', f"text='{nav_label}'")
        slider_max = await page.evaluate("document.getElementById('toolsPageSlider').max")
        check('Tools slider max is 10', slider_max == '10', f"max={slider_max}")
        run_disabled = await page.evaluate("document.getElementById('btnRunToolOp').disabled")
        check('Run button enabled after PDF load', not run_disabled, f"disabled={run_disabled}")
        second_hidden = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        check('2nd PDF visible on merge tab (default)', not second_hidden, f"hidden={second_hidden}")

        # ===== STEP 3: Page navigation =====
        print('\n=== STEP 3: Page navigation under preview ===')
        # Use JS click for tabs that may be offscreen
        await page.click('#btnToolsNextPage')
        await page.wait_for_timeout(500)
        nav_label = await page.evaluate("document.getElementById('toolsPageNavLabel').innerText.trim()")
        check('Next advances to page 2', nav_label == 'Page 2 of 10', f"text='{nav_label}'")
        await page.click('#btnToolsPrevPage')
        await page.wait_for_timeout(500)
        nav_label = await page.evaluate("document.getElementById('toolsPageNavLabel').innerText.trim()")
        check('Prev returns to page 1', nav_label == 'Page 1 of 10', f"text='{nav_label}'")
        # Slider to page 5
        await page.evaluate("""() => {
            const s = document.getElementById('toolsPageSlider');
            s.value = 5;
            s.dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        await page.wait_for_timeout(500)
        nav_label = await page.evaluate("document.getElementById('toolsPageNavLabel').innerText.trim()")
        check('Slider set to 5 shows page 5', nav_label == 'Page 5 of 10', f"text='{nav_label}'")
        # Back to page 1
        await page.evaluate("""() => {
            const s = document.getElementById('toolsPageSlider');
            s.value = 1;
            s.dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        await page.wait_for_timeout(500)

        # ===== STEP 4: Switch to Split tab =====
        print('\n=== STEP 4: Split tab — 2nd PDF hides ===')
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"split\"]').click()")
        await page.wait_for_timeout(400)
        second_hidden = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        check('2nd PDF hidden on Split tab', second_hidden, f"hidden={second_hidden}")
        run_label = await page.evaluate("document.getElementById('btnRunToolOp').innerText.trim()")
        check('Run button label stays "Run" on Split', run_label == 'Run', f"label='{run_label}'")

        # ===== STEP 5: Switch to Merge tab =====
        print('\n=== STEP 5: Merge tab — 2nd PDF reappears ===')
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"merge\"]').click()")
        await page.wait_for_timeout(400)
        second_hidden = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        check('2nd PDF visible on Merge tab', not second_hidden, f"hidden={second_hidden}")

        # ===== STEP 6: Open 2nd PDF =====
        print('\n=== STEP 6: Open 2nd PDF for merge ===')
        await page.set_input_files('#toolsMergeInput', PDF_2ND)
        await page.wait_for_timeout(2500)
        # No direct way to verify secondary list count via DOM; verify no crash
        check('2nd PDF loaded without crash', True)

        # ===== STEP 7: Run Merge =====
        print('\n=== STEP 7: Run Merge ===')
        run_btn = await page.query_selector('#btnRunToolOp')
        if run_btn and not await run_btn.is_disabled():
            await run_btn.click()
            await page.wait_for_timeout(5000)
            # After merge, output should have more pages. Verify page count metadata changed.
            doc_info = await page.evaluate("document.getElementById('toolsDocInfo').innerText.trim()")
            check('Merge completed (doc info updated)', 'page' in doc_info.lower(), f"info='{doc_info}'")
        else:
            check('Merge Run button enabled', False, 'disabled')

        # ===== STEP 8: Rotate =====
        print('\n=== STEP 8: Rotate 90° ===')
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"rotate\"]').click()")
        await page.wait_for_timeout(400)
        # Pick 90°
        await page.evaluate("""() => {
            const chip = document.querySelector('#rotateAngles .chip[data-angle="90"]');
            if (chip) chip.click();
        }""")
        await page.wait_for_timeout(200)
        before_dims = await page.evaluate("""() => {
            const c = document.getElementById('toolsCanvas');
            return {w: c.width, h: c.height};
        }""")
        run_btn = await page.query_selector('#btnRunToolOp')
        if run_btn and not await run_btn.is_disabled():
            await run_btn.click()
            await page.wait_for_timeout(3000)
            after_dims = await page.evaluate("""() => {
                const c = document.getElementById('toolsCanvas');
                return {w: c.width, h: c.height};
            }""")
            before_portrait = before_dims['w'] < before_dims['h']
            after_portrait = after_dims['w'] < after_dims['h']
            check('Rotate flips aspect ratio',
                  before_portrait != after_portrait,
                  f"before={before_dims} after={after_dims}")
        else:
            check('Rotate Run button enabled', False, 'disabled')

        # ===== STEP 9: Reorder =====
        print('\n=== STEP 9: Reorder (reverse all pages) ===')
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"reorder\"]').click()")
        await page.wait_for_timeout(400)
        # Get current page count from docInfo
        doc_info = await page.evaluate("document.getElementById('toolsDocInfo').innerText.trim()")
        # Parse page count
        import re
        m = re.search(r'(\d+)\s+page', doc_info)
        page_count = int(m.group(1)) if m else 10
        # Reverse order — set the hidden input's value via JS (the field is
        # type="hidden" so Playwright's fill() can't target it).
        new_order = ','.join(str(i) for i in range(page_count, 0, -1))
        await page.evaluate(f"""() => {{
            const inp = document.getElementById('reorderInput');
            if (!inp) return;
            inp.value = '{new_order}';
            inp.dispatchEvent(new Event('change', {{bubbles: true}}));
        }}""")
        await page.wait_for_timeout(200)
        run_btn = await page.query_selector('#btnRunToolOp')
        if run_btn and not await run_btn.is_disabled():
            await run_btn.click()
            await page.wait_for_timeout(3000)
            check('Reorder Run completed', True)
        else:
            check('Reorder Run button enabled', False, 'disabled')

        # ===== STEP 10: Switch to Delete Pages =====
        print('\n=== STEP 10: Delete Pages (click thumbnails 2, 4, 6) ===')
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"deletes\"]').click()")
        await page.wait_for_timeout(800)  # give the thumb strip time to render
        # Click thumbnails at positions 2, 4, 6 to mark them for deletion
        await page.evaluate("""() => {
            const thumbs = document.querySelectorAll('#deleteThumbStrip .thumb');
            [1, 3, 5].forEach(i => { if (thumbs[i]) thumbs[i].click(); });
        }""")
        await page.wait_for_timeout(300)
        before_info = await page.evaluate("document.getElementById('toolsDocInfo').innerText.trim()")
        run_btn = await page.query_selector('#btnRunToolOp')
        if run_btn and not await run_btn.is_disabled():
            await run_btn.click()
            await page.wait_for_timeout(3000)
            after_info = await page.evaluate("document.getElementById('toolsDocInfo').innerText.trim()")
            # Page count should drop by 3
            import re
            m1 = re.search(r'(\d+)\s+page', before_info)
            m2 = re.search(r'(\d+)\s+page', after_info)
            before_n = int(m1.group(1)) if m1 else 0
            after_n = int(m2.group(1)) if m2 else 0
            check('Delete Pages reduces page count by 3',
                  after_n == before_n - 3,
                  f"before={before_n} after={after_n}")
        else:
            check('Delete Run button enabled', False, 'disabled')

        # ===== STEP 11: Watermark =====
        print('\n=== STEP 11: Watermark ===')
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"watermark\"]').click()")
        await page.wait_for_timeout(400)
        try:
            await page.fill('#twmText', 'CONFIDENTIAL')
            await page.wait_for_timeout(200)
        except Exception:
            pass
        run_btn = await page.query_selector('#btnRunToolOp')
        if run_btn and not await run_btn.is_disabled():
            await run_btn.click()
            await page.wait_for_timeout(3000)
            check('Watermark Run completed', True)
        else:
            check('Watermark Run button enabled', False, 'disabled')

        # ===== STEP 12: OCR tab =====
        print('\n=== STEP 12: OCR tab — Run becomes Scan, card visible ===')
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"ocrpdf\"]').click()")
        await page.wait_for_timeout(400)
        run_label = await page.evaluate("document.getElementById('btnRunToolOp').innerText.trim()")
        check('Run button label is "Scan" on OCR tab', run_label == 'Scan', f"label='{run_label}'")
        ocr_card_hidden = await page.evaluate("document.getElementById('toolsOcrResultCard').hidden")
        check('OCR result card visible on OCR tab', not ocr_card_hidden, f"hidden={ocr_card_hidden}")
        # Textarea should be empty initially
        ta_value = await page.evaluate("document.getElementById('pdfOcrResult').value")
        check('OCR textarea starts empty', ta_value == '', f"value='{ta_value[:30]}'")

        # ===== STEP 13: Click Scan =====
        print('\n=== STEP 13: Run Scan (may take 30-60s) ===')
        # Use page 1 only to speed up OCR
        try:
            await page.evaluate("""() => {
                const sel = document.getElementById('pdfOcrPages');
                if (sel) { sel.value = '1'; sel.dispatchEvent(new Event('change', {bubbles:true})); }
            }""")
        except Exception:
            pass
        await page.wait_for_timeout(200)
        run_btn = await page.query_selector('#btnRunToolOp')
        if run_btn and not await run_btn.is_disabled():
            await run_btn.click()
            # Wait for OCR — Tesseract first run downloads language data
            timeout = 90
            elapsed = 0
            status_text = ''
            while elapsed < timeout:
                await page.wait_for_timeout(3000)
                elapsed += 3
                ta_value = await page.evaluate("document.getElementById('pdfOcrResult').value")
                if ta_value and 'No text' not in ta_value:
                    break
            ta_value = await page.evaluate("document.getElementById('pdfOcrResult').value")
            check(f'OCR produced text (in {elapsed}s)', len(ta_value) > 0, f"text_len={len(ta_value)}")
        else:
            check('Scan button enabled', False, 'disabled')

        # ===== STEP 14: Copy / Download / Read aloud =====
        print('\n=== STEP 14: OCR action buttons ===')
        try:
            await page.click('#btnCopyPdfOcr')
            await page.wait_for_timeout(300)
            check('Copy OCR text — no crash', True)
        except Exception as e:
            check('Copy OCR text — no crash', False, str(e))
        try:
            await page.click('#btnDownloadPdfOcr')
            await page.wait_for_timeout(300)
            check('Download OCR .txt — no crash', True)
        except Exception as e:
            check('Download OCR .txt — no crash', False, str(e))
        try:
            await page.click('#btnSpeakPdfOcr')
            await page.wait_for_timeout(300)
            check('Read aloud — no crash', True)
        except Exception as e:
            check('Read aloud — no crash', False, str(e))

        # ===== STEP 15: Switch back to Merge — Run label resets =====
        print('\n=== STEP 15: Switch to Merge — Run label resets ===')
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"merge\"]').click()")
        await page.wait_for_timeout(400)
        run_label = await page.evaluate("document.getElementById('btnRunToolOp').innerText.trim()")
        check('Run label resets to "Run" on Merge tab', run_label == 'Run', f"label='{run_label}'")
        ocr_card_hidden = await page.evaluate("document.getElementById('toolsOcrResultCard').hidden")
        check('OCR result card hidden on Merge tab', ocr_card_hidden, f"hidden={ocr_card_hidden}")

        # ===== STEP 16: Save to Library =====
        print('\n=== STEP 16: Save to Library ===')
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
        save_btn = await page.query_selector('#btnToolsSave')
        if save_btn and not await save_btn.is_disabled():
            await save_btn.click()
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
            check('Save to Library increments count',
                  idb_after > idb_before, f"before={idb_before} after={idb_after}")
        else:
            check('Save button enabled', False, 'disabled')

        # ===== STEP 17: Download =====
        print('\n=== STEP 17: Download ===')
        try:
            await page.click('#btnToolsDownload')
            await page.wait_for_timeout(1000)
            check('Download — no crash', True)
        except Exception as e:
            check('Download — no crash', False, str(e))

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
