# GitHub testing policy — DocuScan Pro v7.71

Every release retains both workflows in `.github/workflows/` and the entire `scripts/`, `tests/`, `docs/` and `screenshots/` directory structure.

- `automated-tests.yml` runs core PDF regression, browser screenshots, navigation stress, and real file-input smoke tests (3 JPEGs, 5-page and 10-page PDFs). Failed required checks must fail the workflow.
- `live-smoke.yml` runs after successful GitHub Pages deployment and checks the actual published URL, with screenshots and navigation across four emulated screen profiles.
- Artifacts are retained for 30 days; download and preserve evidence for long-term audit.

## Coverage limits

Browser emulation does not certify physical iPhone, iPad or Android behavior. Import tests only assert the UI responds to fixtures, not OCR accuracy or valid exported documents. 20/50/100-page OCR, 50/100-image processing, memory exhaustion, cancellation and browser crash recovery require dedicated fixtures, measurable assertions, and physical-device runs before claiming pass. GitHub runners cannot reliably measure memory limits of consumer mobile browsers.

## Release gate

A green deployment alone is not a passing test. Review **both** GitHub Actions workflows and their evidence. If the published-site smoke workflow is missing, check that `.github/workflows/live-smoke.yml` was uploaded to `main`. Never interpret absent screenshots as success.
