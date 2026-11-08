# Detailed live device audit — v7.71

About → Device Self-Test → check **Detailed live navigation + every-button inventory** → Run Self-Test.

The audit clicks each of the six bottom-navigation controls on the real device, checks activation, and inventories all buttons on each workspace, including visibility, accessible labels, disabled state, horizontal clipping and 44px touch-target sizing. The full per-control inventory is saved in the downloaded JSON report (`detailedAudit.items`). The screenshot summary shows the aggregate count.

**Important limits:** This is NOT a full automated functional tap of every button. File pickers, camera, sharing, printing, deleting, exporting and editing controls are not clicked because doing so could change user data or trigger native UI. Those controls are listed as `functionalTest: not run`. The generated-image/PDF engine tests remain separate. Browser/device limitations may affect navigation and dimensions. Run on iPhone and iPad and share JSON plus screenshots.

A future isolated test workspace can exercise actual editing flows safely with temporary fixture documents, but it must avoid production Library state and native permission prompts.
