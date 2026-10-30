"""
Visual error detection test — captures screenshots of every workspace,
loads PDFs/images where needed, and uses the vision model to identify
exact visual issues with buttons, layout, annotate, folders, etc.
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SAMPLE_PDF = '/home/z/my-project/assets/samples/test-contract.pdf'
SAMPLE_IMG = '/home/z/my-project/assets/samples/sample-page-1.jpg'
OUT = Path('/home/z/my-project/download/screenshots')

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(f"PAGE_ERROR: {e}"))
        page.on('console', lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == 'error' and 'service worker' not in m.text.lower() else None)

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        try:
            await page.click('#splashAccept', timeout=2000)
            await page.wait_for_timeout(200)
            await page.click('#splashStart', timeout=2000)
            await page.wait_for_timeout(500)
        except: pass

        # 1. Home
        await page.screenshot(path=str(OUT / 'visual-home.png'))
        print("1. Home captured")

        # 2. Studio (empty)
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'visual-studio-empty.png'))
        print("2. Studio (empty) captured")

        # 3. Studio (with image loaded)
        await page.set_input_files('#imagesInput', SAMPLE_IMG)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(OUT / 'visual-studio-loaded.png'))
        print("3. Studio (loaded) captured")

        # 4. Studio export buttons — check colors
        btn_colors = await page.evaluate(r"""() => {
            const btns = ['btnStudioSave', 'btnStudioDownload', 'btnStudioShare', 'btnStudioPrint', 'btnCreatePdf'];
            return btns.map(id => {
                const b = document.getElementById(id);
                if (!b) return {id, exists: false};
                const s = getComputedStyle(b);
                return {id, exists: true, bg: s.backgroundColor, color: s.color, disabled: b.disabled, text: b.textContent.trim()};
            });
        }""")
        print(f"4. Studio button colors:")
        for b in btn_colors:
            print(f"   {b['id']}: bg={b.get('bg')} color={b.get('color')} disabled={b.get('disabled')} text='{b.get('text','')}'")

        # 5. Sign (with PDF loaded)
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#signPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)
        await page.screenshot(path=str(OUT / 'visual-sign-loaded.png'))
        print("5. Sign (loaded) captured")

        # 6. Sign editing buttons — check colors
        sign_colors = await page.evaluate(r"""() => {
            const btns = ['btnAddSignature', 'btnAddText', 'btnAddDate', 'btnAddStamp', 'btnAddHighlight',
                          'btnUndo', 'btnRedo', 'btnRemoveSelected', 'btnInsertWatermark', 'btnRemoveWatermark',
                          'btnSaveToLibrary', 'btnDownloadPdf', 'btnSharePdf', 'btnPrintPdf'];
            return btns.map(id => {
                const b = document.getElementById(id);
                if (!b) return {id, exists: false};
                const s = getComputedStyle(b);
                return {id, exists: true, bg: s.backgroundColor, color: s.color, disabled: b.disabled};
            });
        }""")
        print(f"6. Sign button colors:")
        for b in sign_colors:
            print(f"   {b['id']}: bg={b.get('bg')} color={b.get('color')} disabled={b.get('disabled')} exists={b.get('exists')}")

        # 7. PDF Tools (with PDF loaded)
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#toolsPdfInput', SAMPLE_PDF)
        await page.wait_for_timeout(3000)
        await page.screenshot(path=str(OUT / 'visual-tools-loaded.png'))
        print("7. PDF Tools (loaded) captured")

        # 8. PDF Tools — Annotate → Draw
        await page.click('.tools-tab[data-tab="annotate"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'visual-tools-annotate-text.png'))
        print("8. Annotate (Text) captured")

        await page.click('.tools-tab[data-subtab="draw"]')
        await page.wait_for_timeout(2000)
        await page.screenshot(path=str(OUT / 'visual-tools-annotate-draw.png'))
        print("9. Annotate (Draw) captured")

        # Check if PDF canvas is visible under draw overlay
        draw_state = await page.evaluate(r"""() => {
            const pdf = document.getElementById('toolsCanvas');
            const draw = document.getElementById('toolsDrawCanvas');
            const stage = document.getElementById('toolsCanvasStage');
            return {
                pdfCanvas: pdf ? {w: pdf.width, h: pdf.height, hidden: pdf.hidden} : null,
                drawCanvas: draw ? {w: draw.width, h: draw.height, hidden: draw.hidden} : null,
                stage: stage ? {hidden: stage.hidden, display: stage.style.display} : null,
            };
        }""")
        print(f"10. Annotate Draw state: {draw_state}")

        # 11. Library
        await page.click('.bottom-nav__item[data-goto="library"]')
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(OUT / 'visual-library.png'))
        print("11. Library captured")

        # Check folder functionality
        folder_check = await page.evaluate(r"""() => {
            const folders = JSON.parse(localStorage.getItem('docuscan-pro.folders') || '[]');
            const folderEls = document.querySelectorAll('[data-folder-id]');
            const deleteBtns = document.querySelectorAll('[data-delete-folder]');
            const moveBtns = document.querySelectorAll('button');
            const moveCount = Array.from(moveBtns).filter(b => b.textContent === 'Move').length;
            return {
                foldersInStorage: folders.length,
                folderElements: folderEls.length,
                deleteButtons: deleteBtns.length,
                moveButtons: moveCount,
            };
        }""")
        print(f"12. Library folders: {folder_check}")

        # 12. Library card buttons
        card_btns = await page.evaluate(r"""() => {
            const cards = document.querySelectorAll('.library-card');
            if (cards.length === 0) return [];
            const firstCard = cards[0];
            const btns = firstCard.querySelectorAll('button');
            return Array.from(btns).map(b => ({text: b.textContent.trim(), disabled: b.disabled}));
        }""")
        print(f"13. Library card buttons: {card_btns}")

        # 14. Help
        await page.click('.bottom-nav__item[data-goto="help"]')
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(OUT / 'visual-help.png'))
        print("14. Help captured")

        # Print errors
        print(f"\n=== ERRORS ({len(errors)}) ===")
        for e in errors:
            print(f"  {e}")

        await browser.close()

asyncio.run(main())
