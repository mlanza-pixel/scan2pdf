# DocuScan Pro v7.7 — iPad diagnostics

- Device Self-Test reports v7.7 and suite 4. Close or Escape dismisses the panel immediately and requests a stop when running. A cache probe in flight is aborted, and other checks stop at their next checkpoint. Closed diagnostics no longer reappear during navigation audits or layout maps.
- The versioned service worker reloads app shell assets when installing and looks up resources in the current app cache. Diagnostics distinguish a stale app version and differences between browser/cache responses and the initial network copy.
- Stress diagnostics perform actual Tesseract recognition on 16 generated 960×1280 English JPEG pages and check each page's unique reference token. JSON includes per-page recognition time and match status. The 50- and 100-page checks create and reopen image PDFs separately. Use Studio with a physical iPad to test camera capture, OCR on real documents, searchable PDF output, and sharing to Mail.
- Library clears its selection row after Move, Rename, or Delete updates files.
- Updated the tours for Library, Sign, Studio and Help. All six tours keep their explanations visible even when their controls require a document.

## GitHub tests

Pushing to main automatically starts the normal 57-shard workflow and the existing accessibility deployment gate. A ZIP sitting on a local machine does not start Actions. After committing and pushing this build, open **Actions → DocuScan Complete Workflow Shards → Run workflow**, select **main**, and enable **stress** for 1,000 workflow executions distributed across the shards. A separate cache workflow has its own manual 1,000-reload option.

The real iPad retest and the 1,000-workflow run for this build are pending.

## Local verification

- Core regression suite: 18 passed. Node emitted PDF.js font-loading warnings during the renderer check.
- iPad-sized Chromium: 100/100 cache cycles, Close during a run followed by Library navigation, and all 46 tour steps completed.
- Browser Library test: moved two fixture PDFs in one operation and verified the selection row closed.
- Chromium using pinned OCR assets: 16/16 unique reference tokens found. Per-page OCR was 135–170 ms in this run. The generated JPEGs are simpler than real scans.

## Visual polish build

Studio and PDF Tools use matching Copy text and Download text buttons. Read aloud sits below Studio's page arrows. Studio enhancement labels can wrap, the OCR language selector has a 48-pixel minimum height, and Studio's export grid adapts to the available column width. Chromium layout checks passed at 320, 390, 412, 768, 1024 and 1440 pixels with two sample photos imported in Studio.
