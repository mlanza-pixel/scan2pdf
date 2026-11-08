# v7.7.0 additive update — automated testing
- Added GitHub Actions regression and screenshot workflow triggered by pushes to main, pull requests, or manual runs.
- Updated Chromium launch configuration to use Playwright-installed browser, rather than hardcoded `/usr/bin/chromium`.
- Added Actions instructions and made this workflow a permanent future-release requirement.
- No app version increment; no claim that GitHub-hosted runs have already passed.
