# DocuScan Pro accessibility release check

GitHub Pages deployment waits for the accessibility smoke checks on desktop Chromium and iPhone, iPad and Android-sized Chromium viewports. A failed check blocks that deployment. The complete functional workflow suite remains available in GitHub Actions.

The checks cover all six workspaces. They open the navigation by keyboard, look for horizontal overflow, and measure visible enabled buttons and tabs for labels and a 48 CSS pixel hit area. They also check populated Studio controls, the signature dialog and reduced-motion behavior. CSS pixels are an emulation proxy for Apple's 44-point and Android's 48-dp guidance.

These checks cover a subset of accessibility and platform requirements. Before distributing a native app, test VoiceOver and TalkBack, contrast, larger system text, platform permission flows and native camera and sharing on real devices. Review the store requirements separately. These browser checks do not establish App Store or Google Play approval.

## Library changes

Choose an action before selecting files. Move, Rename and Delete allow multiple selections. Rename asks for an individual name for each selected file. Delete asks for confirmation of the selected count. Open in Sign, Open in Tools and Share accept one PDF. Share opens the existing file-size review without sending the PDF through Sign. Native sharing depends on the browser and device. The current review can fall back to downloading a PDF.
