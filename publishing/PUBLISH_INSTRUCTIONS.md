# DocuScan Pro v7.7.0 — complete publish package

1. Keep `Publish_DocuScan_Pro.bat`, `Publish_DocuScan_Pro.ps1`, and the release ZIP in the same Windows folder.
2. Double-click the BAT, confirm the displayed ZIP, and let it clone, update, commit and push to `main`.
3. Open GitHub → Actions to see the actual results and download screenshot artifacts.

The publisher preserves repository history and existing `.github` workflows; uploads the app, documentation, tests, fixtures and updated workflows. It does not delete your GitHub repository or force-push. It deliberately excludes generated `node_modules`, caches, and `.env` secrets. The publisher is not executed in this Linux environment; Windows/GitHub testing remains pending.

**Future releases:** replace the release ZIP with the newest complete ZIP and keep using these publisher files. The ZIP itself also contains copies of the publisher and this guide under `publishing/`.
