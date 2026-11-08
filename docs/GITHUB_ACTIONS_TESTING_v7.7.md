# Automated GitHub Actions testing — v7.7.0

The `.github/workflows/automated-tests.yml` workflow runs automatically on pushes to `main`, pull requests, or manual **Actions → DocuScan Automated Regression and Screenshots → Run workflow**.

It installs dependencies, runs `npm test`, starts a local site on the GitHub runner, captures workspace and PDF Tools screenshots in `screenshots/{iphone,ipad,android,desktop}/`, and runs repeated navigation stress tests. Results are uploaded under **Actions → selected run → Artifacts → docuscan-v7-7-test-evidence** (30-day retention).

**Important:** GitHub Actions uses Chromium emulation; it does not prove actual iOS Safari, iPadOS Safari, or Android device behavior. It does not yet certify 50/100 image imports or full OCR/export stress. The existing Python scripts may require updates as UI controls evolve. Failed tests should be fixed before treating the release as certified. GitHub Pages deployment remains configured separately in `deploy.yml`.

Every future release must preserve and update this workflow, capture scripts, fixtures, and documentation; inspect failures and attach evidence.
