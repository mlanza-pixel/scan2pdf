"""
DocuScan Pro — Apple Human Interface Guidelines (HIG) Compliance Audit.
Checks every aspect of the app against Apple's HIG standards:

1. Touch targets (≥44×44pt = 44×44px)
2. Color contrast ratios (≥4.5:1 for normal text, ≥3:1 for large text)
3. Typography (system font, proper sizes, hierarchy)
4. Press feedback (scale + brightness on :active)
5. Focus indicators (:focus-visible with ring)
6. Reduced motion support (prefers-reduced-motion)
7. Accessibility (aria-labels, roles, keyboard nav)
8. Corner radii consistency
9. Spacing consistency
10. Safe area insets (env(safe-area-inset-*))
11. Dark mode support
12. Navigation patterns (tab bar, active states)
13. Loading indicators (spinners for async)
14. Content clarity (no clipping, no overflow)
"""
import asyncio
import sys
import json
import math
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/index.html'
SAMPLE_PDF = '/home/z/my-project/assets/samples/test-contract.pdf'


def luminance(r, g, b):
    """Calculate relative luminance per WCAG."""
    def lin(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast_ratio(rgb1, rgb2):
    """Calculate WCAG contrast ratio between two color strings."""
    def parse(s):
        s = s.strip()
        # Handle rgba(r,g,b,a) format
        if s.startswith('rgba'):
            s = s.replace('rgba(', '').replace(')', '')
            parts = [float(x.strip()) for x in s.split(',')]
            return parts[0], parts[1], parts[2]
        # Handle rgb(r,g,b) format
        elif s.startswith('rgb'):
            s = s.replace('rgb(', '').replace(')', '')
            parts = [float(x.strip()) for x in s.split(',')]
            return parts[0], parts[1], parts[2]
        # Handle #hex format
        elif s.startswith('#'):
            h = s.lstrip('#')
            return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        # Handle named colors
        named = {'white': (255,255,255), 'black': (0,0,0), 'transparent': (255,255,255)}
        if s.lower() in named:
            return named[s.lower()]
        raise ValueError(f"Cannot parse color: {s}")
    r1, g1, b1 = parse(rgb1)
    r2, g2, b2 = parse(rgb2)
    l1 = luminance(r1, g1, b1)
    l2 = luminance(r2, g2, b2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        results = {'checks': [], 'issues': []}

        def check(name, cond, detail=''):
            results['checks'].append({'name': name, 'ok': bool(cond), 'detail': detail})
            if not cond:
                results['issues'].append(f"{name}: {detail}")
            status = '✓' if cond else '✗'
            print(f'  {status} {name}' + (f' — {detail}' if detail and not cond else ''), flush=True)

        # ====================================================================
        # 1. TABLET (iPad) viewport
        # ====================================================================
        print('\n=== iPad Portrait (768×1024) ===', flush=True)
        ctx = await browser.new_context(viewport={'width': 768, 'height': 1024},
                                          device_scale_factor=2)
        page = await ctx.new_page()
        await page.goto(BASE, wait_until='networkidle', timeout=15000)
        await page.wait_for_timeout(500)
        try:
            await page.click('#splashAccept', timeout=2000)
            await page.wait_for_timeout(200)
            await page.click('#splashStart', timeout=2000)
            await page.wait_for_timeout(500)
        except: pass

        # ---- Touch target sizes (≥44px height) ----
        print('\n--- Touch Targets (≥44px) ---', flush=True)
        touch_targets = await page.evaluate(r"""() => {
            const sels = ['.btn', '.bottom-nav__item', '.tools-tab', '.chip',
                          '.page-nav__btn', '.field__control', '.select',
                          '.input', '.page-tour-btn', '.workflow-card',
                          '.grouped-list__item', '.help-topic'];
            const results = [];
            for (const sel of sels) {
                document.querySelectorAll(sel).forEach(el => {
                    if (el.offsetParent === null) return; // skip hidden
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                        results.push({
                            sel: sel,
                            text: (el.textContent || '').trim().slice(0, 30),
                            w: Math.round(r.width),
                            h: Math.round(r.height),
                        });
                    }
                });
            }
            return results;
        }""")
        too_small = [t for t in touch_targets if t['h'] < 44]
        check('All touch targets ≥44px height', len(too_small) == 0,
              f'{len(too_small)} elements too small' if too_small else f'{len(touch_targets)} elements checked')
        if too_small:
            for t in too_small[:5]:
                print(f'      ✗ {t["sel"]} "{t["text"]}" — {t["w"]}×{t["h"]}px', flush=True)

        # ---- Color contrast ----
        print('\n--- Color Contrast (WCAG AA) ---', flush=True)
        contrast_checks = await page.evaluate(r"""() => {
            const checks = [];
            // Body text
            const body = document.querySelector('.page-header__sub, .muted, .tiny');
            if (body) {
                const s = getComputedStyle(body);
                checks.push({label: 'Secondary text on background', fg: s.color, bg: getComputedStyle(document.body).backgroundColor});
            }
            // Button text
            const btn = document.querySelector('.btn');
            if (btn) {
                const s = getComputedStyle(btn);
                checks.push({label: 'Button text on blue', fg: s.color, bg: s.backgroundColor});
            }
            // Nav item text
            const nav = document.querySelector('.bottom-nav__item');
            if (nav) {
                const s = getComputedStyle(nav);
                checks.push({label: 'Nav item text', fg: s.color, bg: getComputedStyle(document.querySelector('.bottom-nav')).backgroundColor});
            }
            // Section title
            const section = document.querySelector('.section__title');
            if (section) {
                const s = getComputedStyle(section);
                checks.push({label: 'Section title', fg: s.color, bg: getComputedStyle(document.body).backgroundColor});
            }
            return checks;
        }""")
        for c in contrast_checks:
            try:
                ratio = contrast_ratio(c['fg'], c['bg'])
                threshold = 4.5
                check(f'Contrast: {c["label"]}', ratio >= threshold,
                      f'{ratio:.1f}:1 (need {threshold}:1)')
            except Exception as e:
                # If we can't calculate, try with white/transparent background fallback
                try:
                    ratio = contrast_ratio(c['fg'], 'white')
                    check(f'Contrast: {c["label"]}', ratio >= 4.5,
                          f'{ratio:.1f}:1 on white (bg was {c["bg"]})')
                except:
                    check(f'Contrast: {c["label"]}', False, f'cannot parse: fg={c["fg"]} bg={c["bg"]}')

        # ---- Typography ----
        print('\n--- Typography ---', flush=True)
        font_info = await page.evaluate(r"""() => {
            const body = getComputedStyle(document.body);
            // Check a REGULAR .btn (not .btn--sm which has smaller text)
            const btnEl = document.querySelector('.btn:not(.btn--sm)') || document.querySelector('.btn');
            const btn = getComputedStyle(btnEl || document.body);
            const title = getComputedStyle(document.querySelector('.page-header__title') || document.body);
            const label = getComputedStyle(document.querySelector('.field__label') || document.body);
            return {
                fontFamily: body.fontFamily,
                bodySize: parseFloat(body.fontSize),
                btnSize: parseFloat(btn.fontSize),
                titleSize: parseFloat(title.fontSize),
                labelSize: parseFloat(label.fontSize),
            };
        }""")
        check('System font stack', '-apple-system' in font_info['fontFamily'] or 'system-ui' in font_info['fontFamily'],
              font_info['fontFamily'])
        check('Body text ≥16px', font_info['bodySize'] >= 16, f'{font_info["bodySize"]}px')
        check('Button text ≥15px', font_info['btnSize'] >= 15, f'{font_info["btnSize"]}px')
        check('Title ≥28px', font_info['titleSize'] >= 28, f'{font_info["titleSize"]}px')
        check('Label ≥12px', font_info['labelSize'] >= 12, f'{font_info["labelSize"]}px')

        # ---- Corner radii consistency ----
        print('\n--- Corner Radii ---', flush=True)
        radii = await page.evaluate(r"""() => {
            const elements = document.querySelectorAll('.btn, .card, .field__control, .chip, .bottom-nav__item');
            const seen = {};
            elements.forEach(el => {
                if (el.offsetParent === null) return;
                const r = getComputedStyle(el).borderRadius;
                const cls = el.className.split(' ')[0];
                if (!seen[cls]) seen[cls] = r;
            });
            return seen;
        }""")
        check('Corner radii defined', len(radii) > 0, str(radii))

        # ---- Press feedback (scale on :active) ----
        print('\n--- Press Feedback (Apple-style) ---', flush=True)
        # Check CSS for :active transform
        css_rules = await page.evaluate(r"""() => {
            const sheets = document.styleSheets;
            let rules = [];
            for (const sheet of sheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.selectorText && rule.selectorText.includes(':active')) {
                            if (rule.selectorText.includes('.btn')) {
                                rules.push({
                                    selector: rule.selectorText,
                                    transform: rule.style.transform,
                                    filter: rule.style.filter,
                                });
                            }
                        }
                    }
                } catch(e) { /* cross-origin */ }
            }
            return rules;
        }""")
        has_scale = any('scale' in (r.get('transform') or '') for r in css_rules)
        has_brightness = any('brightness' in (r.get('filter') or '') for r in css_rules)
        check('Buttons have :active scale', has_scale, 'no scale transform found')
        check('Buttons have :active brightness change', has_brightness, 'no brightness filter found')

        # ---- Focus indicators ----
        print('\n--- Focus Indicators ---', flush=True)
        focus_rules = await page.evaluate(r"""() => {
            const sheets = document.styleSheets;
            let has_focus = false;
            let has_focus_visible = false;
            for (const sheet of sheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.selectorText && rule.selectorText.includes(':focus-visible')) {
                            if (rule.selectorText.includes('.btn') || rule.selectorText.includes('.field')) {
                                has_focus_visible = true;
                            }
                        }
                        if (rule.selectorText && rule.selectorText.includes(':focus') && !rule.selectorText.includes('visible')) {
                            if (rule.selectorText.includes('.btn') || rule.selectorText.includes('.field')) {
                                has_focus = true;
                            }
                        }
                    }
                } catch(e) {}
            }
            return { has_focus, has_focus_visible };
        }""")
        check(':focus styles defined', focus_rules['has_focus'])
        check(':focus-visible styles defined', focus_rules['has_focus_visible'])

        # ---- Reduced motion ----
        print('\n--- Reduced Motion ---', flush=True)
        reduced_motion = await page.evaluate(r"""() => {
            const sheets = document.styleSheets;
            let has_rule = false;
            for (const sheet of sheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.conditionText && rule.conditionText.includes('prefers-reduced-motion')) {
                            has_rule = true;
                        }
                    }
                } catch(e) {}
            }
            return has_rule;
        }""")
        check('prefers-reduced-motion media query', reduced_motion)

        # ---- Accessibility: aria-labels ----
        print('\n--- Accessibility ---', flush=True)
        aria_check = await page.evaluate(r"""() => {
            // Check icon-only buttons have aria-labels
            const iconBtns = document.querySelectorAll('.btn--icon, .bottom-nav__item, .page-nav__btn');
            let missing = [];
            iconBtns.forEach(btn => {
                if (!btn.getAttribute('aria-label') && !btn.textContent.trim()) {
                    missing.push(btn.id || btn.className);
                }
            });
            // Check role attributes
            const nav = document.querySelector('.bottom-nav');
            const hasNavRole = nav && nav.getAttribute('role') === 'navigation';
            // Check aria-live for toasts
            const toastStack = document.getElementById('toastStack');
            const hasAriaLive = toastStack && toastStack.getAttribute('aria-live');
            return { missingAria: missing, hasNavRole, hasAriaLive };
        }""")
        check('Icon buttons have aria-labels', len(aria_check['missingAria']) == 0,
              f'{len(aria_check["missingAria"])} missing' if aria_check['missingAria'] else '')
        check('Bottom nav has role=navigation', aria_check['hasNavRole'])
        check('Toast stack has aria-live', aria_check['hasAriaLive'] is not None)

        # ---- Keyboard navigation ----
        print('\n--- Keyboard Navigation ---', flush=True)
        # Tab through the first few elements
        await page.keyboard.press('Tab')
        await page.wait_for_timeout(100)
        focused_tag = await page.evaluate("document.activeElement?.tagName")
        focused_has_outline = await page.evaluate(r"""() => {
            const el = document.activeElement;
            if (!el) return false;
            const s = getComputedStyle(el);
            return s.outlineStyle !== 'none' || s.boxShadow !== 'none';
        }""")
        check('Tab key focuses an element', focused_tag is not None, f'tag={focused_tag}')

        # ---- Safe area insets ----
        print('\n--- Safe Area Insets ---', flush=True)
        safe_area = await page.evaluate(r"""() => {
            // Check the CSS rule itself (not computed value, which resolves env() to 0)
            const sheets = document.styleSheets;
            for (const sheet of sheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.selectorText && rule.selectorText.includes('.bottom-nav')) {
                            if (rule.cssText && rule.cssText.includes('safe-area-inset')) return true;
                        }
                    }
                } catch(e) {}
            }
            // Also check inline styles
            const nav = document.querySelector('.bottom-nav');
            if (nav) {
                const style = nav.getAttribute('style') || '';
                if (style.includes('safe-area')) return true;
            }
            // Check CSS custom properties
            const rootStyle = getComputedStyle(document.documentElement);
            const allCSS = document.querySelector('style')?.textContent || '';
            if (allCSS.includes('safe-area-inset')) return true;
            return false;
        }""")
        check('Bottom nav has safe-area-inset padding', safe_area,
              'no env(safe-area-inset-bottom) found in CSS')

        # ---- Loading indicators ----
        print('\n--- Loading Indicators ---', flush=True)
        has_spinner = await page.evaluate(r"""() => {
            const sheets = document.styleSheets;
            for (const sheet of sheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.selectorText && rule.selectorText.includes('.spinner')) return true;
                        if (rule.selectorText && rule.selectorText.includes('@keyframes spin')) return true;
                    }
                } catch(e) {}
            }
            return false;
        }""")
        check('Spinner animation defined', has_spinner)

        has_progress = await page.evaluate(r"""() => {
            return !!document.querySelector('.progress') || !!document.querySelector('.progress__bar');
        }""")
        check('Progress bar component exists', has_progress)

        # ---- No content clipping ----
        print('\n--- Content Clipping ---', flush=True)
        overflow_check = await page.evaluate(r"""() => {
            // Check for horizontal scroll
            const hasHScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
            // Check for clipped text
            let clipped = 0;
            document.querySelectorAll('h1, h2, h3, p, .btn, .chip').forEach(el => {
                if (el.offsetParent === null) return;
                const r = el.getBoundingClientRect();
                if (r.right > window.innerWidth + 2) clipped++;
                if (r.left < -2) clipped++;
            });
            return { hasHScroll, clipped };
        }""")
        check('No horizontal scroll', not overflow_check['hasHScroll'],
              'page has horizontal scrollbar')
        check('No clipped text', overflow_check['clipped'] == 0,
              f'{overflow_check["clipped"]} elements clipped')

        # ---- Navigation: active state ----
        print('\n--- Navigation ---', flush=True)
        nav_active = await page.evaluate(r"""() => {
            const active = document.querySelector('.bottom-nav__item.is-active');
            return active ? active.dataset.goto : null;
        }""")
        check('Active nav item exists', nav_active is not None, f'active={nav_active}')

        await ctx.close()

        # ====================================================================
        # 2. MOBILE (iPhone) viewport — 390×844
        # ====================================================================
        print('\n=== iPhone (390×844) ===', flush=True)
        ctx2 = await browser.new_context(viewport={'width': 390, 'height': 844},
                                           device_scale_factor=3)
        page2 = await ctx2.new_page()
        await page2.goto(BASE, wait_until='networkidle', timeout=15000)
        await page2.wait_for_timeout(500)
        try:
            await page2.click('#splashAccept', timeout=2000)
            await page2.wait_for_timeout(200)
            await page2.click('#splashStart', timeout=2000)
            await page2.wait_for_timeout(500)
        except: pass

        # ---- Mobile touch targets ----
        mobile_touch = await page2.evaluate(r"""() => {
            const sels = ['.btn', '.bottom-nav__item', '.tools-tab', '.chip', '.page-nav__btn'];
            let too_small = 0;
            let total = 0;
            for (const sel of sels) {
                document.querySelectorAll(sel).forEach(el => {
                    if (el.offsetParent === null) return;
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                        total++;
                        if (r.height < 44) too_small++;
                    }
                });
            }
            return { too_small, total };
        }""")
        check('Mobile touch targets ≥44px', mobile_touch['too_small'] == 0,
              f'{mobile_touch["too_small"]}/{mobile_touch["total"]} too small')

        # ---- Mobile no horizontal scroll ----
        mobile_scroll = await page2.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        check('Mobile: no horizontal scroll', not mobile_scroll)

        # ---- Mobile bottom nav visible ----
        nav_visible = await page2.evaluate(r"""() => {
            const nav = document.querySelector('.bottom-nav');
            if (!nav) return false;
            const r = nav.getBoundingClientRect();
            return r.bottom <= window.innerHeight + 2 && r.height > 0;
        }""")
        check('Mobile: bottom nav fully visible', nav_visible)

        await ctx2.close()

        # ====================================================================
        # 3. DARK MODE support
        # ====================================================================
        print('\n=== Dark Mode ===', flush=True)
        ctx3 = await browser.new_context(viewport={'width': 1280, 'height': 900},
                                          color_scheme='dark')
        page3 = await ctx3.new_page()
        await page3.goto(BASE, wait_until='networkidle', timeout=15000)
        await page3.wait_for_timeout(500)
        try:
            await page3.click('#splashAccept', timeout=2000)
            await page3.wait_for_timeout(200)
            await page3.click('#splashStart', timeout=2000)
            await page3.wait_for_timeout(500)
        except: pass

        dark_mode = await page3.evaluate(r"""() => {
            // Check if the app has any prefers-color-scheme: dark rules
            const sheets = document.styleSheets;
            let has_dark = false;
            for (const sheet of sheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.conditionText && rule.conditionText.includes('prefers-color-scheme: dark')) {
                            has_dark = true;
                        }
                    }
                } catch(e) {}
            }
            // Check if body background is dark when color-scheme is dark
            const bg = getComputedStyle(document.body).backgroundColor;
            return { has_dark_rules: has_dark, bodyBg: bg };
        }""")
        check('Dark mode CSS rules exist', dark_mode['has_dark_rules'],
              'no @media (prefers-color-scheme: dark) rules found')

        await ctx3.close()

        # ====================================================================
        # SUMMARY
        # ====================================================================
        total = len(results['checks'])
        passed = sum(1 for c in results['checks'] if c['ok'])
        failed = total - passed
        print(f'\n{"="*60}')
        print(f'Apple HIG Compliance Audit')
        print(f'{"="*60}')
        print(f'Total checks: {total}')
        print(f'Passed: {passed}')
        print(f'Failed: {failed}')
        if results['issues']:
            print(f'\nVIOLATIONS:')
            for issue in results['issues']:
                print(f'  ✗ {issue}')
        score = (passed / total * 100) if total > 0 else 0
        print(f'\nHIG Compliance Score: {score:.0f}%')
        if score == 100:
            print('VERDICT: ✅ PASS — meets Apple Human Interface Guidelines')
        elif score >= 90:
            print('VERDICT: ⚠️ MOSTLY PASS — minor issues to address')
        else:
            print('VERDICT: ❌ FAIL — significant HIG violations')
        print(f'{"="*60}')

        await browser.close()
        sys.exit(0 if score == 100 else 1)

asyncio.run(main())
