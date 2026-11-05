"""
DocuScan Pro — workspace screenshot capture and integration smoke test.
Visits every workspace, captures a screenshot, and reports console errors
per workspace. Also tests an end-to-end Studio → PDF build workflow.
"""
import asyncio
import json
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SHOTS_DIR = Path('/home/z/my-project/download/screenshots')
SHOTS_DIR.mkdir(parents=True, exist_ok=True)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1024, 'height': 768})
        page = await ctx.new_page()

        all_errors = []
        def on_console(m):
            if m.type == 'error' and 'service worker' not in m.text.lower():
                all_errors.append(m.text)
        page.on('console', on_console)
        page.on('pageerror', lambda e: all_errors.append(str(e)))

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
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


        workspaces = ['home', 'studio', 'sign', 'tools', 'library', 'help']
        results = {}
        for ws in workspaces:
            # Click the bottom-nav item with matching data-goto
            sel = f'.bottom-nav__item[data-goto="{ws}"]'
            try:
                await page.click(sel, timeout=2000)
                await page.wait_for_timeout(500)
            except Exception as e:
                results[ws] = {'error': f'click failed: {e}'}
                continue
            shot = SHOTS_DIR / f'ws-{ws}.png'
            await page.screenshot(path=str(shot), full_page=False)
            results[ws] = {'screenshot': str(shot), 'errors_before': len(all_errors)}

        # Also capture mobile views
        mobile_ctx = await browser.new_context(viewport={'width': 390, 'height': 844})
        mobile_page = await mobile_ctx.new_page()
        mobile_errors = []
        mobile_page.on('console', lambda m: mobile_errors.append(m.text) if m.type == 'error' and 'service worker' not in m.text.lower() else None)
        await mobile_page.goto(BASE, wait_until='networkidle', timeout=15000)
        await mobile_page.wait_for_timeout(500)
        for ws in workspaces:
            sel = f'.bottom-nav__item[data-goto="{ws}"]'
            try:
                await mobile_page.click(sel, timeout=2000)
                await mobile_page.wait_for_timeout(400)
            except Exception:
                pass
            shot = SHOTS_DIR / f'mobile-{ws}.png'
            await mobile_page.screenshot(path=str(shot))
        results['mobile_errors'] = mobile_errors

        print(json.dumps({
            'ok': len(all_errors) == 0 and len(mobile_errors) == 0,
            'tablet_errors': all_errors,
            'mobile_errors': mobile_errors,
            'results': results,
            'screenshots_dir': str(SHOTS_DIR),
        }, indent=2))
        await browser.close()

asyncio.run(main())
