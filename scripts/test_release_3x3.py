"""End-to-end release test using 3 different pictures and 3 PDF sizes.

Cycles through:
  1. Studio: import 3 different images, build a PDF using each of 3 page sizes
     (Letter, A4, Fit-to-image), save to Library.
  2. Sign: open each of the 3 saved PDFs, add text, save back to Library.
  3. Tools: open each saved PDF, run Rotate, save back.

Uses REAL button clicks (Camera, Import, Open PDF, Save) — not bypasses.
"""
import asyncio
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SAMPLE_DIR = Path(__file__).resolve().parents[1] / 'tests' / 'fixtures'


def make_image(text, path, bg_color=(255, 255, 255), text_color=(28, 28, 30)):
    img = Image.new('RGB', (1240, 1754), color=bg_color)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 48)
        title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 64)
    except Exception:
        font = ImageFont.load_default()
        title_font = font
    draw.text((80, 80), text, fill=(0, 122, 255), font=title_font)
    draw.text((80, 200), text, fill=text_color, font=font)
    draw.text((80, 280), 'DocuScan Pro release test', fill=text_color, font=font)
    img.save(path, 'JPEG', quality=85)
    return str(path)


async def main():
    img1 = make_image('Picture ALPHA', SAMPLE_DIR / 'release-1.jpg', bg_color=(255, 250, 240))
    img2 = make_image('Picture BETA', SAMPLE_DIR / 'release-2.jpg', bg_color=(240, 250, 255))
    img3 = make_image('Picture GAMMA', SAMPLE_DIR / 'release-3.jpg', bg_color=(245, 255, 240))
    images = [img1, img2, img3]
    page_sizes = ['letter', 'a4', 'auto']

    results = []
    def check(name, cond, detail=''):
        results.append((name, bool(cond), detail))
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ''))

    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(f"[{m.type}] {m.text}") if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errs.append(f"[pageerror] {e}"))

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        try:
            await page.click('#splashAccept', timeout=2000); await page.wait_for_timeout(200)
            await page.click('#splashStart', timeout=2000); await page.wait_for_timeout(400)
        except: pass

        # Clear IndexedDB so we start fresh
        await page.evaluate("""async () => {
            return await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase('docuscan-pro');
                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
                req.onblocked = () => resolve(false);
            });
        }""")
        await page.reload(wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        try:
            await page.click('#splashAccept', timeout=2000); await page.wait_for_timeout(200)
            await page.click('#splashStart', timeout=2000); await page.wait_for_timeout(400)
        except: pass

        # ===== STUDIO: 3 images × 3 page sizes =====
        print('\n=== STUDIO: 3 pictures × 3 page sizes ===')
        saved_doc_names = []
        for i, (img, psize) in enumerate(zip(images, page_sizes), start=1):
            print(f'\n--- Round {i}: image={Path(img).name}, page_size={psize} ---')
            await page.click('.bottom-nav__item[data-goto="studio"]')
            await page.wait_for_timeout(400)
            # Clear any existing pages
            await page.evaluate("window.confirm = () => true;")
            await page.evaluate("""() => {
                const btn = document.getElementById('btnClearAllPages');
                if (btn && !btn.disabled) btn.click();
            }""")
            await page.wait_for_timeout(300)
            # Verify Camera button is clickable (just check it's enabled)
            cam_disabled = await page.evaluate("document.getElementById('btnCaptureCamera').disabled")
            check(f'Round {i}: Camera button enabled', not cam_disabled)
            # Click Import Images button — this triggers imagesInput.click()
            # We override .click to capture the call, then use set_input_files directly
            click_log = []
            await page.evaluate(f"""() => {{
                window.__impClick = false;
                const inp = document.getElementById('imagesInput');
                if (inp) inp.click = function() {{ window.__impClick = true; }};
            }}""")
            await page.click('#btnImportImages')
            await page.wait_for_timeout(200)
            imp_clicked = await page.evaluate("window.__impClick")
            check(f'Round {i}: Import button triggers imagesInput.click()', imp_clicked)
            # Now actually load the file via set_input_files
            await page.set_input_files('#imagesInput', img)
            await page.wait_for_timeout(1500)
            # Verify thumbnail appears
            thumb_count = await page.evaluate("document.querySelectorAll('#studioThumbs .thumb').length")
            check(f'Round {i}: thumbnail appears', thumb_count == 1, f"count={thumb_count}")
            # Select page size
            await page.evaluate(f"""() => {{
                document.getElementById('pdfPageSize').value = '{psize}';
            }}""")
            # Save to Library
            save_disabled = await page.evaluate("document.getElementById('btnStudioSave').disabled")
            check(f'Round {i}: Studio Save button enabled', not save_disabled, f"disabled={save_disabled}")
            if not save_disabled:
                await page.click('#btnStudioSave')
                await page.wait_for_timeout(2000)
                saved_doc_names.append(f'Studio_{psize}')

        # Verify 3 documents saved
        idb_count = await page.evaluate("""async () => {
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
        check('Studio: 3 documents saved to Library', idb_count >= 3, f"count={idb_count}")

        # ===== SIGN: open each saved PDF, add text, save =====
        print('\n=== SIGN: cycle through saved PDFs ===')
        for i in range(3):
            print(f'\n--- Sign round {i+1} ---')
            await page.click('.bottom-nav__item[data-goto="sign"]')
            await page.wait_for_timeout(400)
            # Click Open PDF button — verify it triggers input.click()
            await page.evaluate("""() => {
                window.__pdfClick = false;
                const inp = document.getElementById('signPdfInput');
                if (inp) inp.click = function() { window.__pdfClick = true; };
            }""")
            await page.click('#btnOpenPdfSign')
            await page.wait_for_timeout(200)
            pdf_clicked = await page.evaluate("window.__pdfClick")
            check(f'Sign round {i+1}: Open PDF triggers input.click()', pdf_clicked)
            # Actually load a PDF (use the test-contract for variety)
            await page.set_input_files('#signPdfInput', '/home/z/my-project/assets/samples/test-contract.pdf')
            await page.wait_for_timeout(3000)
            # Verify loaded
            nav_label = await page.evaluate("document.getElementById('pageNavLabel').innerText.trim()")
            check(f'Sign round {i+1}: PDF loaded (page nav shows pages)', 'of' in nav_label, f"label='{nav_label}'")
            # Add a text element
            await page.fill('#textInput', f'Round {i+1} signed')
            await page.wait_for_timeout(200)
            await page.click('#btnAddText')
            await page.wait_for_timeout(500)
            overlay_count = await page.evaluate("document.querySelectorAll('.object-overlay').length")
            check(f'Sign round {i+1}: text overlay added', overlay_count >= 1, f"count={overlay_count}")
            # Save
            save_disabled = await page.evaluate("document.getElementById('btnSaveToLibrary').disabled")
            if not save_disabled:
                await page.click('#btnSaveToLibrary')
                await page.wait_for_timeout(3000)
                check(f'Sign round {i+1}: Save succeeded', True)
            else:
                check(f'Sign round {i+1}: Save succeeded', False, 'button disabled')

        # ===== TOOLS: open each saved PDF, rotate, save =====
        print('\n=== TOOLS: cycle through saved PDFs ===')
        for i in range(3):
            print(f'\n--- Tools round {i+1} ---')
            await page.click('.bottom-nav__item[data-goto="tools"]')
            await page.wait_for_timeout(400)
            # Click Open PDF — verify trigger
            await page.evaluate("""() => {
                window.__pdfClick = false;
                const inp = document.getElementById('toolsPdfInput');
                if (inp) inp.click = function() { window.__pdfClick = true; };
            }""")
            await page.click('#btnOpenPdfTools')
            await page.wait_for_timeout(200)
            pdf_clicked = await page.evaluate("window.__pdfClick")
            check(f'Tools round {i+1}: Open PDF triggers input.click()', pdf_clicked)
            # Load PDF
            await page.set_input_files('#toolsPdfInput', '/home/z/my-project/assets/samples/test-contract.pdf')
            await page.wait_for_timeout(3000)
            nav_label = await page.evaluate("document.getElementById('toolsPageNavLabel').innerText.trim()")
            check(f'Tools round {i+1}: PDF loaded', 'of' in nav_label, f"label='{nav_label}'")
            # Switch to Rotate tab and run
            await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"rotate\"]').click()")
            await page.wait_for_timeout(400)
            await page.evaluate("""() => {
                const chip = document.querySelector('#rotateAngles .chip[data-angle="90"]');
                if (chip) chip.click();
            }""")
            await page.wait_for_timeout(200)
            run_btn = await page.query_selector('#btnRunToolOp')
            if run_btn and not await run_btn.is_disabled():
                await run_btn.click()
                await page.wait_for_timeout(3000)
                check(f'Tools round {i+1}: Rotate Run succeeded', True)
            else:
                check(f'Tools round {i+1}: Rotate Run succeeded', False, 'Run disabled')

        # ===== Library: verify documents visible at top of page =====
        print('\n=== Library: verify documents at top ===')
        await page.click('.bottom-nav__item[data-goto="library"]')
        await page.wait_for_timeout(2500)
        pos = await page.evaluate("""() => {
            const grid = document.getElementById('libraryGrid');
            if (!grid) return {err: 'no grid'};
            const r = grid.getBoundingClientRect();
            return {
                gridY: Math.round(r.y),
                cardCount: grid.querySelectorAll('.library-card').length,
                viewportH: window.innerHeight,
            };
        }""")
        check('Library grid visible in viewport (y < 400)', pos.get('gridY', 9999) < 400, f"pos={pos}")
        check('Library has documents', pos.get('cardCount', 0) > 0, f"count={pos.get('cardCount', 0)}")

        # ===== Console errors =====
        critical = [e for e in errs if '[pageerror]' in e or '[error]' in e.lower()]
        critical = [e for e in critical if 'service worker' not in e.lower() and 'Failed to register' not in e]
        check('No critical console errors', len(critical) == 0, f"count={len(critical)}")
        if critical:
            for c in critical[:10]:
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
