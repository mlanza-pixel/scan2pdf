# DocuScan Pro v7.74.2 — Sharded Workflow Test Runner

- Split browser tests into six independently selectable cases and three browser profiles (18 GitHub Actions jobs).
- Each job creates a clean browser context and its own JSON report; failed tests attempt screenshots.
- Editing and Library reopen assertions remain incomplete and must not be reported as fully verified.
- No app UI bug fixes included.
- Local browser test attempt blocked by browser network policy, not counted as pass.
