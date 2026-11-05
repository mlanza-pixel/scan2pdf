# DocuScan Pro v7.74.1 — test report

**Changes:** New complete application UI workflow regression, GitHub Actions execution step, permanent testing documentation.

**Verified locally:** Python script compiled; source package can be inspected. **Not verified:** successful completion of full browser suite. An attempted local browser run exceeded the execution time budget, so no passing result is claimed. GitHub Actions and actual iPad/iPhone runs remain pending.

**Known unresolved issues from device reports:** 138px iPhone horizontal overflow; 59 button layout/accessibility findings; 0/6 DOM screenshot captures on both iOS devices. These are **not fixed** by this test-only update.

**Important coverage limitations:** Sign editing is checked by export-byte difference, not annotation placement; Library item activation is checked, not confirmed PDF render. The tests must be strengthened before those workflows can be called fully verified.
