"""
DocuScan Pro — end-to-end integration test.
1. Generate a sample page image (JPEG) with text on it.
2. Upload it into Studio via the file input.
3. Click "Create PDF".
4. Verify a document was saved to IndexedDB (read back through page.evaluate).
5. Open the Library workspace and confirm the document appears with a thumbnail.

This validates the critical workflow described in spec §17.3: image import →
PDF creation → save to library.
"""
import asyncio
import io
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
OUT_DIR = Path('/home/z/my-project/download/screenshots')
OUT_DIR.mkdir(parents=True, exist_ok=True)
SAMPLE_DIR = Path('/home/z/my-project/assets/samples')
SAMPLE_DIR.mkdir(parents=True, exist_ok=True)


def make_sample_image(text='Sample contract page 1', path=None):
    """Create a sample document image with text on it."""
    img = Image.new('RGB', (1240, 1754), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 48)
        title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 64)
    except Exception:
        font = ImageFont.load_default()
        title_font = font
    # Title
    draw.text((80, 80), 'DocuScan Pro Sample', fill=(0, 122, 255), font=title_font)
    # Body lines
    y = 200
    for line in [
        'This is an automatically generated test page.',
        text,
        'Page 1 of 1',
        '',
        'Signed: ___________________',
        'Date: _____________________',
    ]:
        draw.text((80, y), line, fill=(28, 28, 30), font=font)
        y += 80
    out = path or str(SAMPLE_DIR / 'sample-page-1.jpg')
    img.save(out, 'JPEG', quality=85)
    return out


async def main():
    sample_path = make_sample_image()
    print(f'Sample image: {sample_path}')

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={'width': 1024, 'height': 768})
        page = await ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'service worker' not in m.text.lower() else None)
        page.on('pageerror', lambda e: errors.append(str(e)))

        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(800)

        # Capture all console output for debugging
        all_console = []
        page.on('console', lambda m: all_console.append(f"[{m.type}] {m.text}"))
        page.on('pageerror', lambda e: all_console.append(f"[pageerror] {e}"))
        # Track failed responses
        failed_reqs = []
        page.on('response', lambda r: failed_reqs.append(f"{r.status} {r.url}") if r.status >= 400 else None)

        # Go to Studio
        await page.click('.bottom-nav__item[data-goto="studio"]')
        await page.wait_for_timeout(500)

        # Upload the sample image via the hidden file input
        await page.set_input_files('#imagesInput', sample_path)
        await page.wait_for_timeout(1500)

        # Verify thumbnail appears
        thumb_count = await page.evaluate("document.querySelectorAll('#studioThumbs .thumb').length")
        print(f'Thumbnails in studio: {thumb_count}')
        if thumb_count == 0:
            print('FAIL: no thumbnail rendered')
            print(json.dumps({'console': all_console}, indent=2))
            await browser.close(); sys.exit(1)

        # Click Create PDF and wait longer for async work
        await page.click('#btnCreatePdf')
        await page.wait_for_timeout(5000)

        # Print any errors that occurred during the click
        recent_console = all_console[-20:]
        print(f'Console during create-PDF: {recent_console}')
        print(f'Failed requests: {failed_reqs}')

        # Verify IndexedDB has a document
        idb_count = await page.evaluate(r"""async () => {
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
        print(f'Documents in IndexedDB: {idb_count}')

        # Open Library workspace and confirm a card is rendered
        await page.click('.bottom-nav__item[data-goto="library"]')
        await page.wait_for_timeout(2000)
        lib_cards = await page.evaluate("document.querySelectorAll('.library-card').length")
        print(f'Library cards rendered: {lib_cards}')

        # Capture final library state
        await page.screenshot(path=str(OUT_DIR / 'integration-library-after-save.png'))

        ok = thumb_count > 0 and idb_count > 0 and lib_cards > 0
        print(json.dumps({
            'ok': ok,
            'thumbnail_count': thumb_count,
            'indexeddb_document_count': idb_count,
            'library_card_count': lib_cards,
            'errors': errors,
        }, indent=2))

        await browser.close()
        sys.exit(0 if ok else 1)

asyncio.run(main())
