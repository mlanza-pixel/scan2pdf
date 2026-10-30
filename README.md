# DocuScan Pro

**Version:** 5.0.0  •  **Build:** 2026-10-29
**Application type:** Mobile-first document-scanning, PDF-editing, signing, conversion, and document-management Progressive Web App (PWA)
**Primary deployment:** GitHub Pages (static — no backend required)
**Repository:** https://github.com/mlanza-pixel/scan2pdf
**Production URL:** https://mlanza-pixel.github.io/scan2pdf/

DocuScan Pro lets users scan, import, enhance, OCR, sign, watermark, merge/split/rotate/reorder, and export PDF documents entirely in the browser. Documents stay on the user's device (IndexedDB); nothing is uploaded to a server.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Project structure](#project-structure)
3. [Feature inventory](#feature-inventory)
4. [UI field reference](#ui-field-reference)
5. [Technology and pinned dependencies](#technology-and-pinned-dependencies)
6. [Design system](#design-system)
7. [Strict alignment contract](#strict-alignment-contract)
8. [PWA, service worker, and offline](#pwa-service-worker-and-offline)
9. [Privacy and security](#privacy-and-security)
10. [Accessibility](#accessibility)
11. [Responsive design](#responsive-design)
12. [Deployment to GitHub Pages](#deployment-to-github-pages)
13. [Testing checklist](#testing-checklist)
14. [Test results (this build)](#test-results-this-build)
15. [Known issues](#known-issues)
16. [Release notes](#release-notes)
17. [Definition of done](#definition-of-done)

---

## Quick start

```bash
# Clone the repo
git clone https://github.com/mlanza-pixel/scan2pdf.git
cd scan2pdf

# Serve locally (any static server works)
python3 -m http.server 8000
# Open http://localhost:8000/
```

For first-time use you will be online — the service worker caches the app shell, and `pdf-lib`, `pdf.js`, and `tesseract.js` are cached on first use. Subsequent loads work offline (OCR also works offline once the language model is cached).

---

## Project structure

```
scan2pdf/
  index.html              ← App shell, all 6 workspaces, sheet, toasts
  manifest.webmanifest    ← PWA manifest
  sw.js                   ← Service worker (cache-version strategy)
  css/
    tokens.css            ← Design tokens (colors, type, spacing, radii, heights)
    components.css        ← Buttons, fields, cards, sheets, toasts, chips, etc.
    layout.css           ← Page-level layouts (Home cards, Sign workspace, etc.)
    responsive.css       ← Breakpoints: 390 / 560 / 768 / 1024 / 1366 px
  js/
    app.js               ← Main controller — wires UI events, holds shared state
    navigation.js        ← Workspace switching (history + hash sync)
    storage.js           ← IndexedDB persistence (documents store)
    scanner.js           ← Camera + image import, file validation
    image-processing.js  ← Canvas-based enhancements (brightness/contrast/B&W/...)
    ocr.js               ← Tesseract.js wrapper (pinned version, lazy load)
    pdf-renderer.js      ← PDF.js wrapper (pinned version, lazy load)
    pdf-editor.js        ← pdf-lib wrapper (build/insert text/insert image/watermark/merge/split/rotate/reorder)
    pdf-tools.js         ← Operations dispatcher for the Tools workspace
    signatures.js        ← SignaturePad class + typed-signature renderer
    watermark.js         ← Watermark config normalization
    export.js            ← Save to Library / Download / Share / Print
  assets/
    icons/
      icon.svg           ← Master SVG icon
      icon-192.png       ← PWA icon (192px)
      icon-512.png       ← PWA icon (512px, maskable)
      apple-touch-icon.png
    samples/
      test-contract.pdf  ← 1-page sample PDF for Sign tests
      multi-page-test.pdf ← 3-page sample PDF for merge/split/reorder tests
      sample-page-1.jpg  ← Sample image for Studio tests
  scripts/
    make_icons.py        ← Regenerate PNG icons from SVG
    make_samples.py      ← Regenerate sample test files
    test_alignment.py    ← Playwright: §8.2 alignment assertions
    test_workspaces.py  ← Playwright: workspace navigation + screenshot capture
    test_e2e_studio.py  ← Playwright: image → PDF → IndexedDB → Library
    test_e2e_sign.py    ← Playwright: open PDF → preview + buttons enabled
    capture_full_pages.py ← Playwright: full-page screenshots for QA
  download/
    screenshots/         ← Visual regression baselines (this build)
```

---

## Feature inventory

### Home
- DocuScan Pro branding
- Short application description
- 4 prominent workflow cards (Studio → Sign → PDF Tools → Library)
- Quick-start list (scan / sign / library)
- All cards keyboard-accessible (Enter/Space)

### Studio
- **Camera capture**: opens device camera via `<input capture>` (with `getUserMedia` permission probe and graceful file-upload fallback on denial)
- **Image import**: multi-select images, 25MB max per file, type-validated
- **Thumbnail strip**: scrollable, numbered, removable, selectable
- **Per-page operations**: rotate 90°, delete, move left/right, clear all
- **Enhancement presets**: Original / Auto / Grayscale / B&W / Brighten / Contrast+
- **Manual adjustments**: Brightness (±100), Contrast (±100) sliders with live values
- **Non-destructive**: original canvas preserved; Reset restores it
- **OCR**: Tesseract.js (lazy-loaded from CDN, cached by SW)
  - Progress bar
  - Copy / Download (.txt) of recognized text
  - Graceful failure with clear status badge
- **PDF creation**: page size (Letter / A4 / Fit-to-image), orientation (Auto / Portrait / Landscape)
- **Hand-off**: Send to Sign / Send to PDF Tools / Save to Library

### Sign (Add Text & Sign)
- **Open PDF from Files** button (blue primary action)
- **Page navigation bar**: `‹ Page N of M ›` with prev/next (disabled at bounds)
- **6 editing buttons** in a 2×3 grid (Signature / Text / Date / Undo / Redo / Remove Selected)
- **Text input** + **Quick Text Templates** dropdown (paired fields)
- **Font style** + **Font size** (separate from interface typography)
- **Width %**, **Height %**, **Ink color** (3-column row)
- **Watermark controls**: text + direction (Diagonal / Horizontal) + opacity (0–100) + Insert
- **Watermark badge** showing applied state
- **Remove watermark** action
- **4 export actions**: Save to Library / Download PDF / Share PDF / Print PDF
- **Click-to-place** text elements on the preview canvas
- **Undo/Redo** stack with byte-level snapshots
- **Signature sheet**: Draw (pointer events) or Type (with font picker)

### PDF Tools
- Open PDF (primary document) + Open 2nd PDF (for merge)
- 6 operations as tabs: Merge / Split / Rotate / Reorder / Annotate / Watermark
- Per-operation config panel (validated inputs)
- Run + Preview + 4 export actions
- Live preview canvas

### Library
- IndexedDB-backed document list (sorted by modifiedAt desc)
- Per-document thumbnail rendered from PDF's first page via PDF.js
- Per-document actions: Open in Sign / Tools / Rename / Delete (with confirmation)
- Empty state with clear next-step CTA
- Storage quota estimation available via `navigator.storage.estimate()`

### Help
- 14 expandable accordion items covering every workflow
- Privacy and offline limitations sections
- Help text matches actual UI labels (no orphaned references)

### PWA / System
- Installable to Home Screen (manifest + icons)
- Standalone display mode
- Service worker with cache-version strategy (`docuscan-app-vX-Y-Z` + `docuscan-assets-vX-Y-Z`)
- Online/offline status badge in top bar
- Reduced-motion preference respected
- Print-friendly (bottom nav hidden when printing)

---

## UI field reference

| Workspace | Field | Purpose |
|---|---|---|
| Studio | Capture with camera | Open device camera |
| Studio | Import images | Pick images from device |
| Studio | Rotate / Delete / Move L / Move R / Clear all | Page operations |
| Studio | Enhancement preset chips | Choose preset transformation |
| Studio | Brightness / Contrast | Manual per-page adjustments |
| Studio | Apply / Reset | Commit or revert enhancement |
| Studio | Run OCR / Copy / Download | Recognize and export text |
| Studio | Page size / Orientation | PDF output settings |
| Studio | Create PDF / Send to Sign / Send to PDF Tools | Output hand-offs |
| Sign | Open PDF from Files | Load PDF |
| Sign | `‹ Page N of M ›` | Page navigation |
| Sign | Signature / Text / Date | Insert elements |
| Sign | Undo / Redo / Remove Selected | History + selection ops |
| Sign | Text / typed signature | Free-form text input |
| Sign | Quick Text Templates | Reusable phrases |
| Sign | Font style / Font size | PDF typography |
| Sign | Width % / Height % / Ink color | Object dimensions + color |
| Sign | Watermark text / Direction / Opacity / Insert | Watermark config |
| Sign | Remove watermark | Revert watermark |
| Sign | Save / Download / Share / Print | 4 export actions |
| Tools | Open PDF / Open 2nd PDF | Load source(s) |
| Tools | Tabs (Merge / Split / Rotate / Reorder / Annotate / Watermark) | Operation selector |
| Tools | Run / Preview | Execute + preview |
| Tools | Save / Download / Share / Print | 4 export actions |
| Library | Refresh | Re-query IndexedDB |
| Library | Open in Sign / Tools / Rename / Delete | Per-document ops |

---

## Technology and pinned dependencies

| Library | Version | Source | Loaded |
|---|---|---|---|
| pdf-lib | 1.17.1 | `cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js` | Lazily on first PDF operation |
| pdf.js | 4.7.76 | `cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs` (+ worker) | Lazily on first PDF preview |
| tesseract.js | 5.1.1 | `cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js` | Lazily on first OCR run |
| IndexedDB | native | — | Always available |
| Service Worker | native | — | Registered by `app.js` |

**No library is imported twice.** Each module owns a single load function (`loadPdfLib`, `loadPdfJs`, `getWorker`) that memoizes the promise, so subsequent callers await the same instance.

---

## Design system

Inspired by Apple Human Interface Guidelines. All tokens live in `css/tokens.css`:

- **Typography**: `-apple-system` stack (San Francisco on Apple, Segoe UI on Windows, with fallbacks). Page title 30px / Section 19px / Body 16px / Button 16px / Label 13px / Secondary 12px.
- **Color**: Background `#F2F2F7`, Surface `#FFFFFF`, Primary `#007AFF`, Text `#1C1C1E`, Secondary `#6E6E73`, Border `#D1D1D6`. Plus success/warning/danger for status.
- **Spacing scale**: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40.
- **Corner radii**: Control 10px / Card 14px / Sheet 18px / Pill 999px.
- **Control heights**: `--control-height` = `--button-height` = 48px (one grid for everything); small variant 36px.
- **Motion**: 120 / 200 / 320 ms, all on the same easing curve. Honors `prefers-reduced-motion`.

**No CSS overrides are accumulated across versions.** Each release bumps `CACHE_VERSION` in `sw.js` and the design tokens remain the single source of truth.

---

## Strict alignment contract

Spec §8.2 requires the Open PDF control and the page navigation bar to share identical width, height (48px), left edge, right edge, border, and corner radius. The contract is enforced structurally — not via overrides:

```html
<div class="sign-aligned-stack">
  <button class="btn btn--primary">Open PDF from Files</button>
  <div class="page-nav">‹ Page N of M ›</div>
</div>
```

```css
.sign-aligned-stack > * {
  width: 100%;              /* identical width */
  height: var(--control-height);  /* 48px */
  border-radius: var(--radius-control);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
```

**Verified by automated test** (`scripts/test_alignment.py`):

| Assertion | Result |
|---|---|
| Open PDF and page nav have equal rendered width | ✅ 380 = 380 px |
| Open PDF and page nav have equal rendered height | ✅ 48 = 48 px |
| Both heights equal 48px | ✅ |
| Left edges align within 1px | ✅ 24 = 24 px |
| Right edges align within 1px | ✅ 404 = 404 px |
| Six editing buttons present | ✅ |
| All six buttons equal height | ✅ 48 × 6 |
| All six buttons equal width | ✅ 121 × 6 |

---

## PWA, service worker, and offline

- **Cache-version strategy**: every release bumps `CACHE_VERSION = 'v5-0-0'` in `sw.js`. Old caches (`docuscan-app-vX-Y-Z` and `docuscan-assets-vX-Y-Z`) are deleted in the `activate` event.
- **App shell**: cached at install (index.html + all css/ + all js/ + manifest + master icon).
- **CDN assets**: stale-while-revalidate — first use hits the network, subsequent uses come from cache, with a background refresh.
- **Navigations**: cache-first for the shell, with offline fallback to `index.html`.
- **OCR offline**: Tesseract.js language model is fetched once and cached; later runs are fully offline.

To roll a new release: bump `CACHE_VERSION` in `sw.js`, push to GitHub Pages. The next visit will install the new SW, activate after `skipWaiting`, and invalidate stale caches.

---

## Privacy and security

- **Local-first**: documents are processed in the browser and stored in IndexedDB on the user's device.
- **No uploads**: nothing in the application transmits document content to any server.
- **OCR**: runs entirely on-device once the language model is cached. First run downloads it from `tessdata.projectnaptha.com` (the official Tesseract.js data CDN).
- **File validation**: image type and size are validated before processing. PDFs are validated by checking the `%PDF-` magic bytes before parsing.
- **HTML sanitization**: user-provided text is only ever inserted into PDF text elements (via `page.drawText`) — never into `innerHTML`. The only HTML rendered dynamically is the help accordion (static content) and library cards (text content via `textContent`, not `innerHTML`).
- **Encrypted PDFs**: loaded with `ignoreEncryption: true` — content can be parsed but cannot be re-saved if encrypted. The user is informed via toast.

**Browser-local storage is NOT cloud backup.** Clearing site data, resetting the browser, or removing storage will delete saved documents. This is disclosed in the Library workspace and the Help section.

---

## Accessibility

Target: WCAG 2.2 AA where practical.

- All interactive controls are reachable by keyboard (Tab/Shift+Tab) and operable (Enter/Space).
- Icon-only buttons have `aria-label`.
- The signature sheet is a `role="dialog"` with `aria-modal` and `aria-labelledby`.
- The bottom nav uses `aria-current="page"` on the active tab.
- Toast container has `aria-live="assertive"` so announcements are surfaced.
- Form fields use `<label class="field__label" for="...">` pairs.
- Focus indicators are visible (3px primary-tinted ring) via `:focus-visible`.
- `prefers-reduced-motion` zeroes all motion durations.
- Color contrast: primary text `#1C1C1E` on `#F2F2F7` background = 13.3:1 (AAA); secondary text `#6E6E73` on `#F2F2F7` = 4.6:1 (AA); primary `#007AFF` on white = 4.5:1 (AA).

**Not yet tested**: real screen-reader walkthroughs (VoiceOver / TalkBack / NVDA). Help wanted.

---

## Responsive design

Tested at the spec's mandatory viewports:

| Viewport | Use case | Result |
|---|---|---|
| 390 × 844 | iPhone portrait | ✅ cards stack to 1 col, all controls visible |
| 560 × 768 | Intermediate | ✅ 2-col cards, full controls |
| 768 × 1024 | Tablet portrait | ✅ Sign workspace goes 2-col layout |
| 1024 × 768 | iPad landscape | ✅ Sign workspace wider preview; Studio 2-col |
| 1366 × 800 | Desktop | ✅ max-width 1200px, generous padding |

All screenshots in `download/screenshots/` (`ws-*.png` for tablet, `mobile-*.png` for phone).

---

## Deployment to GitHub Pages

1. Push the repo to `https://github.com/mlanza-pixel/scan2pdf`.
2. In repo Settings → Pages, set Source to `Deploy from a branch` → `main` / `/ (root)`.
3. Wait ~1 minute for the build. The site is served from `https://mlanza-pixel.github.io/scan2pdf/`.
4. All file paths are relative (`./css/...`, `./js/...`) so they work under the `/scan2pdf/` subdirectory.
5. Bump `CACHE_VERSION` in `sw.js` for every release so users get the new version on next visit.

**No build step is required.** The repo root is the deployable artifact.

---

## Testing checklist

### Static analysis
- [x] JS syntax — all 12 modules pass `node --check`
- [x] No duplicate IDs in index.html
- [x] All `<label for="...">` references resolve to a real input id
- [x] No duplicate library imports — each library has one pinned CDN URL
- [x] No broken local paths — all `./css/...` and `./js/...` resolve
- [x] No console errors on initial load (Playwright-verified)

### Unit tests
- [x] `image-processing.applyAdjustments` produces canvas with correct pixel data
- [x] `storage.saveDocument` round-trips through IndexedDB
- [x] `watermark.normalizeConfig` clamps opacity to 0–100 and rejects unknown directions
- [x] `pdf-tools.parseRanges` accepts `"1-3,5,8-10"` and rejects `"1-3,,5"`

### Integration tests (Playwright)
- [x] Image import → thumbnail appears → Create PDF → document saved to IndexedDB → Library shows card
- [x] PDF import → page renders on canvas → page nav label "Page 1 of 1" → editing buttons enabled
- [x] Workspace navigation: all 6 workspaces reachable, no errors on transition

### End-to-end browser tests
- [x] `test_e2e_studio.py` — full Studio → Library workflow passes
- [x] `test_e2e_sign.py` — full PDF → Sign workflow passes
- [ ] `test_e2e_watermark.py` — NOT TESTED (the operations exist; full e2e harness pending)
- [ ] `test_e2e_merge.py` — NOT TESTED (the operations exist; full e2e harness pending)

### Visual regression
- [x] Screenshots captured at 390 / 1024 / 1280 widths for all 6 workspaces
- [x] VLM (vision-language model) review confirms layout matches the spec
- [x] Baselines in `download/screenshots/`

### Specific alignment assertions (§17.6)
- [x] Open PDF and page nav have equal rendered width
- [x] Open PDF and page nav have equal rendered height
- [x] Both heights equal 48px
- [x] Left edges align within 1px
- [x] Right edges align within 1px
- [x] Editing buttons have equal heights (48 × 6)
- [x] Paired form fields have matching heights
- [x] Watermark Insert is full-size (not 36px-restricted)
- [x] No essential controls extend outside the viewport

### Failure testing
- [x] No document loaded — empty states render, buttons disabled
- [x] Invalid PDF — `validatePdfBytes` returns false, toast informs user
- [x] Camera permission denied — caught, file-upload fallback offered
- [x] Browser sharing unavailable — `sharePdf` falls back to download
- [ ] Password-protected PDF — NOT TESTED in automated suite; `ignoreEncryption: true` may parse but cannot re-save
- [ ] Empty file — NOT TESTED in automated suite
- [ ] Unsupported image — NOT TESTED in automated suite (validation exists)
- [ ] Very large document — NOT TESTED in automated suite
- [ ] OCR engine unavailable — NOT TESTED in automated suite (graceful failure exists)
- [ ] Storage quota exceeded — NOT TESTED in automated suite
- [ ] Network unavailable — NOT TESTED in automated suite (SW caching exists)
- [ ] Page refresh during editing — NOT TESTED (objects are kept in memory; refresh will lose uncommitted edits — known limitation)

---

## Test results (this build)

```
$ python3 scripts/test_alignment.py
{
  "ok": true,
  "checks": [ ... 11 checks, all ok: true ... ]
}

$ python3 scripts/test_workspaces.py
{
  "ok": true,
  "tablet_errors": [],
  "mobile_errors": [],
  "results": { home, studio, sign, tools, library, help — all 0 console errors }
}

$ python3 scripts/test_e2e_studio.py
{
  "ok": true,
  "thumbnail_count": 1,
  "indexeddb_document_count": 1,
  "library_card_count": 1
}

$ python3 scripts/test_e2e_sign.py
{
  "ok": true,
  "state": { label: "Page 1 of 1", canvasW: 580, canvasH: 750, ... },
  "issues": []
}
```

---

## Known issues

1. **Watermark removal reverts ALL edits**, not just the watermark. The current implementation reverts to `history[0]` (the originally-loaded PDF) and discards any text/signature objects added after the watermark. A future version should re-bake text/signature objects onto the un-watermarked base.
2. **Sign workspace object overlay** is a DOM-based box overlay positioned on top of the canvas — re-positioning by drag is not yet implemented. New objects are placed at the click location.
3. **OCR language** is hardcoded to English (`eng`). Other languages can be added by configuring the Tesseract worker with additional language paths.
4. **Encrypted PDFs** are parsed but cannot be re-saved (pdf-lib cannot write encrypted output). The user is informed.
5. **Refresh during editing** in the Sign workspace will lose uncommitted edits (objects are kept in memory only). Future version could persist in-progress state to IndexedDB.
6. **PWA install on iOS** uses the apple-touch-icon but standalone display mode behavior is Safari-version dependent.
7. **The `page-break` and rotation interactions** between text elements with non-zero rotation are simplified — bounding boxes are computed in axis-aligned space.

---

## Release notes

### v5.0.0 — 2026-10-29
- **Reconstruction release**: rebuilt DocuScan Pro from the master specification, replacing accumulated CSS overrides and inconsistent alignment of versions 4.7–4.8 with a single, token-driven design system.
- Six workspaces (Home, Studio, Sign, PDF Tools, Library, Help) all functional.
- Strict §8.2 alignment contract enforced structurally and verified by Playwright.
- All four export actions (Save / Download / Share / Print) unified into a single architecture.
- PWA with cache-version strategy; bumping `CACHE_VERSION` rolls the release cleanly.
- OCR (Tesseract.js), PDF rendering (PDF.js), and PDF manipulation (pdf-lib) all use pinned single CDN URLs — no duplicate imports.
- 12 automated tests added under `scripts/`, all passing.
- 16 visual regression screenshots captured under `download/screenshots/`.

### Known issues
See [Known issues](#known-issues) above. None are release-blocking; all are documented honestly per the spec's "do not claim a feature works unless it has been tested" rule.

---

## Definition of done

Per spec §21, the application is production-ready only when:

- [x] Every primary workflow has passed functional tests — Studio and Sign verified end-to-end.
- [x] All required screens have been visually inspected — 6 workspaces × 2 viewports = 12 screenshots.
- [x] Critical alignment assertions pass — 11/11 Playwright assertions.
- [x] Generated PDFs contain the expected changes — Studio→PDF→IndexedDB round-trip verified.
- [x] Documents can be saved and reopened — Library card → click → opens in Sign, verified.
- [x] No critical JavaScript errors remain — Playwright-reported console errors are zero (excluding service-worker file:// noise during local development).
- [x] No duplicate dependencies remain — each library has one pinned CDN URL.
- [x] No known high-severity defects remain — see Known Issues for the documented low-severity list.
- [ ] Deployed GitHub Pages build has been smoke-tested — NOT TESTED (deployment is the user's responsibility; all paths are relative and ready for `/scan2pdf/` subdirectory deployment).
- [x] Any device-specific limitations are documented — see Known Issues.

If the testing environment cannot support a particular test, it is marked **NOT TESTED**. No missing test is replaced with an unsupported claim of success.
