# Device Self-Test — DocuScan Pro v7.71

On the actual iPad, iPhone, Android device or desktop: tap **About → Device Self-Test**. Choose **Quick**, **Standard** or **Stress**, then **Run Self-Test**. The panel displays each test's result and duration. Take a screenshot of the summary and any failures; use **Copy Results** or **Download JSON** to share complete details. The JSON includes browser/device information but never your documents.

- Quick: presence of six workspaces, viewport horizontal overflow, JPEG canvas encoding, temporary localStorage read/write/delete.
- Standard: Quick plus a generated 5-page PDF save/reopen, a generated 10-image PDF save/reopen, and an OCR engine availability warning. **It does not run OCR recognition.**
- Stress: Standard plus generation of 25 and 50 JPEGs, and 50/100-page generated PDF save/reopen.

The tests run on the device, with generated images and PDF pages in memory. They do not import or modify user documents or write to the app Library. The PDF round-trip checks use pdf-lib directly, not the full Studio/Tools UI; successful results are therefore not a guarantee that every app workflow succeeds. Device memory metrics are not reliably exposed on iOS. A browser tab may be killed under memory pressure without saving a report; use Quick or Standard if Stress is too demanding. **Stop** requests cancellation between checks; the current PDF save may need to finish before the stop takes effect.

Troubleshooting: if the self-test button is missing, refresh the app or close/reopen the installed PWA to obtain the new service worker cache. Keep the report and a screenshot showing any failures for bug reports.
