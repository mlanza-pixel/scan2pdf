# DocuScan Pro - PWA Head Integration Tags

Add the following tags into the `<head>` section of `index.html`:

```html
<!-- Viewport & Color Settings -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="theme-color" content="#007AFF">

<!-- Web App Manifest -->
<link rel="manifest" href="/scan2pdf/manifest.webmanifest">

<!-- Apple iOS / Safari Support -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="DocuScan Pro">
<link rel="apple-touch-icon" href="/scan2pdf/assets/icons/icon-192.png">

<!-- PWA Management Script -->
<script type="module" src="/scan2pdf/js/pwa.js"></script>
```
