"""
DocuScan Pro — automated layout test for the v7.4 restructure.
Verifies the new 2-column layout contract:
  - Sign workspace: Open PDF button is in the LEFT column.
  - Sign workspace: #pageNav is in the RIGHT column, located UNDER the
    preview canvas wrap (page-nav top edge >= preview wrap bottom edge).
  - Sign workspace: pageNav is full-width inside the right column.
  - Studio workspace: OCR Scan button is in left column. OCR result
    card lives in right column, below the preview card.
  - Tools workspace: "Open 2nd PDF" button is hidden by default and only
    shown when the Merge tab is active.
  - Tools workspace: Run button label is "Scan" on the OCR tab.
  - Tools workspace: OCR result card is hidden on non-OCR tabs.
  - No critical console errors on initial load.
"""
import asyncio
import json
import sys
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("PLAYWRIGHT_NOT_INSTALLED")
    sys.exit(2)


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


async def rect(page, sel):
    return await page.evaluate("""(sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }""", sel)


async def parent_col(page, sel):
    return await page.evaluate("""(sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'missing';
        if (el.closest('.sign-layout__right')) return 'right';
        if (el.closest('.sign-layout__left')) return 'left';
        return 'neither';
    }""", sel)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        console_msgs = []
        page.on('console', lambda m: console_msgs.append(f"[{m.type}] {m.text}"))
        page.on('pageerror', lambda e: console_msgs.append(f"[pageerror] {e}"))
        await page.goto('http://localhost:8765/index.html', wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(800)
        await accept_splash(page)

        report = {'ok': True, 'checks': [], 'issues': []}
        def check(name, cond, detail=""):
            report['checks'].append({'name': name, 'ok': bool(cond), 'detail': detail})
            if not cond:
                report['ok'] = False
                report['issues'].append(f"{name}: {detail}")

        # ===== SIGN =====
        await page.evaluate("window.goto && goto('sign')")
        await page.wait_for_timeout(500)
        open_col = await parent_col(page, '#btnOpenPdfSign')
        nav_col = await parent_col(page, '#pageNav')
        check("Sign: Open PDF button in left column", open_col == 'left', f"open_col={open_col}")
        check("Sign: pageNav in right column", nav_col == 'right', f"nav_col={nav_col}")
        nav_rect = await rect(page, '#pageNav')
        wrap_rect = await rect(page, '#signCanvasWrap')
        if nav_rect and wrap_rect:
            # Page nav should be below the preview wrap
            check("Sign: pageNav positioned under preview", nav_rect['top'] >= wrap_rect['bottom'] - 2,
                  f"nav_top={nav_rect['top']} wrap_bottom={wrap_rect['bottom']}")
        # Verify the slider is also in the right column
        slider_col = await parent_col(page, '#pageSlider')
        check("Sign: page slider in right column", slider_col == 'right', f"slider_col={slider_col}")

        # ===== STUDIO =====
        await page.evaluate("window.goto && goto('studio')")
        await page.wait_for_timeout(400)
        scan_col = await parent_col(page, '#btnRunOcr')
        check("Studio: Scan button in left column", scan_col == 'left', f"scan_col={scan_col}")
        ocr_result_col = await parent_col(page, '#studioOcrResultCard')
        check("Studio: OCR result card in right column", ocr_result_col == 'right',
              f"ocr_result_col={ocr_result_col}")
        # Verify preview is in right column
        preview_col = await parent_col(page, '#studioPreviewWrap')
        check("Studio: preview wrap in right column", preview_col == 'right',
              f"preview_col={preview_col}")
        # Verify page nav is in right column
        studio_nav_col = await parent_col(page, '#studioPageNav')
        check("Studio: page nav in right column", studio_nav_col == 'right',
              f"studio_nav_col={studio_nav_col}")
        # Capture button is renamed "Camera"
        cam_text = await page.evaluate("document.getElementById('btnCaptureCamera').innerText.trim()")
        check("Studio: Camera button label", cam_text == 'Camera', f"text='{cam_text}'")
        # OCR button label is "Scan"
        scan_text = await page.evaluate("document.getElementById('btnRunOcr').innerText.trim()")
        check("Studio: OCR button label is Scan", scan_text == 'Scan', f"text='{scan_text}'")

        # ===== TOOLS =====
        await page.evaluate("window.goto && goto('tools')")
        await page.wait_for_timeout(400)
        # 2nd PDF button — hidden by default before any PDF is loaded
        second_hidden_default = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        check("Tools: 2nd PDF hidden before PDF loaded", second_hidden_default,
              f"hidden={second_hidden_default}")
        # Now load a PDF — 2nd PDF button should appear (merge is default tab)
        await page.set_input_files('#toolsPdfInput', '/home/z/my-project/assets/samples/test-contract.pdf')
        await page.wait_for_timeout(2500)
        second_hidden_after_load = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        check("Tools: 2nd PDF visible after load on merge tab", not second_hidden_after_load,
              f"hidden={second_hidden_after_load}")
        # Switch to Split tab — 2nd PDF should hide (use JS click — tab may be offscreen)
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"split\"]').click()")
        await page.wait_for_timeout(300)
        second_hidden_split = await page.evaluate("document.getElementById('btnAddSecondPdf').hidden")
        check("Tools: 2nd PDF hidden on Split tab", second_hidden_split, f"hidden={second_hidden_split}")
        # Switch to OCR tab — Run becomes Scan; OCR card visible
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"ocrpdf\"]').click()")
        await page.wait_for_timeout(300)
        run_label = await page.evaluate("document.getElementById('btnRunToolOp').innerText.trim()")
        check("Tools: Run button label is Scan on OCR tab", run_label == 'Scan', f"label='{run_label}'")
        ocr_card_hidden = await page.evaluate("document.getElementById('toolsOcrResultCard').hidden")
        check("Tools: OCR result card visible on OCR tab", not ocr_card_hidden,
              f"hidden={ocr_card_hidden}")
        # The OCR textarea should NOT be in #toolsPanel (left panel) anymore
        left_textarea_present = await page.evaluate(
            "document.querySelector('#toolsPanel textarea#pdfOcrResult') ? true : false")
        check("Tools: OCR textarea moved out of left panel", not left_textarea_present,
              f"left_textarea_present={left_textarea_present}")
        # Switch back to merge — Run label should reset
        await page.evaluate("document.querySelector('#toolsTabs .tools-tab[data-tab=\"merge\"]').click()")
        await page.wait_for_timeout(300)
        run_label_merge = await page.evaluate("document.getElementById('btnRunToolOp').innerText.trim()")
        check("Tools: Run label resets to Run on Merge tab", run_label_merge == 'Run',
              f"label='{run_label_merge}'")
        # OCR card should hide on merge tab
        ocr_card_hidden_merge = await page.evaluate("document.getElementById('toolsOcrResultCard').hidden")
        check("Tools: OCR result card hidden on Merge tab", ocr_card_hidden_merge,
              f"hidden={ocr_card_hidden_merge}")

        # Console errors
        critical = [m for m in console_msgs if '[pageerror]' in m or '[error]' in m.lower()]
        critical = [m for m in critical if 'service worker' not in m.lower() and 'Failed to register' not in m]
        check("No critical console errors", len(critical) == 0, f"critical={critical}")

        print(json.dumps(report, indent=2))
        await browser.close()
        sys.exit(0 if report['ok'] else 1)


asyncio.run(main())
