"""
DocuScan Pro — automated smoke test for §8.2 alignment assertions.
Uses Playwright (Chromium) to verify:
  - Open PDF control and page navigation bar have equal width
  - Both have height = 48px
  - Their left edges align within 1px
  - Their right edges align within 1px
  - No critical console errors on initial load
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


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1024, 'height': 768})
        page = await ctx.new_page()
        console_msgs = []
        page.on('console', lambda m: console_msgs.append(f"[{m.type}] {m.text}"))
        page.on('pageerror', lambda e: console_msgs.append(f"[pageerror] {e}"))
        await page.goto('http://localhost:8765/index.html#sign', wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(800)
        # Accept the splash page Terms & Conditions (if present)
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

        # Navigate to Sign workspace
        await page.evaluate("window.goto && goto('sign')")
        await page.wait_for_timeout(500)

        results = await page.evaluate(r"""() => {
            function rect(sel) {
                const el = document.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
            }
            const open = rect('#btnOpenPdfSign');
            const nav = rect('#pageNav');
            const editButtons = Array.from(document.querySelectorAll('.edit-buttons .btn')).map(b => {
                const r = b.getBoundingClientRect(); return { w: r.width, h: r.height };
            });
            return {
                openRect: open,
                navRect: nav,
                editButtonCount: editButtons.length,
                editButtonHeights: editButtons.map(e => Math.round(e.h)),
                editButtonWidths: editButtons.map(e => Math.round(e.w)),
            };
        }""")

        report = {
            'ok': True,
            'checks': [],
            'issues': []
        }
        def check(name, cond, detail=""):
            report['checks'].append({'name': name, 'ok': bool(cond), 'detail': detail})
            if not cond:
                report['ok'] = False
                report['issues'].append(f"{name}: {detail}")

        if not results:
            print("PAGE_EVAL_FAILED")
            await browser.close()
            sys.exit(2)

        o, n = results.get('openRect'), results.get('navRect')
        if o and n:
            check("Open PDF present", o is not None, "")
            check("Page nav present", n is not None, "")
            check("Widths equal", abs(o['w'] - n['w']) <= 1, f"open={o['w']} nav={n['w']}")
            check("Heights equal", abs(o['h'] - n['h']) <= 1, f"open={o['h']} nav={n['h']}")
            check("Heights = 48px", abs(o['h'] - 48) <= 1 and abs(n['h'] - 48) <= 1, f"open={o['h']} nav={n['h']}")
            check("Left edges align", abs(o['left'] - n['left']) <= 1, f"open={o['left']} nav={n['left']}")
            check("Right edges align", abs(o['right'] - n['right']) <= 1, f"open={o['right']} nav={n['right']}")
        else:
            report['ok'] = False
            report['issues'].append("Open PDF or page nav element not found")

        eb = results.get('editButtonCount', 0)
        check("At least 6 editing buttons present", eb >= 6, f"got {eb}")
        heights = results.get('editButtonHeights', [])
        if heights:
            check("All edit buttons equal height", len(set(heights)) <= 1, f"heights={heights}")
        widths = results.get('editButtonWidths', [])
        if widths:
            check("All edit buttons equal width", len(set(widths)) <= 1, f"widths={widths}")

        # Check console errors
        critical = [m for m in console_msgs if '[pageerror]' in m or '[error]' in m.lower()]
        # Allow some noise for missing service worker in file:// context
        critical = [m for m in critical if 'service worker' not in m.lower() and 'Failed to register' not in m]
        check("No critical console errors", len(critical) == 0, f"critical={critical}")

        print(json.dumps(report, indent=2))
        await browser.close()
        sys.exit(0 if report['ok'] else 1)

asyncio.run(main())
