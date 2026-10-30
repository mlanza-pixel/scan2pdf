"""
DocuScan Pro — Help System test suite (v5.1.1).
Verifies the new splash page with Terms & Conditions, Help Center,
search, articles, walkthroughs, and per-page Tour buttons.
"""
import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        all_console = []
        page.on('console', lambda m: all_console.append(f"[{m.type}] {m.text}"))
        page.on('pageerror', lambda e: all_console.append(f"[pageerror] {e}"))

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(800)

        # ---- Splash page with Terms & Conditions ----
        splash_visible = await page.evaluate("!!document.querySelector('.splash')")
        has_terms = await page.evaluate("!!document.querySelector('.splash__terms')")
        has_checkbox = await page.evaluate("!!document.querySelector('#splashAccept')")
        has_start_btn = await page.evaluate("!!document.querySelector('#splashStart')")
        # Start should be DISABLED until checkbox is checked
        start_disabled_before = await page.evaluate("document.querySelector('#splashStart')?.disabled")
        print(f'Splash visible: {splash_visible}')
        print(f'  Has Terms text: {has_terms}')
        print(f'  Has Accept checkbox: {has_checkbox}')
        print(f'  Has Start button: {has_start_btn}')
        print(f'  Start disabled before accept: {start_disabled_before}')

        # Accept the terms
        if splash_visible:
            await page.click('#splashAccept')
            await page.wait_for_timeout(200)
            start_disabled_after = await page.evaluate("document.querySelector('#splashStart')?.disabled")
            print(f'  Start disabled after accept (should be False): {start_disabled_after}')
            await page.click('#splashStart')
            await page.wait_for_timeout(400)

        # Verify localStorage persists
        ls_accepted = await page.evaluate("JSON.parse(localStorage.getItem('docuscan-pro.tutorial-state') || '{}').termsAccepted")
        print(f'localStorage.termsAccepted: {ls_accepted}')

        # Reload — splash should NOT reappear
        await page.reload(wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        splash_after_reload = await page.evaluate("!!document.querySelector('.splash')")
        print(f'Splash after reload (should be False): {splash_after_reload}')

        # ---- Help Center ----
        await page.click('.bottom-nav__item[data-goto="help"]')
        await page.wait_for_timeout(500)
        topic_count = await page.evaluate("document.querySelectorAll('#helpTopics .help-topic').length")
        print(f'Topic cards rendered: {topic_count}')

        # Search
        await page.fill('#helpSearchInput', 'watermark')
        await page.wait_for_timeout(400)
        wm_count = await page.evaluate("document.querySelectorAll('#helpTopics .help-topic').length")
        print(f'Topics matching "watermark": {wm_count}')
        await page.fill('#helpSearchInput', '')
        await page.wait_for_timeout(300)

        # Open first article
        first_topic_title = await page.evaluate("document.querySelector('#helpTopics .help-topic .help-topic__title')?.textContent")
        await page.click('#helpTopics .help-topic')
        await page.wait_for_timeout(500)
        article_open = await page.evaluate("document.getElementById('helpArticle')?.classList.contains('is-open')")
        article_title = await page.evaluate("document.querySelector('#helpArticle .help-article__title')?.textContent")
        has_steps = await page.evaluate("document.querySelectorAll('#helpArticle .help-article__step').length > 0")
        has_related = await page.evaluate("!!document.querySelector('#helpArticle .help-article__related-link')")
        print(f'Article opened: {article_open}')
        print(f'Title matches: {first_topic_title == article_title}')
        print(f'Has steps: {has_steps}')
        print(f'Has related: {has_related}')

        # Close via Back
        await page.click('#helpArticleBack')
        await page.wait_for_timeout(300)
        article_is_open = await page.evaluate("document.getElementById('helpArticle')?.classList.contains('is-open')")
        article_closed = not article_is_open
        print(f'Article closed after Back: {article_closed}')

        # ---- Restart tutorial button (Home walkthrough) ----
        await page.click('#btnRestartTutorial')
        await page.wait_for_timeout(800)
        walkthrough_active = await page.evaluate("!!document.querySelector('.walkthrough-card')")
        progress_dots = await page.evaluate("document.querySelectorAll('.walkthrough-card__progress-dot').length")
        next_button = await page.evaluate("!!document.querySelector('.walkthrough-card [data-wt=\"next\"]')")
        skip_button = await page.evaluate("!!document.querySelector('.walkthrough-card [data-wt=\"skip\"]')")
        print(f'Walkthrough active: {walkthrough_active}')
        print(f'  Progress dots: {progress_dots}')
        print(f'  Next button: {next_button}')
        print(f'  Skip button: {skip_button}')

        # Click Next to advance to step 2 (which should have a spotlight)
        await page.click('.walkthrough-card [data-wt="next"]')
        await page.wait_for_timeout(1000)
        step2_badge = await page.evaluate("document.querySelector('.walkthrough-card__step-badge')?.textContent")
        spotlight_on_step2 = await page.evaluate("!!document.querySelector('.walkthrough-spotlight')")
        print(f'After Next: "{step2_badge}"')
        print(f'  Spotlight on step 2: {spotlight_on_step2}')

        # Skip to end
        await page.click('.walkthrough-card [data-wt="skip"]')
        await page.wait_for_timeout(300)
        walkthrough_ended = await page.evaluate("!!!document.querySelector('.walkthrough-card')")
        print(f'Walkthrough ended after Skip: {walkthrough_ended}')

        # ---- Per-page Tour buttons ----
        tour_btn_count = await page.evaluate("document.querySelectorAll('.page-tour-btn').length")
        print(f'Per-page Tour buttons rendered: {tour_btn_count}')

        # Verify each workspace has a Tour button
        tour_ids = await page.evaluate("Array.from(document.querySelectorAll('.page-tour-btn')).map(b => b.dataset.tour)")
        print(f'Tour button IDs: {tour_ids}')

        # Studio tour button — click it and verify a walkthrough starts
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(300)
        await page.click('.page-tour-btn[data-tour="studio"]')
        await page.wait_for_timeout(800)
        studio_tour_active = await page.evaluate("!!document.querySelector('.walkthrough-card')")
        studio_tour_badge = await page.evaluate("document.querySelector('.walkthrough-card__step-badge')?.textContent")
        print(f'Studio tour active: {studio_tour_active}')
        print(f'  Badge: {studio_tour_badge}')

        # Skip
        await page.click('.walkthrough-card [data-wt="skip"]')
        await page.wait_for_timeout(300)

        # ---- Contextual "?" icons should be GONE (removed per user request) ----
        ctx_help_count = await page.evaluate("document.querySelectorAll('.context-help').length")
        print(f'Contextual "?" icons (should be 0): {ctx_help_count}')

        # ---- Screenshots ----
        Path('/home/z/my-project/download/screenshots').mkdir(parents=True, exist_ok=True)
        await page.click('.bottom-nav__item[data-goto="help"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path='/home/z/my-project/download/screenshots/help-center.png')

        # Errors check
        critical = [m for m in all_console if 'error' in m.lower() and 'service worker' not in m.lower() and 'favicon' not in m.lower()]
        print(f'Critical console errors: {len(critical)}')
        for e in critical[:3]: print(f'  {e}')

        # ---- Final pass/fail ----
        ok = bool(
            splash_visible and has_terms and has_checkbox and has_start_btn
            and start_disabled_before  # must be disabled until checkbox
            and (not start_disabled_after)  # enabled after checkbox
            and ls_accepted and (not splash_after_reload)
            and topic_count >= 15
            and wm_count >= 1 and wm_count < topic_count
            and article_open and (first_topic_title == article_title) and has_steps and has_related
            and article_closed
            and walkthrough_active and progress_dots > 0 and next_button and skip_button
            and ('Step 2' in (step2_badge or '')) and spotlight_on_step2
            and walkthrough_ended
            and tour_btn_count >= 5  # one per workspace (5 workspaces have it)
            and studio_tour_active
            and ctx_help_count == 0  # contextual icons removed per user request
            and len(critical) == 0
        )
        print(f'OVERALL: {"PASS" if ok else "FAIL"}')
        await browser.close()
        sys.exit(0 if ok else 1)

asyncio.run(main())
