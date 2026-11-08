"""Real-button-click integration test for v7.5.x.

This test clicks the ACTUAL buttons a user would click (Camera, Import Images,
Open PDF, Open 2nd PDF) and verifies the hidden file inputs receive .click()
calls. It does NOT bypass the UI via set_input_files() — that's what the
prior tests did wrong.

Workflow:
  Studio:   Camera button → verify cameraInput.click fired
            Import button → verify imagesInput.click fired
  Sign:     Open PDF button → verify signPdfInput.click fired
            After Save → click Open PDF again → verify it still fires
  Tools:    Open PDF button → verify toolsPdfInput.click fired
            After Save → click Open PDF again → verify it still fires
            Switch to Merge → Open 2nd PDF → verify toolsMergeInput.click fired
"""
import asyncio
import sys
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'


async def main():
    results = []
    def check(name, cond, detail=''):
        results.append((name, bool(cond), detail))
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ''))

    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(f"[{m.type}] {m.text}") if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errs.append(f"[pageerror] {e}"))

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        try:
            await page.click('#splashAccept', timeout=2000)
            await page.wait_for_timeout(200)
            await page.click('#splashStart', timeout=2000)
            await page.wait_for_timeout(400)
        except Exception:
            pass

        # Wire a JS probe that records every input.click() call.
        # We override .click() on each input so it logs the call instead of
        # opening the OS file picker. Other event listeners (change, etc.)
        # remain intact for when we explicitly set_input_files later.
        await page.evaluate("""() => {
            window.__clickLog = [];
            ['cameraInput', 'imagesInput', 'signPdfInput', 'toolsPdfInput', 'toolsMergeInput'].forEach(id => {
                const inp = document.getElementById(id);
                if (!inp) return;
                inp.click = function() {
                    window.__clickLog.push(id);
                    // Do NOT call the original .click() — we just want to verify
                    // the button handler invoked .click() on the right input.
                };
            });
        }""")

        # ===== STUDIO =====
        print('\n=== STUDIO: Camera + Import buttons ===')
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)
        # Camera button
        await page.click('#btnCaptureCamera')
        await page.wait_for_timeout(300)
        log = await page.evaluate("window.__clickLog")
        check('Camera button triggers cameraInput.click()', 'cameraInput' in log, f"log={log}")

        # Import button
        await page.evaluate("window.__clickLog = []")
        await page.click('#btnImportImages')
        await page.wait_for_timeout(300)
        log = await page.evaluate("window.__clickLog")
        check('Import button triggers imagesInput.click()', 'imagesInput' in log, f"log={log}")

        # ===== SIGN =====
        print('\n=== SIGN: Open PDF button (before + after Save) ===')
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(400)
        # Click Open PDF
        await page.evaluate("window.__clickLog = []")
        await page.click('#btnOpenPdfSign')
        await page.wait_for_timeout(300)
        log = await page.evaluate("window.__clickLog")
        check('Sign Open PDF triggers signPdfInput.click()', 'signPdfInput' in log, f"log={log}")

        # Actually load a PDF via set_input_files (Playwright bypasses the
        # JS .click override and sets the files directly on the input element,
        # triggering the change event normally).
        await page.set_input_files('#signPdfInput', '/home/z/my-project/assets/samples/test-contract.pdf')
        await page.wait_for_timeout(3000)
        # Re-wire the .click override (set_input_files may have re-set it)
        await page.evaluate("""() => {
            window.__clickLog = [];
            const inp = document.getElementById('signPdfInput');
            if (inp) inp.click = function() { window.__clickLog.push('signPdfInput'); };
        }""")
        # Save
        try:
            await page.click('#btnSaveToLibrary', timeout=2000)
            await page.wait_for_timeout(3000)
            check('Sign Save click succeeded', True)
        except Exception as e:
            check('Sign Save click succeeded', False, str(e))
        # After Save, try Open PDF again
        await page.evaluate("window.__clickLog = []")
        await page.click('#btnOpenPdfSign')
        await page.wait_for_timeout(300)
        log = await page.evaluate("window.__clickLog")
        check('After Save, Sign Open PDF still triggers input.click()', 'signPdfInput' in log, f"log={log}")

        # ===== TOOLS =====
        print('\n=== TOOLS: Open PDF + 2nd PDF + after Save ===')
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        # Re-wire probe (the inputs may have been re-created)
        await page.evaluate("""() => {
            window.__clickLog = [];
            ['toolsPdfInput', 'toolsMergeInput'].forEach(id => {
                const inp = document.getElementById(id);
                if (!inp) return;
                inp.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    window.__clickLog.push(id);
                }, true);
            });
        }""")
        # Open PDF
        await page.click('#btnOpenPdfTools')
        await page.wait_for_timeout(300)
        log = await page.evaluate("window.__clickLog")
        check('Tools Open PDF triggers toolsPdfInput.click()', 'toolsPdfInput' in log, f"log={log}")

        # Actually load the PDF
        await page.set_input_files('#toolsPdfInput', '/home/z/my-project/assets/samples/test-contract.pdf')
        await page.wait_for_timeout(2500)
        await page.evaluate("""() => {
            window.__clickLog = [];
            ['toolsPdfInput', 'toolsMergeInput'].forEach(id => {
                const inp = document.getElementById(id);
                if (!inp) return;
                inp.click = function() { window.__clickLog.push(id); };
            });
        }""")
        # Save
        try:
            await page.click('#btnToolsSave', timeout=2000)
            await page.wait_for_timeout(3000)
            check('Tools Save click succeeded', True)
        except Exception as e:
            check('Tools Save click succeeded', False, str(e))
        # After Save, try Open PDF again
        await page.evaluate("window.__clickLog = []")
        await page.click('#btnOpenPdfTools')
        await page.wait_for_timeout(300)
        log = await page.evaluate("window.__clickLog")
        check('After Save, Tools Open PDF still triggers input.click()', 'toolsPdfInput' in log, f"log={log}")
        # Open 2nd PDF (merge tab is default after load)
        await page.evaluate("window.__clickLog = []")
        second_visible = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden === false")
        if second_visible:
            await page.click('#btnAddSecondPdf')
            await page.wait_for_timeout(300)
            log = await page.evaluate("window.__clickLog")
            check('Open 2nd PDF triggers toolsMergeInput.click()', 'toolsMergeInput' in log, f"log={log}")
        else:
            check('Open 2nd PDF button visible on Merge tab', False, 'hidden')

        # ===== Library position =====
        print('\n=== Library: documents at top of page ===')
        await page.click('.bottom-nav__item[data-goto="library"]')
        await page.wait_for_timeout(2000)
        pos = await page.evaluate("""() => {
            const grid = document.getElementById('libraryGrid');
            if (!grid) return {err: 'no grid'};
            const r = grid.getBoundingClientRect();
            return {gridY: Math.round(r.y), cardCount: grid.querySelectorAll('.library-card').length};
        }""")
        check('Library grid is visible in viewport (y < 400)', pos.get('gridY', 9999) < 400, f"pos={pos}")

        # ===== Console errors =====
        critical = [e for e in errs if '[pageerror]' in e or '[error]' in e.lower()]
        critical = [e for e in critical if 'service worker' not in e.lower() and 'Failed to register' not in e]
        check('No critical console errors', len(critical) == 0, f"count={len(critical)}")
        if critical:
            for c in critical[:5]:
                print(f"     {c}")

        passed = sum(1 for _, ok, _ in results if ok)
        failed = sum(1 for _, ok, _ in results if not ok)
        print(f"\n=== SUMMARY ===\nTotal: {len(results)}  Passed: {passed}  Failed: {failed}")
        if failed:
            print('\nFailures:')
            for name, ok, detail in results:
                if not ok:
                    print(f"  ✗ {name} — {detail}")

        await b.close()
        sys.exit(0 if failed == 0 else 1)


asyncio.run(main())
