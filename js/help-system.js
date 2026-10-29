/* =====================================================================
   help-system.js — DocuScan Pro interactive walkthrough engine and
   illustrated Help Center. All control selectors below were verified
   against index.html on 2026-10-29 (v5.1.0).
   ===================================================================== */

import { goto } from './navigation.js';

const STORAGE_KEY = 'docuscan-pro.tutorial-state';

const state = {
  tutorialSeen: false,
  activeWalkthrough: null,   // { id, steps, current }
};

/* ---------------- Splash page with Terms acceptance (first-launch) ---------------- */

const SPLASH_TERMS_HTML = `
  <h4>Your privacy</h4>
  <p>DocuScan Pro processes your documents entirely in your browser. Your files never leave your device.</p>
  <ul>
    <li><strong>No data collection.</strong> We do not collect, transmit, or store your documents or personal information on any server.</li>
    <li><strong>Local storage only.</strong> Saved documents live in your browser's IndexedDB. Clearing site data removes them.</li>
    <li><strong>OCR on-device.</strong> Text recognition runs in your browser via Tesseract.js. First use downloads the language model from the official Tesseract CDN; subsequent runs work offline.</li>
  </ul>

  <h4>We do our best</h4>
  <p>This application is provided as a free, best-effort tool. We work hard to make it reliable, but we cannot guarantee perfect results for every document, browser, or device.</p>
  <ul>
    <li>OCR accuracy depends on scan quality and is never perfect.</li>
    <li>Some features depend on browser support (camera, Web Share API, printing) and may behave differently across devices.</li>
    <li>Browser updates or storage changes can affect saved documents.</li>
  </ul>

  <h4>Please don't sue us</h4>
  <p>By using DocuScan Pro you agree that:</p>
  <ul>
    <li>The application is provided <strong>"as is"</strong> without warranty of any kind, express or implied.</li>
    <li>You use it at your own risk. We are not liable for any damages, data loss, or business interruption arising from use of or inability to use the application.</li>
    <li>You are responsible for keeping backup copies of important documents (use the Download button).</li>
    <li>If you do not agree, do not use the application.</li>
  </ul>
`;

export function maybeShowWelcome() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.tutorialSeen = !!saved.tutorialSeen;
    state.termsAccepted = !!saved.termsAccepted;
  } catch { /* localStorage may be unavailable */ }
  if (state.termsAccepted) return;
  showSplash();
}

function showSplash() {
  document.querySelectorAll('.splash, .welcome-modal').forEach(n => n.remove());
  const splash = document.createElement('div');
  splash.className = 'splash';
  splash.setAttribute('role', 'dialog');
  splash.setAttribute('aria-modal', 'true');
  splash.setAttribute('aria-labelledby', 'splashTitle');
  splash.innerHTML = `
    <div class="splash__card">
      <div class="splash__hero" aria-hidden="true">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
          <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
          <rect x="8" y="8" width="8" height="8" rx="1"/>
        </svg>
      </div>
      <h2 class="splash__title" id="splashTitle">Welcome to DocuScan Pro</h2>
      <p class="splash__sub">Scan, sign, merge, and export PDF documents — all in your browser. Your files stay on your device.</p>
      <div class="splash__terms" id="splashTerms">${SPLASH_TERMS_HTML}</div>
      <label class="splash__checkbox-row">
        <input type="checkbox" class="splash__checkbox" id="splashAccept" />
        <span class="splash__checkbox-label">
          <strong>I have read and accept the Terms &amp; Conditions.</strong><br />
          I understand my documents stay on my device, the app is provided "as is" without warranty, and I use it at my own risk.
        </span>
      </label>
      <div class="splash__actions">
        <button class="btn btn--primary btn--block" id="splashStart" type="button" disabled>
          Start Using App
        </button>
        <button class="btn btn--block" id="splashTour" type="button" disabled>
          Accept &amp; Show Me How
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(splash);

  const checkbox = splash.querySelector('#splashAccept');
  const startBtn = splash.querySelector('#splashStart');
  const tourBtn = splash.querySelector('#splashTour');
  checkbox.addEventListener('change', () => {
    startBtn.disabled = !checkbox.checked;
    tourBtn.disabled = !checkbox.checked;
  });
  startBtn.addEventListener('click', () => {
    if (!checkbox.checked) return;
    acceptTerms();
    splash.remove();
  });
  tourBtn.addEventListener('click', () => {
    if (!checkbox.checked) return;
    acceptTerms();
    splash.remove();
    startWalkthrough('home');
  });
  // Escape is NOT bound here — user must accept to proceed.
  // (Splash is a gate; escape would let them bypass terms.)
}

function acceptTerms() {
  state.termsAccepted = true;
  state.tutorialSeen = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ termsAccepted: true, tutorialSeen: true }));
  } catch {}
}

function markTutorialSeen() {
  state.tutorialSeen = true;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    saved.tutorialSeen = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {}
}

/* ---------------- Walkthrough engine ---------------- */

/**
 * Each walkthrough step describes:
 *  - selector:  CSS selector for the element to highlight (or null for full-page step)
 *  - title:     short step title
 *  - body:      rich HTML description (kept short)
 *  - placement: 'top' | 'bottom' | 'left' | 'right' (where the card appears relative to the highlighted element)
 *  - workspace: optional — if set, switch to that workspace before showing step
 *  - onShow:    optional async fn called when step becomes active
 */
export function startWalkthrough(id) {
  const def = WALKTHROUGHS[id];
  if (!def) { console.warn('Unknown walkthrough:', id); return; }
  state.activeWalkthrough = { id, steps: def.steps, current: 0 };
  showStep(0);
}

function showStep(index) {
  const w = state.activeWalkthrough;
  if (!w) return;
  if (index < 0 || index >= w.steps.length) { endWalkthrough(); return; }
  w.current = index;
  const step = w.steps[index];

  // If the step requires a different workspace, switch first
  const switchAndShow = async () => {
    if (step.workspace && goto) {
      goto(step.workspace);
      // Wait for layout
      await new Promise(r => setTimeout(r, 350));
    }
    if (typeof step.onShow === 'function') {
      try { await step.onShow(); } catch {}
    }
    renderStep(step, index, w.steps.length);
  };
  switchAndShow();
}

function renderStep(step, index, total) {
  removeStep();
  const layer = document.createElement('div');
  layer.className = 'walkthrough-layer';
  layer.id = '__walkthroughLayer';

  let targetEl = step.selector ? document.querySelector(step.selector) : null;
  // Skip step gracefully if the target is missing or disabled
  if (step.selector && (!targetEl || targetEl.disabled)) {
    console.info(`Walkthrough: skipping step — selector "${step.selector}" not visible`);
    showStep(index + 1);
    return;
  }

  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    // Pad the spotlight slightly so the border doesn't clip
    const padding = 4;
    const spotlight = document.createElement('div');
    spotlight.className = 'walkthrough-spotlight walkthrough-spotlight--pulse';
    spotlight.style.left = (rect.left - padding) + 'px';
    spotlight.style.top = (rect.top - padding) + 'px';
    spotlight.style.width = (rect.width + padding * 2) + 'px';
    spotlight.style.height = (rect.height + padding * 2) + 'px';
    layer.appendChild(spotlight);
    // Make the target visible above the layer
    targetEl.style.position = targetEl.style.position || 'relative';
    targetEl.style.zIndex = String((parseInt(getComputedStyle(document.documentElement).getPropertyValue('--z-overlay')) || 500) + 2);
  }
  document.body.appendChild(layer);

  // Tooltip card
  const card = document.createElement('div');
  card.className = 'walkthrough-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', `wt-title-${index}`);
  card.setAttribute('aria-describedby', `wt-body-${index}`);
  card.innerHTML = `
    <div class="walkthrough-card__header">
      <span class="walkthrough-card__step-badge">Step ${index + 1} of ${total}</span>
      <h3 class="walkthrough-card__step-title" id="wt-title-${index}">${escapeHtml(step.title)}</h3>
    </div>
    <p class="walkthrough-card__body" id="wt-body-${index}">${step.body}</p>
    <div class="walkthrough-card__progress">
      ${Array.from({ length: total }, (_, i) => `<span class="walkthrough-card__progress-dot ${i === index ? 'is-active' : ''}"></span>`).join('')}
    </div>
    <div class="walkthrough-card__actions">
      ${index > 0 ? '<button class="btn btn--ghost btn--sm" data-wt="back" type="button">‹ Back</button>' : ''}
      <button class="btn btn--sm" data-wt="next" type="button">${index === total - 1 ? 'Done' : 'Next ›'}</button>
      <button class="walkthrough-card__skip" data-wt="skip" type="button">Skip tutorial</button>
    </div>
  `;
  document.body.appendChild(card);

  // Position card relative to target
  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const margin = 12;
    let left, top;
    const placement = step.placement || 'right';
    switch (placement) {
      case 'right':
        left = rect.right + margin;
        top = rect.top + rect.height / 2 - cardRect.height / 2;
        if (left + cardRect.width > window.innerWidth - 12) {
          // Fall back to bottom
          left = rect.left + rect.width / 2 - cardRect.width / 2;
          top = rect.bottom + margin;
        }
        break;
      case 'left':
        left = rect.left - cardRect.width - margin;
        top = rect.top + rect.height / 2 - cardRect.height / 2;
        if (left < 12) {
          left = rect.left + rect.width / 2 - cardRect.width / 2;
          top = rect.bottom + margin;
        }
        break;
      case 'top':
        left = rect.left + rect.width / 2 - cardRect.width / 2;
        top = rect.top - cardRect.height - margin;
        break;
      case 'bottom':
      default:
        left = rect.left + rect.width / 2 - cardRect.width / 2;
        top = rect.bottom + margin;
        break;
    }
    // Clamp to viewport
    left = Math.max(12, Math.min(window.innerWidth - cardRect.width - 12, left));
    top = Math.max(12, Math.min(window.innerHeight - cardRect.height - 12, top));
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  } else {
    // No target — center the card
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%)';
  }

  // Wire buttons
  card.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wt]');
    if (!btn) return;
    const action = btn.dataset.wt;
    if (action === 'next') {
      if (index === total - 1) {
        endWalkthrough();
        markTutorialSeen();
        toast('Tutorial complete. Explore on your own!', 'success');
      } else {
        showStep(index + 1);
      }
    } else if (action === 'back') {
      showStep(index - 1);
    } else if (action === 'skip') {
      endWalkthrough();
      markTutorialSeen();
    }
  });

  // Keyboard nav
  const keyHandler = (e) => {
    if (e.key === 'Escape') { endWalkthrough(); markTutorialSeen(); document.removeEventListener('keydown', keyHandler); }
    else if (e.key === 'ArrowRight' && index < total - 1) { showStep(index + 1); document.removeEventListener('keydown', keyHandler); }
    else if (e.key === 'ArrowLeft' && index > 0) { showStep(index - 1); document.removeEventListener('keydown', keyHandler); }
  };
  document.addEventListener('keydown', keyHandler);

  // Recompute on resize / scroll
  const recompute = () => {
    if (!document.getElementById('__walkthroughLayer')) return;
    document.removeEventListener('scroll', recompute, true);
    window.removeEventListener('resize', recompute);
    showStep(state.activeWalkthrough?.current ?? 0);
  };
  document.addEventListener('scroll', recompute, true);
  window.addEventListener('resize', recompute);
}

function removeStep() {
  document.getElementById('__walkthroughLayer')?.remove();
  document.querySelectorAll('.walkthrough-card').forEach(n => n.remove());
}

function endWalkthrough() {
  removeStep();
  state.activeWalkthrough = null;
}

/* ---------------- Help Center ---------------- */

const HELP_TOPICS = [
  {
    id: 'home',
    icon: 'home',
    title: 'Get started with DocuScan Pro',
    sub: 'Overview of the four main workflows and the Home screen.',
    tags: ['home', 'start', 'overview', 'workflow'],
    workspace: 'home',
    purpose: 'Understand what DocuScan Pro does and where to begin.',
    prerequisites: 'A web browser. No account required.',
    steps: [
      { title: 'Welcome', body: 'DocuScan Pro is a browser-based tool for scanning documents, creating PDFs, signing them, and organizing files locally. Everything stays on your device.' },
      { title: 'Home screen', body: 'When you open the app you land on the Home screen. It shows four prominent workflow cards: <strong>Studio</strong>, <strong>Sign</strong>, <strong>PDF Tools</strong>, and <strong>Library</strong>.' },
      { title: 'Quick start list', body: 'Below the four cards, a Quick start list lets you jump directly into the most common tasks: scanning, signing, or opening a saved document.' },
      { title: 'Bottom navigation', body: 'The bar pinned to the bottom of every screen has six icons: <strong>Home</strong>, <strong>Studio</strong>, <strong>Sign</strong>, <strong>Tools</strong>, <strong>Library</strong>, and <strong>Help</strong>. Use it to switch workspaces at any time.' },
    ],
    troubleshooting: 'If you don\'t see the four cards, you may have scrolled — try scrolling up or pressing Home in the bottom navigation.',
    related: ['studio-scan', 'sign-pdf', 'pdf-tools-merge', 'library-overview'],
  },
  {
    id: 'studio-scan',
    icon: 'camera',
    title: 'Scan or import a document',
    sub: 'Capture with your camera or import existing images, then build a PDF.',
    tags: ['studio', 'scan', 'camera', 'import', 'capture', 'image'],
    workspace: 'studio',
    purpose: 'Turn paper documents or existing images into clean PDF files.',
    prerequisites: 'A camera-equipped device (for capture) or images on your device.',
    steps: [
      { title: 'Open Studio', body: 'Tap <strong>Studio</strong> in the bottom navigation, or the Studio card on the Home screen.' },
      { title: 'Capture with camera', body: 'Tap <strong>"Capture with camera"</strong>. Your browser will request camera permission. On phones, the rear camera is preferred. Capture a page; tap to retake if needed.' },
      { title: 'Or import images', body: 'Tap <strong>"Import images"</strong> to choose existing image files (JPG, PNG). You can select multiple files at once.' },
      { title: 'Review thumbnails', body: 'Captured or imported pages appear in the Pages strip as numbered thumbnails. Tap a thumbnail to select it. Selected pages are outlined in blue.' },
      { title: 'Rotate, reorder, delete', body: 'Use <strong>Rotate</strong>, <strong>‹ Move left</strong>, <strong>Move right ›</strong>, or <strong>Delete</strong> on the selected page. <strong>Clear all</strong> empties the strip.' },
      { title: 'Enhance', body: 'Pick a preset (Auto, Grayscale, B&W, Brighten, Contrast+), optionally adjust Brightness / Contrast sliders, then tap <strong>Apply to selected page</strong>. The original is preserved — <strong>Reset</strong> restores it.' },
      { title: 'Run OCR (optional)', body: 'Tap <strong>Run OCR</strong> on the selected page to recognize text using Tesseract.js. The first run may take longer while the engine initializes. Recognized text appears in the textarea and can be copied or downloaded as .txt.' },
      { title: 'Create the PDF', body: 'Choose page size (Letter, A4, or Fit-to-image) and orientation (Auto, Portrait, Landscape), then tap <strong>Create PDF</strong>. The PDF is saved to your Library automatically.' },
      { title: 'Hand off', body: 'Use <strong>Send to Sign ›</strong> or <strong>Send to PDF Tools ›</strong> to continue working on the new PDF without leaving the app.' },
    ],
    troubleshooting: 'If the camera doesn\'t open, check browser permissions (Settings → Privacy → Camera) and confirm you\'re on HTTPS. As a fallback, use Import images to pick a photo from your camera roll.',
    related: ['studio-enhance', 'studio-ocr', 'create-pdf', 'library-overview'],
  },
  {
    id: 'studio-enhance',
    icon: 'sun',
    title: 'Enhance image quality',
    sub: 'Brighten, sharpen, convert to grayscale or black-and-white.',
    tags: ['studio', 'enhance', 'brightness', 'contrast', 'grayscale', 'bw', 'black and white'],
    workspace: 'studio',
    purpose: 'Improve readability of scanned or photographed pages.',
    prerequisites: 'At least one page loaded in Studio.',
    steps: [
      { title: 'Select a page', body: 'Tap the thumbnail of the page you want to improve. A blue outline confirms the selection.' },
      { title: 'Choose a preset', body: 'Tap one of the chips in the Enhancement section: <strong>Original</strong>, <strong>Auto</strong>, <strong>Grayscale</strong>, <strong>B&W</strong>, <strong>Brighten</strong>, or <strong>Contrast+</strong>.' },
      { title: 'Fine-tune (optional)', body: 'Drag the <strong>Brightness</strong> and <strong>Contrast</strong> sliders. The numbers update live (-100 to +100).' },
      { title: 'Apply', body: 'Tap <strong>Apply to selected page</strong>. The thumbnail updates to reflect the changes.' },
      { title: 'Reset', body: 'Tap <strong>Reset</strong> to restore the original image. The original canvas is preserved, so this is always safe.' },
    ],
    troubleshooting: 'If the thumbnail doesn\'t change after Apply, make sure a page is selected (blue outline) before tapping Apply. If the colors look wrong, try Original to revert.',
    related: ['studio-scan', 'studio-ocr', 'create-pdf'],
  },
  {
    id: 'studio-ocr',
    icon: 'text',
    title: 'Recognize text with OCR',
    sub: 'Extract searchable, copyable text from scanned pages.',
    tags: ['studio', 'ocr', 'tesseract', 'text', 'recognize', 'recognize text', 'extract'],
    workspace: 'studio',
    purpose: 'Turn scanned images into editable, searchable text.',
    prerequisites: 'A scanned page with printed text. Handwriting is not well supported.',
    steps: [
      { title: 'Select a page', body: 'Tap a thumbnail in the Pages strip.' },
      { title: 'Run OCR', body: 'Tap <strong>Run OCR</strong>. The status badge shows "Working…" while Tesseract.js initializes and processes the page.' },
      { title: 'Watch the progress bar', body: 'A progress bar appears below the Run OCR button. On the first run it may pause while the language model downloads (a few MB).' },
      { title: 'Review recognized text', body: 'When complete, the recognized text appears in the textarea. It may include minor errors — OCR is never perfect.' },
      { title: 'Copy or download', body: 'Tap <strong>Copy text</strong> to copy to the clipboard, or <strong>Download .txt</strong> to save a text file.' },
    ],
    troubleshooting: 'If OCR returns "(No text recognized.)", try a higher-resolution scan, sharper lighting, or convert the image to B&W first. The first run can take 10-20 seconds while assets load; later runs are faster.',
    related: ['studio-scan', 'studio-enhance', 'create-pdf'],
  },
  {
    id: 'create-pdf',
    icon: 'pdf',
    title: 'Create a PDF from pages',
    sub: 'Combine images into a single PDF with the page size you want.',
    tags: ['studio', 'pdf', 'create', 'build', 'letter', 'a4', 'page size'],
    workspace: 'studio',
    purpose: 'Assemble one or more images into a single PDF document.',
    prerequisites: 'At least one page loaded in Studio.',
    steps: [
      { title: 'Choose page size', body: 'In the Create PDF section, pick <strong>Letter (8.5×11")</strong>, <strong>A4 (210×297mm)</strong>, or <strong>Fit to image</strong>.' },
      { title: 'Choose orientation', body: 'Pick <strong>Auto</strong> (uses each image\'s aspect ratio), <strong>Portrait</strong>, or <strong>Landscape</strong>.' },
      { title: 'Create PDF', body: 'Tap <strong>Create PDF</strong>. The PDF is built with pdf-lib and saved to your Library automatically. A toast confirms the save.' },
      { title: 'Hand off', body: 'Optionally tap <strong>Send to Sign ›</strong> or <strong>Send to PDF Tools ›</strong> to continue working.' },
    ],
    troubleshooting: 'If Create PDF is disabled, add at least one page first. If the button shows a spinner forever, the network may be slow loading pdf-lib — try again in a moment.',
    related: ['studio-scan', 'sign-pdf', 'library-overview'],
  },
  {
    id: 'sign-pdf',
    icon: 'pen',
    title: 'Sign a PDF document',
    sub: 'Open an existing PDF and add your signature, then download.',
    tags: ['sign', 'signature', 'draw', 'type', 'pen', 'sign', 'ink'],
    workspace: 'sign',
    purpose: 'Add your signature to an existing PDF.',
    prerequisites: 'A PDF file on your device.',
    steps: [
      { title: 'Open the PDF', body: 'Tap <strong>Open PDF from Files</strong> at the top of the left sidebar in the Sign workspace. Choose a PDF. It loads in the preview on the right.' },
      { title: 'Create a signature', body: 'Tap the <strong>Signature</strong> button (one of the six editing buttons in two rows of three). A sheet slides up with two tabs: <strong>Draw</strong> and <strong>Type</strong>.' },
      { title: 'Draw or type', body: 'In <strong>Draw</strong> mode, sign with your finger, Apple Pencil, or mouse on the signature pad. In <strong>Type</strong> mode, enter your name and pick a font style.' },
      { title: 'Insert', body: 'Tap <strong>Insert signature</strong>. The signature is placed at the center of the current page as a movable overlay.' },
      { title: 'Move and resize', body: 'Click the signature to select it (blue border + resize dot appears). Drag the body to move; drag the blue dot in the bottom-right corner to scale.' },
      { title: 'Download', body: 'When you\'re happy, tap <strong>Download PDF</strong> to save the signed PDF to your device. Use <strong>Save to Library</strong> if you want to keep it in the app for later.' },
    ],
    troubleshooting: 'If the signature doesn\'t appear, check that you\'re on the correct page (use the page navigation bar). If the overlay shows the wrong color, set the Ink color before inserting.',
    related: ['sign-text', 'sign-date', 'sign-watermark', 'library-overview'],
  },
  {
    id: 'sign-text',
    icon: 'text',
    title: 'Add text to a PDF',
    sub: 'Insert custom text or use Quick Text Templates.',
    tags: ['sign', 'text', 'typed signature', 'template', 'font', 'font size', 'approved'],
    workspace: 'sign',
    purpose: 'Add typed text or reusable phrases to a PDF.',
    prerequisites: 'A PDF open in the Sign workspace.',
    steps: [
      { title: 'Type your text', body: 'In the <strong>Text / typed signature</strong> field, type the text you want to insert. Or pick from <strong>Quick Text Templates</strong> (Approved, Received, Paid, Confidential, Draft, Final, For Review).' },
      { title: 'Choose font', body: 'Pick a <strong>Font style</strong> (Helvetica, Times Roman, Courier, etc.) and a <strong>Font size</strong> in points. This controls the text inside the PDF, not the interface.' },
      { title: 'Pick ink color', body: 'Use the <strong>Ink color</strong> color picker. The color you pick is the color of the text in the final PDF.' },
      { title: 'Insert', body: 'Tap the <strong>Text</strong> editing button to insert at the page center, OR click directly on the preview canvas to drop the text exactly where you clicked.' },
      { title: 'Move and resize', body: 'Click the text element to select it. Drag the body to reposition; drag the blue dot in the bottom-right corner to scale.' },
    ],
    troubleshooting: 'If nothing happens when you click on the page, make sure the <strong>Text / typed signature</strong> field isn\'t empty — type something first. If the ink color doesn\'t match, set the color before inserting.',
    related: ['sign-pdf', 'sign-date', 'sign-watermark'],
  },
  {
    id: 'sign-date',
    icon: 'calendar',
    title: 'Insert the current date',
    sub: 'Add today\'s date to a PDF in one tap.',
    tags: ['sign', 'date', 'today', 'insert date'],
    workspace: 'sign',
    purpose: 'Stamp the current date onto a PDF.',
    prerequisites: 'A PDF open in the Sign workspace.',
    steps: [
      { title: 'Pick font and color', body: 'Set the <strong>Font style</strong>, <strong>Font size</strong>, and <strong>Ink color</strong> as you want the date to appear.' },
      { title: 'Tap Date', body: 'Tap the <strong>Date</strong> button (one of the six editing buttons). Today\'s date is inserted near the bottom of the current page.' },
      { title: 'Move if needed', body: 'Click the date text to select it, then drag to move it to your preferred position.' },
    ],
    troubleshooting: 'The date is generated by your browser\'s locale. If the format isn\'t what you want, type your own date into the Text field instead and use the Text button.',
    related: ['sign-pdf', 'sign-text', 'sign-watermark'],
  },
  {
    id: 'sign-watermark',
    icon: 'watermark',
    title: 'Add a watermark to a PDF',
    sub: 'Stamp DRAFT, CONFIDENTIAL, or any text across all pages.',
    tags: ['sign', 'watermark', 'draft', 'confidential', 'opacity', 'diagonal', 'horizontal'],
    workspace: 'sign',
    purpose: 'Apply a text watermark to every page of a PDF.',
    prerequisites: 'A PDF open in the Sign workspace.',
    steps: [
      { title: 'Configure the watermark', body: 'In the Watermark section: set <strong>Watermark text</strong> (default DRAFT), pick <strong>Direction</strong> (Diagonal ↗ or Horizontal), and set <strong>Opacity</strong> (0-100%).' },
      { title: 'Insert', body: 'Tap <strong>Insert</strong>. The watermark is applied across ALL pages of the document. A badge confirms "Watermark applied".' },
      { title: 'Verify', body: 'The displayed opacity value matches the actual opacity baked into the PDF.' },
      { title: 'Remove', body: 'Tap <strong>Remove watermark</strong> to revert. (Note: this currently reverts to the originally-loaded PDF and discards other edits added after the watermark.)' },
    ],
    troubleshooting: 'If the watermark is invisible, increase the Opacity. At 0% it\'s fully transparent. At 100% it\'s solid gray text.',
    related: ['sign-pdf', 'sign-text', 'pdf-tools-watermark'],
  },
  {
    id: 'sign-undo-redo',
    icon: 'undo',
    title: 'Undo, Redo, and Remove Selected',
    sub: 'Correct mistakes and remove individual elements.',
    tags: ['sign', 'undo', 'redo', 'remove', 'history', 'mistake'],
    workspace: 'sign',
    purpose: 'Revert changes and clean up unwanted elements.',
    prerequisites: 'A PDF open in the Sign workspace.',
    steps: [
      { title: 'Undo', body: 'Tap <strong>Undo</strong> (one of the six editing buttons, bottom row). Each press reverts to the previous state in the history stack.' },
      { title: 'Redo', body: 'Tap <strong>Redo</strong> to re-apply a change you just undid. The Redo stack clears when you make a new edit.' },
      { title: 'Remove Selected', body: 'Tap an element on the canvas to select it (blue border + resize dot). Then tap <strong>Remove Selected</strong> to delete it.' },
    ],
    troubleshooting: 'If Undo is disabled, you\'re at the bottom of the history stack. If Remove Selected is disabled, no element is currently selected — click on one first.',
    related: ['sign-pdf', 'sign-text', 'sign-watermark'],
  },
  {
    id: 'sign-export',
    icon: 'download',
    title: 'Save, download, share, and print',
    sub: 'Four export actions available across Studio, Sign, and PDF Tools.',
    tags: ['export', 'save', 'download', 'share', 'print', 'library', 'web share'],
    workspace: 'sign',
    purpose: 'Understand the four consistent export actions and when to use each.',
    prerequisites: 'A document ready to export.',
    steps: [
      { title: 'Save to Library', body: 'Stores the document in the app\'s local IndexedDB library. Use this when you want to come back to the document later from inside DocuScan Pro.' },
      { title: 'Download PDF', body: 'Triggers a browser download of the PDF file to your device. The file lands in your normal Downloads folder.' },
      { title: 'Share PDF', body: 'Uses the native Web Share API on supporting devices (mobile Safari, Chrome on Android). On desktop or unsupported browsers, it falls back to a download automatically.' },
      { title: 'Print PDF', body: 'Opens the browser\'s print dialog in a hidden iframe so you don\'t lose your place in the app. Choose your printer and paper as usual.' },
    ],
    troubleshooting: 'If Share doesn\'t show the system sheet, your browser doesn\'t support Web Share API for files — use Download instead. Print may pop a blocker; allow pop-ups for the app.',
    related: ['sign-pdf', 'library-overview', 'pdf-tools-merge'],
  },
  {
    id: 'pdf-tools-merge',
    icon: 'merge',
    title: 'Merge two or more PDFs',
    sub: 'Combine multiple PDFs into one document.',
    tags: ['tools', 'merge', 'combine', 'join', 'concatenate'],
    workspace: 'tools',
    purpose: 'Combine several PDFs into a single file.',
    prerequisites: 'Two or more PDF files on your device.',
    steps: [
      { title: 'Open the primary PDF', body: 'In PDF Tools, tap <strong>Open PDF</strong>. This is File A — the base document.' },
      { title: 'Open a second PDF', body: 'Tap <strong>Open 2nd PDF (for merge)</strong>. This is File B.' },
      { title: 'Select Merge', body: 'Tap the <strong>Merge</strong> tab in the Operation row.' },
      { title: 'Choose order', body: 'Pick <strong>Append second PDF</strong> (B comes after A) or <strong>Prepend second PDF</strong> (B comes before A).' },
      { title: 'Run', body: 'Tap <strong>Run</strong>. The merged PDF appears in the Preview area.' },
      { title: 'Export', body: 'Use <strong>Save to Library</strong>, <strong>Download</strong>, <strong>Share</strong>, or <strong>Print</strong> at the bottom of the card.' },
    ],
    troubleshooting: 'If Run is disabled, you haven\'t loaded both PDFs yet. Open PDF = File A, Open 2nd PDF = File B.',
    related: ['pdf-tools-split', 'pdf-tools-rotate', 'library-overview'],
  },
  {
    id: 'pdf-tools-split',
    icon: 'split',
    title: 'Split a PDF by page ranges',
    sub: 'Divide a multipage PDF into separate files.',
    tags: ['tools', 'split', 'divide', 'page range', 'extract pages'],
    workspace: 'tools',
    purpose: 'Extract specific pages or ranges from a PDF.',
    prerequisites: 'A PDF with multiple pages.',
    steps: [
      { title: 'Open the PDF', body: 'Tap <strong>Open PDF</strong> in PDF Tools.' },
      { title: 'Select Split', body: 'Tap the <strong>Split</strong> tab.' },
      { title: 'Enter ranges', body: 'Type page ranges in the format <code>1-3,5,8-10</code>. Spaces around the dashes are optional. The total page count is shown for reference.' },
      { title: 'Run', body: 'Tap <strong>Run</strong>. The first split file appears in the Preview area; additional files are saved to your Library automatically with names like "Split part 2".' },
      { title: 'Export', body: 'Use Save / Download / Share / Print for the first file. Additional parts are already in your Library.' },
    ],
    troubleshooting: 'If you see "Range X-Y out of bounds", check the total page count shown in the panel. Ranges are 1-indexed and must satisfy 1 ≤ from ≤ to ≤ total.',
    related: ['pdf-tools-merge', 'pdf-tools-rotate', 'pdf-tools-reorder'],
  },
  {
    id: 'pdf-tools-rotate',
    icon: 'rotate',
    title: 'Rotate PDF pages',
    sub: 'Rotate every page by 90°, 180°, or 270°.',
    tags: ['tools', 'rotate', 'turn', 'orientation', '90', '180', '270'],
    workspace: 'tools',
    purpose: 'Fix pages that are sideways or upside down.',
    prerequisites: 'A PDF open in PDF Tools.',
    steps: [
      { title: 'Open the PDF', body: 'Tap <strong>Open PDF</strong> in PDF Tools.' },
      { title: 'Select Rotate', body: 'Tap the <strong>Rotate</strong> tab.' },
      { title: 'Pick angle', body: 'Tap <strong>90°</strong>, <strong>180°</strong>, or <strong>270°</strong>. Rotation is applied cumulatively on top of the existing orientation.' },
      { title: 'Run + Export', body: 'Tap <strong>Run</strong> to apply, then use Save / Download / Share / Print.' },
    ],
    troubleshooting: 'Rotation applies to ALL pages in the document. If you need to rotate only specific pages, split first, rotate the part, then merge.',
    related: ['pdf-tools-merge', 'pdf-tools-split', 'pdf-tools-reorder'],
  },
  {
    id: 'pdf-tools-reorder',
    icon: 'reorder',
    title: 'Reorder PDF pages',
    sub: 'Rearrange pages into a new sequence.',
    tags: ['tools', 'reorder', 'rearrange', 'move pages', 'sequence', 'order'],
    workspace: 'tools',
    purpose: 'Change the page order of a multipage PDF.',
    prerequisites: 'A multipage PDF open in PDF Tools.',
    steps: [
      { title: 'Open the PDF', body: 'Tap <strong>Open PDF</strong> in PDF Tools.' },
      { title: 'Select Reorder', body: 'Tap the <strong>Reorder</strong> tab.' },
      { title: 'Enter new order', body: 'Type a comma-separated list of the new page positions, 1-indexed. For a 3-page PDF, "3,1,2" moves page 3 to position 1, page 1 to position 2, and page 2 to position 3. The placeholder shows the default order.' },
      { title: 'Run + Export', body: 'Tap <strong>Run</strong>, then Save / Download / Share / Print.' },
    ],
    troubleshooting: 'The list must be a complete permutation. For 3 pages you need exactly 3 unique numbers from 1-3. Duplicates or missing numbers will be rejected.',
    related: ['pdf-tools-rotate', 'pdf-tools-split', 'pdf-tools-merge'],
  },
  {
    id: 'pdf-tools-annotate-text',
    icon: 'text',
    title: 'Annotate a PDF with text',
    sub: 'Add typed annotations like "Reviewed by J.S." to a chosen page.',
    tags: ['tools', 'annotate', 'text annotation', 'reviewed', 'note', 'comment'],
    workspace: 'tools',
    purpose: 'Add text annotations to PDF pages.',
    prerequisites: 'A PDF open in PDF Tools.',
    steps: [
      { title: 'Open the PDF', body: 'Tap <strong>Open PDF</strong> in PDF Tools.' },
      { title: 'Select Annotate', body: 'Tap the <strong>Annotate</strong> tab. Two sub-tabs appear: <strong>Text</strong> and <strong>Draw</strong>.' },
      { title: 'Stay in Text mode', body: 'The Text sub-tab is active by default.' },
      { title: 'Set page + text', body: 'Pick the <strong>Page</strong> number and type the annotation <strong>Text</strong> (e.g. "Reviewed by J.S.").' },
      { title: 'Position + color', body: 'Set <strong>Position X</strong> and <strong>Position Y</strong> as percentages (0-100), pick an <strong>Ink color</strong>, and a <strong>Font size</strong> in points.' },
      { title: 'Run + Export', body: 'Tap <strong>Run</strong> to bake the annotation into the PDF, then Save / Download / Share / Print.' },
    ],
    troubleshooting: 'If Run is disabled, type some text first. The annotation appears at the chosen X/Y position (0,0 = top-left; 100,100 = bottom-right).',
    related: ['pdf-tools-annotate-draw', 'pdf-tools-watermark', 'sign-text'],
  },
  {
    id: 'pdf-tools-annotate-draw',
    icon: 'pen',
    title: 'Draw freehand on a PDF',
    sub: 'Circle, underline, or mark up a PDF with your finger, Apple Pencil, or mouse.',
    tags: ['tools', 'annotate', 'draw', 'apple pencil', 'finger', 'circle', 'freehand', 'sketch', 'markup'],
    workspace: 'tools',
    purpose: 'Add freehand drawings (circles, arrows, underlines) directly onto PDF pages.',
    prerequisites: 'A PDF open in PDF Tools, ideally with Preview loaded.',
    steps: [
      { title: 'Open the PDF', body: 'Tap <strong>Open PDF</strong> in PDF Tools. Wait for the page to render in the Preview area.' },
      { title: 'Select Annotate → Draw', body: 'Tap the <strong>Annotate</strong> tab, then the <strong>Draw</strong> sub-tab.' },
      { title: 'Choose pen settings', body: 'Pick the <strong>Page</strong> to draw on, choose a <strong>Pen color</strong>, and adjust <strong>Pen width</strong> (1-20).' },
      { title: 'Draw', body: 'Draw directly on the page preview with your finger, Apple Pencil, or mouse. Strokes appear in real time on the transparent overlay.' },
      { title: 'Clear (optional)', body: 'Tap <strong>Clear strokes</strong> to start over without affecting the underlying PDF.' },
      { title: 'Run + Export', body: 'Tap <strong>Run</strong> to bake the strokes into the PDF as a transparent PNG layer. Then use Save / Download / Share / Print.' },
    ],
    troubleshooting: 'If the draw canvas doesn\'t respond, make sure you\'re in the Draw sub-tab (not Text). The overlay sits exactly on top of the rendered page — strokes map 1:1 to PDF coordinates.',
    related: ['pdf-tools-annotate-text', 'pdf-tools-watermark', 'sign-pdf'],
  },
  {
    id: 'pdf-tools-watermark',
    icon: 'watermark',
    title: 'Apply a watermark in PDF Tools',
    sub: 'Same as the Sign workspace watermark, but accessed via PDF Tools.',
    tags: ['tools', 'watermark', 'draft', 'confidential', 'opacity'],
    workspace: 'tools',
    purpose: 'Apply a text watermark across all pages of a PDF.',
    prerequisites: 'A PDF open in PDF Tools.',
    steps: [
      { title: 'Open the PDF', body: 'Tap <strong>Open PDF</strong> in PDF Tools.' },
      { title: 'Select Watermark', body: 'Tap the <strong>Watermark</strong> tab.' },
      { title: 'Configure', body: 'Set <strong>Watermark text</strong>, <strong>Direction</strong> (Diagonal or Horizontal), and <strong>Opacity</strong> (0-100%).' },
      { title: 'Run + Export', body: 'Tap <strong>Run</strong>, then Save / Download / Share / Print.' },
    ],
    troubleshooting: 'Identical to the Sign workspace watermark. See "Add a watermark to a PDF" for more detail.',
    related: ['sign-watermark', 'pdf-tools-annotate-text'],
  },
  {
    id: 'pdf-tools-compare',
    icon: 'compare',
    title: 'Compare two PDFs side-by-side',
    sub: 'View File A and File B at the same scale for visual comparison.',
    tags: ['tools', 'compare', 'side by side', 'two pdfs', 'comparison', 'diff'],
    workspace: 'tools',
    purpose: 'Visually compare two PDFs without leaving the app.',
    prerequisites: 'Two PDF files on your device.',
    steps: [
      { title: 'Open File A', body: 'Tap <strong>Open PDF</strong> in PDF Tools. This is File A.' },
      { title: 'Open File B', body: 'Tap <strong>Open 2nd PDF (for merge)</strong>. This is File B.' },
      { title: 'Select Compare', body: 'Tap the <strong>Compare</strong> tab. The Preview area below shows two labeled panes.' },
      { title: 'Run', body: 'Tap <strong>Run</strong>. Both first pages render at 380px width in their labeled panes.' },
      { title: 'Compare', body: 'Scroll the page to see both side-by-side. On mobile (below 768px), the panes stack vertically.' },
    ],
    troubleshooting: 'Compare is view-only — it doesn\'t modify either PDF. To produce a merged file, use the Merge tab instead.',
    related: ['pdf-tools-merge', 'library-overview'],
  },
  {
    id: 'library-overview',
    icon: 'library',
    title: 'Use the document Library',
    sub: 'Local storage, open / rename / delete saved documents.',
    tags: ['library', 'storage', 'indexeddb', 'saved', 'documents', 'rename', 'delete'],
    workspace: 'library',
    purpose: 'Manage documents saved locally in your browser.',
    prerequisites: 'None. The Library is always available.',
    steps: [
      { title: 'Open Library', body: 'Tap <strong>Library</strong> in the bottom navigation. Saved documents appear as cards with a thumbnail of the first page, name, page count, size, and modification date.' },
      { title: 'Open in Sign', body: 'Tap <strong>Open in Sign</strong> on a card to load the document into the Sign workspace.' },
      { title: 'Open in Tools', body: 'Tap <strong>Tools</strong> on a card to load it into PDF Tools.' },
      { title: 'Rename', body: 'Tap <strong>Rename</strong>, type a new name, and confirm.' },
      { title: 'Delete', body: 'Tap <strong>Delete</strong> on a card. A confirmation prompt prevents accidental deletes.' },
      { title: 'Refresh', body: 'Tap <strong>Refresh</strong> to re-query IndexedDB if you\'ve saved from another workspace.' },
    ],
    troubleshooting: 'Browser-local storage is NOT cloud backup. If you clear site data, reset the browser, or remove storage, saved documents are lost. To be safe, use Download on important documents.',
    related: ['sign-export', 'home', 'studio-scan'],
  },
  {
    id: 'help-system',
    icon: 'help',
    title: 'Use the Help system',
    sub: 'Find topics, search, and restart the interactive tutorial.',
    tags: ['help', 'tutorial', 'walkthrough', 'search', 'guide', 'instructions'],
    workspace: 'help',
    purpose: 'Navigate the Help Center and restart walkthroughs.',
    prerequisites: 'None.',
    steps: [
      { title: 'Open Help', body: 'Tap <strong>Help</strong> in the bottom navigation.' },
      { title: 'Search', body: 'Use the search field at the top. Type "sign", "scan", "watermark", "merge", etc. Topics filter live as you type.' },
      { title: 'Open a topic', body: 'Tap any topic card to open the full illustrated article. Articles include Purpose, Prerequisites, numbered Steps, Troubleshooting, and Related topics.' },
      { title: 'Back', body: 'Tap <strong>‹ Back</strong> at the top of any article to return to the topic grid.' },
      { title: 'Restart tutorial', body: 'At the bottom of the Help workspace is a "Restart interactive tutorial" button. Tap it to replay the Home walkthrough from the beginning.' },
    ],
    troubleshooting: 'If search returns no results, try shorter keywords. The search matches against titles, subtitles, and tags.',
    related: ['home', 'studio-scan', 'sign-pdf', 'pdf-tools-merge'],
  },
  {
    id: 'troubleshooting',
    icon: 'warning',
    title: 'Troubleshooting common issues',
    sub: 'Camera, OCR, sharing, offline, and lost documents.',
    tags: ['troubleshooting', 'camera', 'ocr', 'share', 'offline', 'lost', 'permission'],
    workspace: 'help',
    purpose: 'Solve common problems quickly.',
    prerequisites: 'None.',
    steps: [
      { title: 'Camera doesn\'t open', body: 'Check browser permissions (Settings → Privacy → Camera). Confirm the site is on HTTPS. As a fallback, use Import images.' },
      { title: 'OCR is slow', body: 'The first run downloads the Tesseract language model (a few MB). Subsequent runs are faster and work offline once cached.' },
      { title: 'PDF won\'t open', body: 'Make sure it\'s not password-protected. DocuScan Pro can parse encrypted PDFs but cannot re-save them.' },
      { title: 'Sharing unavailable', body: 'Some browsers don\'t support the Web Share API for files. The app automatically falls back to a download.' },
      { title: 'Lost documents', body: 'Browser-local storage is not cloud backup. Clearing site data, resetting the browser, or removing storage deletes saved documents. Always Download important files.' },
      { title: 'Offline use', body: 'The app shell and all dependencies are cached by the service worker. OCR, PDF preview, and PDF editing all work offline once the assets are cached.' },
    ],
    troubleshooting: 'For anything else, restart your browser. If problems persist, the app may have been updated — refresh to grab the latest version.',
    related: ['home', 'library-overview'],
  },
  {
    id: 'privacy',
    icon: 'lock',
    title: 'Privacy and local storage',
    sub: 'What stays on your device, what doesn\'t, and how to back up.',
    tags: ['privacy', 'security', 'local', 'storage', 'indexeddb', 'backup', 'offline'],
    workspace: 'help',
    purpose: 'Understand exactly what happens to your documents.',
    prerequisites: 'None.',
    steps: [
      { title: 'Local-first', body: 'Documents are processed in your browser and stored in IndexedDB on your device.' },
      { title: 'No uploads', body: 'Nothing in the application transmits document content to any server.' },
      { title: 'OCR on-device', body: 'Tesseract.js runs entirely on-device once the language model is cached. First run downloads it from the official Tesseract data CDN.' },
      { title: 'File validation', body: 'Images are type- and size-validated before processing. PDFs are validated by checking the %PDF- magic bytes before parsing.' },
      { title: 'No cloud backup', body: 'Clearing site data, resetting the browser, or removing storage deletes saved documents. Use Download to save copies.' },
    ],
    troubleshooting: 'To check storage usage, open your browser\'s DevTools → Application → Storage. To clear all app data, use Clear site data — but back up first.',
    related: ['library-overview', 'troubleshooting'],
  },
];

/* ---------------- Walkthrough definitions ---------------- */
/* Each step.target is a CSS selector verified against index.html. */

const WALKTHROUGHS = {
  home: {
    id: 'home',
    steps: [
      { workspace: 'home', selector: null, title: 'Welcome to DocuScan Pro', body: 'This short tour will show you the four main workflows. You can exit at any time with the Skip button or by pressing Escape.', placement: 'center' },
      { workspace: 'home', selector: '.workflow-card--studio', title: 'Studio', body: 'Use <strong>Studio</strong> to scan documents with your camera, import existing photos, enhance them, optionally run OCR, and create PDFs.', placement: 'right' },
      { workspace: 'home', selector: '.workflow-card--sign', title: 'Sign', body: 'Use <strong>Sign</strong> to add signatures, typed text, dates, and watermarks to an existing PDF.', placement: 'right' },
      { workspace: 'home', selector: '.workflow-card--tools', title: 'PDF Tools', body: 'Use <strong>PDF Tools</strong> to merge, split, rotate, reorder, annotate, and watermark PDF documents.', placement: 'right' },
      { workspace: 'home', selector: '.workflow-card--library', title: 'Library', body: 'Use <strong>Library</strong> to access documents you\'ve saved. They\'re stored locally in your browser — never uploaded.', placement: 'right' },
      { workspace: 'home', selector: '.bottom-nav__item[data-goto="help"]', title: 'Help is always one tap away', body: 'Tap <strong>Help</strong> in the bottom navigation at any time to open this illustrated guide and search for any feature.', placement: 'top' },
    ],
  },
  studio: {
    id: 'studio',
    steps: [
      { workspace: 'studio', selector: null, title: 'Document Studio', body: 'Build a PDF from camera captures or imported images. Enhance, OCR, then export.', placement: 'center' },
      { workspace: 'studio', selector: '#btnCaptureCamera', title: 'Capture with camera', body: 'Tap to open your device\'s camera. Browser will ask permission. Capture multiple pages for a multipage document.', placement: 'bottom' },
      { workspace: 'studio', selector: '#btnImportImages', title: 'Or import images', body: 'Tap to pick existing photos from your device. Multi-select is supported.', placement: 'bottom' },
      { workspace: 'studio', selector: '#studioThumbs', title: 'Pages strip', body: 'Captured or imported pages appear here as numbered thumbnails. Tap one to select it. Use the buttons below to rotate, delete, or reorder.', placement: 'bottom' },
      { workspace: 'studio', selector: '#enhancePresets', title: 'Enhancement', body: 'Pick a preset (Auto, Grayscale, B&W, Brighten, Contrast+) and optionally fine-tune with the sliders. Tap Apply to selected page to commit. Reset always restores the original.', placement: 'bottom' },
      { workspace: 'studio', selector: '#btnRunOcr', title: 'OCR (optional)', body: 'Tap Run OCR on the selected page to recognize text with Tesseract.js. First run is slower while the engine initializes.', placement: 'bottom' },
      { workspace: 'studio', selector: '#btnCreatePdf', title: 'Create PDF', body: 'Pick a page size and orientation, then tap Create PDF. The PDF is saved to your Library automatically. Use Send to Sign › / Send to PDF Tools › to continue working.', placement: 'bottom' },
    ],
  },
  sign: {
    id: 'sign',
    steps: [
      { workspace: 'sign', selector: null, title: 'Add Text & Sign', body: 'Open a PDF and add signatures, text, dates, and watermarks. Drag elements to position them.', placement: 'center' },
      { workspace: 'sign', selector: '#btnOpenPdfSign', title: 'Open PDF', body: 'Tap <strong>Open PDF from Files</strong> to load a PDF document into the preview on the right.', placement: 'right' },
      { workspace: 'sign', selector: '#pageNav', title: 'Page navigation', body: 'Use <strong>‹</strong> and <strong>›</strong> to move between pages. The label shows the current page and total. Disabled when there\'s no document.', placement: 'right' },
      { workspace: 'sign', selector: '#btnAddSignature', title: 'Signature', body: 'Tap <strong>Signature</strong> to open the signature sheet. Draw with your finger or Apple Pencil, or type your name in a chosen font.', placement: 'right' },
      { workspace: 'sign', selector: '#btnAddText', title: 'Text', body: 'Type into the <strong>Text / typed signature</strong> field, then tap Text to insert. Or click directly on the preview to drop the text exactly where you clicked.', placement: 'right' },
      { workspace: 'sign', selector: '#btnAddDate', title: 'Date', body: 'Tap <strong>Date</strong> to insert today\'s date near the bottom of the current page.', placement: 'right' },
      { workspace: 'sign', selector: '#btnUndo', title: 'Undo / Redo / Remove', body: 'Use <strong>Undo</strong> and <strong>Redo</strong> to navigate the edit history. <strong>Remove Selected</strong> deletes the currently-selected element on the canvas.', placement: 'right' },
      { workspace: 'sign', selector: '#fontFamily', title: 'Font + size + color', body: 'Set Font style, Font size (in points), and Ink color BEFORE inserting. These control the text inside the PDF, not the interface.', placement: 'right' },
      { workspace: 'sign', selector: '#wmText', title: 'Watermark', body: 'Set watermark text, direction (Diagonal or Horizontal), and opacity (0-100%), then tap Insert. The watermark applies to ALL pages.', placement: 'right' },
      { workspace: 'sign', selector: '#btnSaveToLibrary', title: 'Export', body: 'Four actions: <strong>Save to Library</strong> (IndexedDB), <strong>Download PDF</strong> (browser), <strong>Share PDF</strong> (Web Share API), <strong>Print PDF</strong> (browser print).', placement: 'right' },
    ],
  },
  tools: {
    id: 'tools',
    steps: [
      { workspace: 'tools', selector: null, title: 'PDF Tools', body: 'Modify existing PDFs: merge, split, rotate, reorder, annotate (text or freehand draw), and watermark.', placement: 'center' },
      { workspace: 'tools', selector: '#btnOpenPdfTools', title: 'Open PDF (File A)', body: 'Tap <strong>Open PDF</strong> to load the primary document.', placement: 'bottom' },
      { workspace: 'tools', selector: '#btnAddSecondPdf', title: 'Open 2nd PDF (File B)', body: 'For merge and compare, tap <strong>Open 2nd PDF</strong> to load a second file.', placement: 'bottom' },
      { workspace: 'tools', selector: '#toolsTabs', title: 'Operations', body: 'Tabs across the top: <strong>Merge</strong>, <strong>Split</strong>, <strong>Rotate</strong>, <strong>Reorder</strong>, <strong>Annotate</strong> (Text + Draw sub-tabs), <strong>Watermark</strong>, <strong>Compare</strong>.', placement: 'bottom' },
      { workspace: 'tools', selector: '#btnRunToolOp', title: 'Run + Preview + Export', body: 'Configure the operation, tap <strong>Run</strong>, then preview the result. Use Save / Download / Share / Print to export.', placement: 'bottom' },
    ],
  },
  library: {
    id: 'library',
    steps: [
      { workspace: 'library', selector: null, title: 'Document Library', body: 'Saved documents are stored locally in your browser via IndexedDB. They appear here as cards.', placement: 'center' },
      { workspace: 'library', selector: '#libraryGrid', title: 'Document cards', body: 'Each card shows a thumbnail of the first page, name, page count, file size, and modification date. Use the action buttons to open, rename, or delete.', placement: 'top' },
      { workspace: 'library', selector: '#btnRefreshLibrary', title: 'Refresh', body: 'Tap <strong>Refresh</strong> to re-query the database if you\'ve saved from another workspace and the list hasn\'t updated.', placement: 'top' },
    ],
  },
  help: {
    id: 'help',
    steps: [
      { workspace: 'help', selector: null, title: 'Help Center', body: 'Search for any feature, or browse illustrated topics below.', placement: 'center' },
      { workspace: 'help', selector: '.help-search__input', title: 'Search', body: 'Type to filter topics. Matches against titles, subtitles, and tags.', placement: 'bottom' },
      { workspace: 'help', selector: '.help-topics', title: 'Topic cards', body: 'Tap any card to open a full illustrated article with Purpose, Prerequisites, numbered Steps, Troubleshooting, and Related topics.', placement: 'top' },
    ],
  },
};

/* ---------------- Render Help Center ---------------- */

export function initHelpCenter() {
  const grid = document.getElementById('helpTopics');
  const search = document.getElementById('helpSearchInput');
  if (!grid) return;
  renderTopicGrid(HELP_TOPICS);
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.toLowerCase().trim();
      const filtered = q ? HELP_TOPICS.filter(t => matchTopic(t, q)) : HELP_TOPICS;
      renderTopicGrid(filtered);
    });
  }
  // Restart tutorial button
  const restartBtn = document.getElementById('btnRestartTutorial');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => startWalkthrough('home'));
  }
  // Per-page "Tour this page" buttons (one per workspace header)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tour]');
    if (!btn) return;
    e.preventDefault();
    const tourId = btn.dataset.tour;
    startWalkthrough(tourId);
  });
}

function matchTopic(topic, q) {
  const haystack = (topic.title + ' ' + topic.sub + ' ' + (topic.tags || []).join(' ')).toLowerCase();
  return q.split(/\s+/).every(word => haystack.includes(word));
}

function renderTopicGrid(topics) {
  const grid = document.getElementById('helpTopics');
  if (!grid) return;
  grid.innerHTML = '';
  if (topics.length === 0) {
    grid.innerHTML = `
      <div class="help-empty" style="grid-column:1/-1">
        <div class="help-empty__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <div class="empty-state__title">No topics found</div>
        <div class="empty-state__sub">Try different keywords.</div>
      </div>`;
    return;
  }
  for (const t of topics) {
    const card = document.createElement('button');
    card.className = 'help-topic';
    card.type = 'button';
    card.dataset.topicId = t.id;
    card.innerHTML = `
      <div class="help-topic__icon" aria-hidden="true">${ICON_SVG[t.icon] || ICON_SVG.help}</div>
      <h3 class="help-topic__title">${escapeHtml(t.title)}</h3>
      <p class="help-topic__sub">${escapeHtml(t.sub)}</p>
      <div class="help-topic__tags">
        ${(t.tags || []).slice(0, 3).map(tag => `<span class="badge badge--secondary">${escapeHtml(tag)}</span>`).join('')}
      </div>
    `;
    card.addEventListener('click', () => openArticle(t.id));
    grid.appendChild(card);
  }
}

function openArticle(id) {
  const t = HELP_TOPICS.find(x => x.id === id);
  if (!t) return;
  let article = document.getElementById('helpArticle');
  if (!article) {
    article = document.createElement('div');
    article.id = 'helpArticle';
    article.className = 'help-article';
    article.setAttribute('role', 'dialog');
    article.setAttribute('aria-modal', 'true');
    article.setAttribute('aria-labelledby', 'helpArticleTitle');
    document.body.appendChild(article);
  }
  article.innerHTML = `
    <div class="help-article__bar">
      <button class="help-article__back" type="button" id="helpArticleBack">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <h2 class="help-article__title" id="helpArticleTitle">${escapeHtml(t.title)}</h2>
    </div>
    <div class="help-article__body">
      <div class="help-article__section">
        <h3 class="help-article__section-title">Purpose</h3>
        <div class="help-article__section-body"><p>${escapeHtml(t.purpose)}</p></div>
      </div>
      <div class="help-article__section">
        <h3 class="help-article__section-title">What you need</h3>
        <div class="help-article__section-body"><p>${escapeHtml(t.prerequisites)}</p></div>
      </div>
      <div class="help-article__section">
        <h3 class="help-article__section-title">Steps</h3>
        ${t.steps.map((s, i) => `
          <div class="help-article__step">
            <div class="help-article__step-number">${i + 1}</div>
            <div class="help-article__step-body">
              <strong>${escapeHtml(s.title)}.</strong> ${s.body}
            </div>
          </div>
        `).join('')}
      </div>
      ${t.troubleshooting ? `
        <div class="help-article__section">
          <h3 class="help-article__section-title">Troubleshooting</h3>
          <div class="help-article__section-body"><p>${t.troubleshooting}</p></div>
        </div>
      ` : ''}
      ${t.related && t.related.length ? `
        <div class="help-article__related">
          <div class="help-article__related-title">Related topics</div>
          <div class="help-article__related-links">
            ${t.related.map(rid => {
              const r = HELP_TOPICS.find(x => x.id === rid);
              return r ? `<button class="help-article__related-link" data-related-id="${r.id}" type="button">${escapeHtml(r.title)}</button>` : '';
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
  article.classList.add('is-open');
  article.querySelector('#helpArticleBack').addEventListener('click', closeArticle);
  article.querySelectorAll('[data-related-id]').forEach(b => {
    b.addEventListener('click', () => openArticle(b.dataset.relatedId));
  });
  article.scrollTop = 0;
  // Esc to close
  const escHandler = (e) => { if (e.key === 'Escape') { closeArticle(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}

function closeArticle() {
  const article = document.getElementById('helpArticle');
  if (article) article.classList.remove('is-open');
}

/* ---------------- Contextual help (disabled per user request) ---------------- */
// The "?" help icons beside controls were found to be intrusive and caused
// layout issues with the editing buttons. They have been removed.
// All help content is now accessed via the Help Center in the Help workspace
// or via the per-page "Tour this page" button in each workspace header.
export function attachContextHelp() {
  // No-op — intentionally disabled.
  return;
}

/* ---------------- Utility ---------------- */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toast(msg, kind = '') {
  // Local toast helper — uses the same toast stack as app.js
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${kind ? 'toast--' + kind : ''}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 320);
  }, 3500);
}

/* ---------------- Icons ---------------- */

const ICON_SVG = {
  home: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9 9 9"/><path d="M5 10v11h14V10"/></svg>',
  camera: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  sun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  text: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  pdf: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  pen: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/><path d="M14.06 6.19l3.75 3.75"/></svg>',
  calendar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  watermark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 7l20 10M2 17L22 7"/></svg>',
  undo: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 1 3 7.7"/></svg>',
  download: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  merge: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v6m0 0a4 4 0 0 0 4 4h2a4 4 0 0 1 4 4v4M7 9a4 4 0 0 1 4-4h2"/></svg>',
  split: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-7 7M4 14v6h6M4 20l7-7"/></svg>',
  rotate: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  reorder: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  compare: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="7" height="14" rx="1"/><rect x="14" y="5" width="7" height="14" rx="1"/></svg>',
  library: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  help: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  lock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

export function getHelpTopics() { return HELP_TOPICS; }
export function getWalkthroughs() { return WALKTHROUGHS; }
