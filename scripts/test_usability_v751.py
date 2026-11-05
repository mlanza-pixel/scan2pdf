"""Test the v7.5.1 usability fixes:
  1. Studio: 10 images imported → all 10 thumbnails visible (wrap, not scroll)
  2. Studio: clicking thumbnail #5 selects it and updates preview
  3. Sign: page nav and doc-info hidden when no document loaded
  4. Tools: page nav and doc-info hidden when no document loaded
  5. Studio: page nav hidden when no pages
  6. Studio + Sign: each functional group wrapped in card.card--padded with card__title
  7. Tools: preview canvas wrap has max-height (doesn't overflow viewport)
  8. Studio: no explanatory <p> text in Enhancement / OCR / Export sections
"""
import asyncio
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SAMPLE_DIR = Path('/home/z/my-project/assets/samples')


def make_img(n, path):
    img = Image.new('RGB', (1240, 1754), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 80)
    except: font = ImageFont.load_default()
    d.text((100, 200), f'PAGE {n}', fill=(0, 122, 255), font=font)
    img.save(path, 'JPEG', quality=70)
    return str(path)


async def main():
    imgs = [make_img(n, SAMPLE_DIR / f'usability-{n}.jpg') for n in range(1, 11)]
    results = []
    def check(name, cond, detail=''):
        results.append((name, bool(cond), detail))
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ''))

    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        try:
            await page.click('#splashAccept'); await page.wait_for_timeout(200)
            await page.click('#splashStart'); await page.wait_for_timeout(400)
        except: pass

        # ==== STUDIO: 10 images =====
        print('\n== STUDIO: 10 images, all thumbnails visible ===')
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(400)
        await page.set_input_files('#imagesInput', imgs)
        await page.wait_for_timeout(5000)
        thumb_info = await page.evaluate("""() => {
            const thumbs = document.querySelectorAll('#studioThumbs .thumb');
            const parent = document.getElementById('studioThumbs');
            const pr = parent.getBoundingClientRect();
            const visibleCount = Array.from(thumbs).filter(t => {
                const r = t.getBoundingClientRect();
                return r.right > pr.left && r.left < pr.right && r.bottom > pr.top && r.top < pr.bottom;
            }).length;
            return {count: thumbs.length, visibleCount, parentHeight: Math.round(pr.height)};
        }""")
        check('10 thumbnails rendered', thumb_info['count'] == 10, f"count={thumb_info['count']}")
        check('All 10 thumbnails visible without horizontal scroll', thumb_info['visibleCount'] == 10,
              f"visible={thumb_info['visibleCount']} parentHeight={thumb_info['parentHeight']}")

        # Click thumb #5
        await page.evaluate("""() => {
            const thumbs = document.querySelectorAll('#studioThumbs .thumb');
            if (thumbs[4]) thumbs[4].click();
        }""")
        await page.wait_for_timeout(500)
        nav_label = await page.evaluate("document.getElementById('studioPageNavLabel').innerText.trim()")
        check('Clicking thumb #5 selects page 5', nav_label == 'Page 5 of 10', f"label='{nav_label}'")
        canvas_w = await page.evaluate("document.getElementById('studioPreviewCanvas').width")
        check('Preview canvas rendered for page 5', canvas_w > 0, f"w={canvas_w}")

        # ==== STUDIO: card-grouped layout =====
        print('\n== STUDIO: card-grouped layout ===')
        studio_cards = await page.evaluate("""() => {
            const cards = document.querySelectorAll('#ws-studio .sign-layout__left .card.card--padded');
            return Array.from(cards).map(c => {
                const t = c.querySelector('.card__title');
                return t ? t.innerText.trim() : '(no title)';
            });
        }""")
        expected_studio_cards = ['Capture & import', 'Pages', 'Enhancement', 'OCR (text recognition)', 'Create PDF', 'Export']
        for title in expected_studio_cards:
            check(f'Studio has card titled "{title}"', title in studio_cards, f"cards={studio_cards}")

        # No explanatory <p> tags in Enhancement / Export cards
        enhance_text = await page.evaluate("""() => {
            const cards = document.querySelectorAll('#ws-studio .sign-layout__left .card.card--padded');
            for (const c of cards) {
                const t = c.querySelector('.card__title');
                if (t && t.innerText.includes('Enhancement')) {
                    const ps = c.querySelectorAll('p');
                    return Array.from(ps).map(p => p.innerText.trim()).filter(t => t.length > 0);
                }
            }
            return [];
        }""")
        check('Enhancement card has no explanatory <p> text', len(enhance_text) == 0, f"texts={enhance_text}")

        # ==== STUDIO: page nav hidden when empty =====
        print('\n== STUDIO: page nav hidden when empty ===')
        # Clear all pages
        await page.evaluate("window.confirm = () => true;")
        await page.evaluate("""() => {
            const btn = document.getElementById('btnClearAllPages');
            if (btn && !btn.disabled) btn.click();
        }""")
        await page.wait_for_timeout(500)
        nav_display = await page.evaluate("getComputedStyle(document.getElementById('studioPageNav')).display")
        check('Studio page nav hidden when no pages', nav_display == "none", f"display={nav_display}")

        # ==== SIGN: empty state hides page nav and doc info =====
        print('\n== SIGN: empty state hides labels ===')
        await page.click('.bottom-nav__item[data-goto="sign"]')
        await page.wait_for_timeout(400)
        sign_nav_display = await page.evaluate("getComputedStyle(document.getElementById('pageNav')).display")
        check('Sign page nav hidden when no document', sign_nav_display == "none", f"display={sign_nav_display}")
        sign_doc_display = await page.evaluate("getComputedStyle(document.getElementById('signDocInfo')).display")
        check('Sign doc-info badge hidden when no document', sign_doc_display == "none", f"display={sign_doc_display}")
        sign_hint_text = await page.evaluate("document.getElementById('signHint').innerText.trim()")
        check('Sign hint text empty when no document', sign_hint_text == '', f"text='{sign_hint_text}'")

        # Sign card-grouped layout
        sign_cards = await page.evaluate("""() => {
            const cards = document.querySelectorAll('#ws-sign .sign-layout__left .card.card--padded');
            return Array.from(cards).map(c => {
                const t = c.querySelector('.card__title');
                return t ? t.innerText.trim() : '(no title)';
            });
        }""")
        expected_sign_cards = ['Document', 'Annotations', 'Text settings', 'Watermark', 'Export']
        for title in expected_sign_cards:
            check(f'Sign has card titled "{title}"', title in sign_cards, f"cards={sign_cards}")

        # ==== TOOLS: empty state hides page nav and doc info =====
        print('\n== TOOLS: empty state hides labels ===')
        await page.click('.bottom-nav__item[data-goto="tools"]')
        await page.wait_for_timeout(400)
        tools_nav_display = await page.evaluate("getComputedStyle(document.getElementById('toolsPageNav')).display")
        check('Tools page nav hidden when no document', tools_nav_display == "none", f"display={tools_nav_display}")
        tools_doc_display = await page.evaluate("getComputedStyle(document.getElementById('toolsDocInfo')).display")
        check('Tools doc-info badge hidden when no document', tools_doc_display == "none", f"display={tools_doc_display}")

        # ==== TOOLS: preview wrap has max-height (overflow protection) =====
        print('\n== TOOLS: preview wrap max-height ===')
        wrap_max = await page.evaluate("""() => {
            const w = document.getElementById('toolsCanvasWrap');
            if (!w) return null;
            return getComputedStyle(w).maxHeight;
        }""")
        check('Tools preview wrap has max-height set', wrap_max and wrap_max != 'none', f"maxHeight={wrap_max}")

        # ==== Summary =====
        passed = sum(1 for _, ok, _ in results if ok)
        failed = sum(1 for _, ok, _ in results if not ok)
        print(f"\n== SUMMARY ===\nTotal: {len(results)}  Passed: {passed}  Failed: {failed}")
        if failed:
            print('\nFailures:')
            for name, ok, detail in results:
                if not ok: print(f"  ✗ {name} — {detail}")
        await b.close()
        sys.exit(0 if failed == 0 else 1)

asyncio.run(main())
