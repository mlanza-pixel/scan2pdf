# DocuScan Pro 7.75.0 Test Build 5

Multiline PDF fields now render as textareas. Enter and blank lines survive Apply Changes, exported PDF values and visual rendering. Read-only fields and checkboxes are preserved.

Verification: 40/40 contractor template/profile combinations passed their selected tests: 24 native form workflows including multiline edits, and 16 flat-PDF manual Text/signature workflows. Four Chromium viewport profiles each passed 21 isolated diagnostic checks, with 0 failed and 6 NOT RUN in Quick mode. The new WF-FORMS-02 verifies multiline and blank lines, a checkbox and a read-only value.

An actual app download was independently reopened with pypdf; the saved multiline value and blank line were correct. PyMuPDF confirmed distinct rendered baselines and the extra blank-line gap. Updated Help, Tour wording, XLSX field/content references and DOCX/PDF manuals are included.

Limits: real iPad/iPhone hardware, native camera, sharing/email, printing and accessibility remain unverified. Flat PDF templates still need manual Text placement; this build does not add automatic field creation or arithmetic. Full XFA behavior remains unsupported; the existing supported blank-static conversion is retained. These tests do not certify every field, formula or workflow.
