"""Patch the existing Playwright tests to accept the new splash page Terms checkbox.
The splash now requires checking a checkbox + clicking Start, unlike the old
welcome modal which had a one-click Skip.
"""
from pathlib import Path

PATCH = """
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
"""

TESTS = [
    'scripts/test_alignment.py',
    'scripts/test_workspaces.py',
    'scripts/test_e2e_studio.py',
    'scripts/test_e2e_sign.py',
    'scripts/test_help_system.py',
    'scripts/capture_full_pages.py',
    'scripts/capture_fixes.py',
]

for rel in TESTS:
    p = Path('/home/z/my-project') / rel
    if not p.exists():
        continue
    src = p.read_text()
    if 'splashAccept' in src:
        continue
    # Replace the old welcome-modal dismissal block (if present) with the new splash acceptance
    import re
    old_block = re.compile(
        r"# Dismiss the first-launch welcome modal if it appears\n"
        r"        try:\n"
        r"            skip_btn = await page\.wait_for_selector\('\.welcome-modal \[data-welcome=\"skip\"\]', timeout=2000\)\n"
        r"            if skip_btn:\n"
        r"                await skip_btn\.click\(\)\n"
        r"                await page\.wait_for_timeout\(300\)\n"
        r"        except Exception:\n"
        r"            pass\n",
        re.DOTALL,
    )
    if old_block.search(src):
        src = old_block.sub(PATCH.strip() + '\n', src)
    else:
        # No old block — insert after first wait_for_timeout
        import re
        m = re.search(r"(await page\.wait_for_timeout\(\d+\))", src)
        if m:
            src = src[:m.end()] + '\n' + PATCH + src[m.end():]
    p.write_text(src)
    print(f'patched {rel}')
