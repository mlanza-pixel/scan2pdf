# 🚀 DocuScan Pro v1.0.0

Initial release of the professional, cross-platform Document Scanner PWA. No servers, no subscriptions, 100% free.

## ✨ Features
- **Native Camera Integration:** Triggers the native iOS/Android camera for optimal, high-resolution photo capture.
- **Searchable PDF Generation:** Uses `Tesseract.js` for OCR and `pdf-lib` to embed an invisible, searchable text layer over the scanned image (Option A).
- **Offline History:** Saves scanned documents locally using IndexedDB for instant access without an internet connection.
- **Native Sharing:** Seamlessly integrates with the iOS/Android Share Sheet to instantly email the PDF or save it to Files/Google Drive.
- **PWA Ready:** Fully installable to the home screen on iPhone and iPad with a native app-like experience (no browser URL bar).

## 📦 Included Files
- `index.html` (Main application logic, UI, and OCR processing)
- `manifest.json` (PWA configuration for home screen installation)
- `icon-192.png` & `icon-512.png` (App icons)

## 📱 How to Install
1. Ensure the repository is hosted on GitHub Pages (Settings > Pages > Deploy from main branch).
2. Open the published URL in **Safari** (iOS) or **Chrome** (Android).
3. Tap the **Share** button (iOS) or **Menu** (Android).
4. Select **"Add to Home Screen"**.
5. Open the app from your home screen and start scanning!