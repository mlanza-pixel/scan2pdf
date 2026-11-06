# DocuScan Pro 7.71

**Current release:** [v7.71 Tools and Help](RELEASE_NOTES_7.71_TOOLS_HELP.md)

[Accessibility release check and Library controls](ACCESSIBILITY_RELEASE_CHECK.md)

Complete static PWA release based on v7.6 Compact Library. No build or paid service is needed to run the app. Open `release.json` for the exact UTC build and cache versions.

## Choose your workspace

| Start with | Use | Finish with |
|---|---|---|
| JPGs, photos or a camera capture | Studio | Improve/arrange images, then create a PDF |
| A PDF you want to write on | Sign | Add text, signature, date, highlights or watermark |
| PDFs whose pages or structure need changing | PDF Tools | Merge, split, rotate, reorder or extract content |
| A previously saved document | Library | Reopen in Sign or PDF Tools |

Studio can send a created PDF directly to Sign or Tools. Tools has an **Add text or sign** handoff, so you do not need to download and reopen the file just to write on it.

The main Tools categories are Pages, Combine & Compare, and Text & Images. More tools contains less common markup, advanced operations and batch tools. Selecting a category again keeps its tools visible. Each operation keeps its draft settings until a different document is opened.

## Run on Windows

1. Extract the ZIP. Open the `docuscan-pro` folder.
2. Double-click `Start_Local_Windows.bat` if Python is installed, or run `python -m http.server 8080` from that folder.
3. Open `http://localhost:8080`. Do not double-click index.html: browser modules and service workers require an HTTP/HTTPS server.

For iPad/iPhone, publish the folder contents to GitHub Pages, visit in Safari, then use Add to Home Screen. Camera and sharing depend on device/browser support.

## Update GitHub Pages

1. Back up the current repository. Replace its app files with the **contents** of this release's `docuscan-pro` folder, including `vendor`, `js`, `css`, icons, manifest and service worker.
2. Commit and push to the repository's configured Pages branch, or let the included Pages workflow deploy.
3. Reopen the published site. The service worker uses a new 7.71 cache and claims clients after install; one additional reload may be needed to load all new assets together.
4. About must show **7.71**, build **7.71-talk-pdf**.

No changes have been pushed to the user's GitHub repository by this release task. Browser-local saved documents are separate from these app files. Do not clear site data unless you have downloaded backups.

## Bundled dependencies

PDF.js 4.7.76, its worker and standard fallback fonts, and pdf-lib 1.17.1 are included under `vendor`. Their license files are included. Basic PDF loading, rendering and editing do not need a PDF CDN on first use. OCR still downloads its engine/language data on first use and depends on successful caching. Password encryption uses an optional external engine and is not certified by this test run.

## Tests and evidence

Read the current release notes for v7.71 verification and remaining checks. Synthetic input fixtures include exactly three JPGs and two PDFs (10 and 5 pages). Output PDFs, test logs and JSON results are included under `tests/results`.

Developer checks:

```sh
npm install
npm test
node tests/sign-export.mjs
node tests/state-regression.mjs
python tests/verify-output.py
```

Python fixture creation needs Pillow and reportlab; independent verification needs pypdf. `tests/layout.html` previews the actual app at phone/tablet widths. Older inherited Python/browser scripts and manuals remain as historical material; their old PASS statements do not certify this release.

**Important test limit:** the browser approval system rejected uploading a synthetic PDF into the isolated preview. Direct file-processing tests passed, and browser controls/layout tests passed, but browser file-picker-to-download, OCR, camera, native sharing/printing and real iOS/Android behavior remain unverified.


## v7.73 realistic OCR testing
Run `python -m pip install pillow reportlab pypdf`, then `python scripts/generate_ocr_fixtures_v773.py --pages 5 10 25 50` and `python scripts/verify_ocr_fixtures_v773.py`. See `docs/TESTING_MASTER_REGISTER.md`, `docs/RELEASE_TEST_HISTORY.md` and `RELEASE_NOTES_7.73.md`.
