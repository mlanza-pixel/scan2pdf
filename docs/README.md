# Current documentation for v7.75.0 Test Build 1

- DocuScan-Pro-Help-Manual-v7.75.0.docx and .pdf: current app Help content plus changes and a physical-device checklist.
- DocuScan-Pro-Overview-v7.75.0.docx and .pdf: build overview and test limitations.
- DocuScan-Pro-UI-Field-Reference-v7.75.0.xlsx: current UI labels, editable Change To column, stable selectors, test links and the Tour This Page worksheet.
- DocuScan-Pro-Help-Content-Inventory-v7.75.0.xlsx: current Help fields and editable Change To column.
- RELEASE_CONTENT.json and Tour-Steps-v7.75.0.json: generated from the current app content. Inventory does not imply functional test coverage.
- TEST_REPORT_7.75.0.md: current executed checks and NOT RUN scope.
- AUDIT_STATUS_7.75.0.md: implemented audit items and remaining proposals.
- RELEASE_DOCS_MANIFEST.json: version/build, document hashes and source fingerprints used by the release gate.

Previous manuals, workbooks and workflows are kept under legacy/. They are historical evidence, not the current primary documentation. Working-checkpoint notes describe earlier development stages and are superseded by RELEASE_NOTES_7.75.0.md.

Regeneration order: collect_release_content.mjs, build_release_workbooks.mjs, build_release_manuals.py, render/export manuals, then update the documentation manifest only after the content has been regenerated and reviewed. Source and document changes invalidate the gate. The spreadsheet authoring script requires the artifact-tool authoring runtime. validate_release.py runs without spreadsheet-authoring dependencies.
