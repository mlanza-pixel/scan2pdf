# DocuScan Pro v7.5 device fixtures and workflow stress

On the iPhone or iPad, open **About → Device Self-Test** and choose **Standard** or **Stress**. The bundled-fixture check loads three JPGs and two image-backed PDFs in memory. It builds and reopens a PDF from the JPGs and verifies that the bundled PDFs contain 5 and 10 pages. The service worker caches the test files with this build, so the check works offline after the updated app has loaded and the service worker has taken control. The check uses isolated test data and does not save test documents in Library. Other checks, including first-use OCR, have their own connectivity requirements.

**Download JSON** includes the device and browser or Home Screen mode in the filename and in the report's source field. GitHub workflow reports identify the Chromium profile and record the iteration number for each execution.

In GitHub, choose **Actions → DocuScan Complete Workflow Shards → Run workflow** and enable the 1,000-run input. The 57 shards each perform 17 or 18 executions, for exactly 1,000 executions of the 19 scenarios across desktop, emulated iPhone and emulated iPad. Each execution uses a fresh browser context. Pushes and pull requests still run the regular matrix once. The workflow stress option and the separate cache reload test measure different things.

The form scenario fills a real PDF text field from Before to After, exports the file, reopens it with pypdf, and verifies the saved field value. It does not cover every PDF field type.

For Studio, Camera and Import images share one row. iOS controls the system picker menu and may still offer Take Photo when importing an image. The app cannot hide that entry in the native picker.

Local checks for this build included two iterations each of navigation, Studio import, Studio capture, and form workflows on the three Chromium profiles (24 passes). A separate browser check verified cached fixtures and exported filenames offline with emulated iPhone and iPad user agents. Physical-device results and the full 1,000-workflow GitHub run are pending.
