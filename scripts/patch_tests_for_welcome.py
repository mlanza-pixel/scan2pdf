"""Patch the existing Playwright tests to dismiss the first-launch welcome modal
before they navigate. Inserts a click on the 'Start Using App' button after the
initial wait_for_timeout, OR seeds localStorage so the modal never appears.
"""
import re
from pathlib import Path

PATCH = """
        # Dismiss the first-launch welcome modal if it appears
        try:
            skip_btn = await page.wait_for_selector('.welcome-modal [data-welcome="skip"]', timeout=2000)
            if skip_btn:
                await skip_btn.click()
                await page.wait_for_timeout(300)
        except Exception:
            pass
"""

# Tests that need the patch
TESTS = [
    'scripts/test_alignment.py',
    'scripts/test_workspaces.py',
    'scripts/test_e2e_studio.py',
    'scripts/test_e2e_sign.py',
    'scripts/capture_full_pages.py',
    'scripts/capture_fixes.py',
]

for rel in TESTS:
    p = Path('/home/z/my-project') / rel
    if not p.exists():
        print(f'skip {rel} — not found')
        continue
    src = p.read_text()
    if 'welcome-modal' in src:
        print(f'skip {rel} — already patched')
        continue
    # Find the first 'await page.wait_for_timeout(' after goto() and insert PATCH after it
    match = re.search(r"(await page\.wait_for_timeout\(\d+\))", src)
    if not match:
        print(f'skip {rel} — no wait_for_timeout found')
        continue
    new_src = src[:match.end()] + PATCH + src[match.end():]
    p.write_text(new_src)
    print(f'patched {rel}')
