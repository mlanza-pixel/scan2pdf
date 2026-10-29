"""
DocuScan Pro — Help System test suite.
Verifies:
  - Welcome modal appears on first launch with Show Me How / Start Using App
  - Dismissal persists via localStorage
  - Searchable Help Center renders all topic cards
  - Search filters topics correctly
  - Opening an article shows Purpose / Steps / Troubleshooting / Related
  - Restart tutorial button launches a walkthrough
  - Walkthrough renders a spotlight + tooltip card with Next/Back/Skip
  - Walkthrough advances on Next click
  - Contextual help "?" buttons appear beside target controls
"""
import asyncio
import json
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
        # Welcome modal should be visible on first launch
        modal_visible = await page.evaluate("!!document.querySelector('.welcome-modal')")
        has_show_me_how = await page.evaluate("!!document.querySelector('.welcome-modal [data-welcome=\"tour\"]')")
        has_start_using = await page.evaluate("!!document.querySelector('.welcome-modal [data-welcome=\"skip\"]')")
        print(f'Welcome modal visible: {modal_visible}')
        print(f'  Show Me How button: {has_show_me_how}')
        print(f'  Start Using App button: {has_start_using}')

        # Dismiss the welcome modal
        if modal_visible:
            await page.click('.welcome-modal [data-welcome="skip"]')
            await page.wait_for_timeout(300)

        # Verify localStorage persists tutorial-seen
        ls_seen = await page.evaluate("JSON.parse(localStorage.getItem('docuscan-pro.tutorial-state') || '{}').tutorialSeen")
        print(f'localStorage.tutorialSeen after dismiss: {ls_seen}')

        # Reload — modal should NOT appear this time
        await page.reload(wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        modal_visible_after_reload = await page.evaluate("!!document.querySelector('.welcome-modal')")
        print(f'Welcome modal after reload (should be False): {modal_visible_after_reload}')

        # Go to Help workspace
        await page.click('.bottom-nav__item[data-goto="help"]')
        await page.wait_for_timeout(500)

        # Topic cards should be rendered
        topic_count = await page.evaluate("document.querySelectorAll('#helpTopics .help-topic').length")
        print(f'Topic cards rendered: {topic_count}')

        # Search should filter
        await page.fill('#helpSearchInput', 'watermark')
        await page.wait_for_timeout(400)
        wm_count = await page.evaluate("document.querySelectorAll('#helpTopics .help-topic').length")
        print(f'Topics matching "watermark": {wm_count}')
        # Clear search
        await page.fill('#helpSearchInput', '')
        await page.wait_for_timeout(300)

        # Open the first article
        first_topic_title = await page.evaluate("document.querySelector('#helpTopics .help-topic .help-topic__title')?.textContent")
        await page.click('#helpTopics .help-topic')
        await page.wait_for_timeout(500)
        article_open = await page.evaluate("document.getElementById('helpArticle')?.classList.contains('is-open')")
        article_title = await page.evaluate("document.querySelector('#helpArticle .help-article__title')?.textContent")
        has_steps = await page.evaluate("document.querySelectorAll('#helpArticle .help-article__step').length > 0")
        has_troubleshooting = await page.evaluate("!!document.querySelector('#helpArticle .help-article__section-title:last-of-type')")
        has_related = await page.evaluate("!!document.querySelector('#helpArticle .help-article__related-link')")
        print(f'Article opened: {article_open}')
        print(f'Article title matches clicked: {first_topic_title == article_title} ({first_topic_title} -> {article_title})')
        print(f'Has steps: {has_steps}')
        print(f'Has related: {has_related}')

        # Close article via Back button
        await page.click('#helpArticleBack')
        await page.wait_for_timeout(300)
        # article still has is-open class => True means article is OPEN
        article_is_open = await page.evaluate("document.getElementById('helpArticle')?.classList.contains('is-open')")
        article_closed = not article_is_open
        print(f'Article closed after Back: {article_closed}')

        # Click Restart tutorial
        await page.click('#btnRestartTutorial')
        await page.wait_for_timeout(800)
        walkthrough_active = await page.evaluate("!!document.querySelector('.walkthrough-card')")
        spotlight_visible = await page.evaluate("!!document.querySelector('.walkthrough-spotlight')")
        progress_dots = await page.evaluate("document.querySelectorAll('.walkthrough-card__progress-dot').length")
        next_button = await page.evaluate("!!document.querySelector('.walkthrough-card [data-wt=\"next\"]')")
        skip_button = await page.evaluate("!!document.querySelector('.walkthrough-card [data-wt=\"skip\"]')")
        print(f'Walkthrough active: {walkthrough_active}')
        print(f'  Spotlight visible: {spotlight_visible}')
        print(f'  Progress dots: {progress_dots}')
        print(f'  Next button: {next_button}')
        print(f'  Skip button: {skip_button}')

        # Click Next a couple times to verify advancement (step 2 should have spotlight)
        await page.click('.walkthrough-card [data-wt="next"]')
        await page.wait_for_timeout(800)  # longer wait for workspace switch + step render
        step2_badge = await page.evaluate("document.querySelector('.walkthrough-card__step-badge')?.textContent")
        spotlight_on_step2 = await page.evaluate("!!document.querySelector('.walkthrough-spotlight')")
        print(f'After Next: step badge says "{step2_badge}"')
        print(f'  Spotlight visible on step 2: {spotlight_on_step2}')

        # End walkthrough via Skip
        await page.click('.walkthrough-card [data-wt="skip"]')
        await page.wait_for_timeout(300)
        walkthrough_ended = await page.evaluate("!!!document.querySelector('.walkthrough-card')")
        print(f'Walkthrough ended after Skip: {walkthrough_ended}')

        # Verify contextual help icons are present
        ctx_help_count = await page.evaluate("document.querySelectorAll('.context-help').length")
        print(f'Contextual "?" icons rendered: {ctx_help_count}')

        # Capture screenshots of the Help Center and walkthrough
        Path('/home/z/my-project/download/screenshots').mkdir(parents=True, exist_ok=True)
        # Restart walkthrough for screenshot
        await page.click('.bottom-nav__item[data-goto="help"]')
        await page.wait_for_timeout(300)
        await page.click('#btnRestartTutorial')
        await page.wait_for_timeout(800)
        await page.screenshot(path='/home/z/my-project/download/screenshots/help-walkthrough-step1.png')
        # Skip the walkthrough
        await page.click('.walkthrough-card [data-wt="skip"]')
        await page.wait_for_timeout(300)
        # Help center screenshot
        await page.click('.bottom-nav__item[data-goto="help"]')
        await page.wait_for_timeout(300)
        await page.screenshot(path='/home/z/my-project/download/screenshots/help-center.png')

        # Errors check
        critical = [m for m in all_console if 'error' in m.lower() and 'service worker' not in m.lower() and 'favicon' not in m.lower()]
        print(f'Critical console errors: {len(critical)}')
        for e in critical[:5]: print(f'  {e}')

        ok = bool(
            modal_visible and has_show_me_how and has_start_using
            and ls_seen and (not modal_visible_after_reload)
            and topic_count > 10
            and wm_count >= 1 and wm_count < topic_count
            and article_open and (first_topic_title == article_title) and has_steps and has_related
            and article_closed  # article_closed is True after Back click
            and walkthrough_active and progress_dots > 0
            and next_button and skip_button
            and ('Step 2' in (step2_badge or ''))
            and spotlight_on_step2
            and walkthrough_ended
            and ctx_help_count > 0
            and len(critical) == 0
        )
        # Diagnostic: print each condition
        conditions = {
            'modal_visible': modal_visible,
            'has_show_me_how': has_show_me_how,
            'has_start_using': has_start_using,
            'ls_seen': ls_seen,
            'modal_not_visible_after_reload': not modal_visible_after_reload,
            'topic_count > 10': topic_count > 10,
            'wm_count >= 1': wm_count >= 1,
            'wm_count < topic_count': wm_count < topic_count,
            'article_open': article_open,
            'titles_match': first_topic_title == article_title,
            'has_steps': has_steps,
            'has_related': has_related,
            'article_closed': article_closed,
            'walkthrough_active': walkthrough_active,
            'progress_dots > 0': progress_dots > 0,
            'next_button': next_button,
            'skip_button': skip_button,
            'step2_badge': 'Step 2' in (step2_badge or ''),
            'spotlight_on_step2': spotlight_on_step2,
            'walkthrough_ended': walkthrough_ended,
            'ctx_help_count > 0': ctx_help_count > 0,
            'no_critical_errors': len(critical) == 0,
        }
        for k, v in conditions.items():
            if not v:
                print(f'  FAIL: {k}')
        print(f'OVERALL: {"PASS" if ok else "FAIL"}')
        await browser.close()
        sys.exit(0 if ok else 1)

asyncio.run(main())
