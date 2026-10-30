"""Generate the DocuScan Pro Release Overview PDF.

Page 1: App description (title, what it is, key features, version info).
Pages 2+: One screenshot per workspace, each with a short caption.

Output: /home/z/my-project/download/DocuScan-Pro-Overview.pdf
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from PIL import Image as PILImage

OUT = '/home/z/my-project/download/DocuScan-Pro-Overview.pdf'
SHOTS = Path('/home/z/my-project/download/screenshots/v740')

# Brand palette
BLUE = HexColor('#007AFF')
DARK = HexColor('#1C1C1E')
GRAY = HexColor('#8E8E93')
LIGHT_GRAY = HexColor('#F2F2F7')
SOFT_BORDER = HexColor('#E5E5EA')

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'TitleStyle', parent=styles['Title'],
    fontName='Helvetica-Bold', fontSize=28, leading=34,
    textColor=BLUE, alignment=TA_LEFT, spaceAfter=4,
)
subtitle_style = ParagraphStyle(
    'SubtitleStyle', parent=styles['Normal'],
    fontName='Helvetica', fontSize=14, leading=18,
    textColor=GRAY, alignment=TA_LEFT, spaceAfter=18,
)
h2_style = ParagraphStyle(
    'H2', parent=styles['Heading2'],
    fontName='Helvetica-Bold', fontSize=16, leading=20,
    textColor=DARK, alignment=TA_LEFT, spaceBefore=10, spaceAfter=6,
)
body_style = ParagraphStyle(
    'Body', parent=styles['Normal'],
    fontName='Helvetica', fontSize=11, leading=15,
    textColor=DARK, alignment=TA_LEFT, spaceAfter=6,
)
bullet_style = ParagraphStyle(
    'Bullet', parent=body_style,
    leftIndent=18, bulletIndent=4, spaceAfter=4,
)
caption_title_style = ParagraphStyle(
    'CaptionTitle', parent=styles['Heading3'],
    fontName='Helvetica-Bold', fontSize=14, leading=18,
    textColor=BLUE, alignment=TA_LEFT, spaceAfter=4,
)
caption_body_style = ParagraphStyle(
    'CaptionBody', parent=styles['Normal'],
    fontName='Helvetica', fontSize=11, leading=14,
    textColor=DARK, alignment=TA_LEFT, spaceAfter=4,
)


def scaled_image(path, max_w_in=6.5):
    """Return a ReportLab Image scaled to fit max_w_in inches wide,
    preserving aspect ratio."""
    if not Path(path).exists():
        return None
    with PILImage.open(path) as im:
        w_px, h_px = im.size
    aspect = h_px / w_px
    target_w = max_w_in * inch
    target_h = target_w * aspect
    # Cap height at 7.5 inches so it fits on one page with caption
    if target_h > 7.0 * inch:
        target_h = 7.0 * inch
        target_w = target_h / aspect
    return Image(path, width=target_w, height=target_h)


WORKSPACES = [
    {
        'title': 'Home',
        'screenshot': 'desktop-home.png',
        'caption': 'The Home workspace is the entry point. Three workflow cards route you to Studio (scan / OCR), Add Text & Sign (annotations), and PDF Tools (merge / split / rotate / watermark / OCR). The bottom navigation bar carries you between every workspace.',
    },
    {
        'title': 'Studio',
        'screenshot': 'desktop-studio-loaded.png',
        'caption': 'Studio captures or imports images, enhances them, optionally runs OCR, and assembles them into a PDF. The 2-column layout puts controls on the left and a live preview on the right with page navigation and an OCR result panel beneath it. Camera captures are stamped with a discreet date+time marker.',
    },
    {
        'title': 'Add Text & Sign',
        'screenshot': 'desktop-sign-loaded.png',
        'caption': 'Open a PDF and add signatures, text, dates, stamps, highlights, underlines, and strikethroughs. Drag elements on the preview to position them; undo / redo history tracks every change. Diagonal or horizontal watermarks apply across all pages.',
    },
    {
        'title': 'PDF Tools',
        'screenshot': 'desktop-tools-loaded.png',
        'caption': 'PDF Tools operates on existing PDFs: merge, split, split-by-size, rotate, reorder, delete pages, insert, crop, annotate (text or draw), watermark, image watermark, header/footer, bookmarks, metadata, forms, extract text, compress, protect, invert, to-image, compare, batch, undo/redo, and OCR.',
    },
    {
        'title': 'PDF Tools — OCR',
        'screenshot': 'desktop-tools-ocr-tab.png',
        'caption': 'Switching to the OCR tab renames the Run button to "Scan" and reveals a second preview pane below the main preview. After Scan completes, the recognized text appears with Copy / Download .txt / Read aloud actions. The Language and Pages selectors stay on the left.',
    },
    {
        'title': 'Library',
        'screenshot': 'desktop-library.png',
        'caption': 'The Library stores documents locally in your browser via IndexedDB. Searchable, with thumbnails, page counts, and actions to open, rename, move into folders, or delete. Nothing is ever uploaded to a server.',
    },
    {
        'title': 'Help',
        'screenshot': 'desktop-help.png',
        'caption': 'The Help workspace offers a searchable topic index and an interactive first-time walkthrough. The "Tour this page" button on each workspace highlights the key controls with contextual explanations.',
    },
]


def build():
    doc = SimpleDocTemplate(
        OUT, pagesize=LETTER,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        title='DocuScan Pro — Release Overview',
        author='DocuScan Pro',
        subject='Application overview and workspace screenshots',
        creator='DocuScan Pro',
    )

    story = []

    # ===== Page 1: App description =====
    story.append(Paragraph('DocuScan Pro', title_style))
    story.append(Paragraph('Local-first document scanning, editing, signing, and PDF tools. Version 7.4.1 — October 2026.', subtitle_style))

    story.append(Paragraph('What it is', h2_style))
    story.append(Paragraph(
        'DocuScan Pro is a Progressive Web App (PWA) for scanning, editing, signing, and '
        'manipulating PDF documents entirely in the browser. Documents stay on your device '
        '(IndexedDB) — nothing is uploaded to a server. The app works offline after first load '
        'and can be installed to the home screen on iOS, iPadOS, and Android.',
        body_style))

    story.append(Paragraph('Six workspaces', h2_style))
    workspaces_list = [
        '<b>Home</b> — entry hub with workflow cards routing to each workspace.',
        '<b>Studio</b> — capture via camera (with auto timestamp) or import images; enhance with presets and brightness/contrast sliders; run OCR (Tesseract.js); assemble into a PDF.',
        '<b>Add Text &amp; Sign</b> — open a PDF and add signatures, text, dates, stamps, highlights, underlines, and watermarks. Drag to position; undo/redo supported.',
        '<b>PDF Tools</b> — 23 operations on existing PDFs: merge, split, split-by-size, rotate, reorder, delete, insert, crop, annotate (text or draw), watermark, image watermark, header/footer, bookmarks, metadata, forms, extract text, compress, protect, invert, to-image, compare, batch, undo/redo, and OCR.',
        '<b>Library</b> — local IndexedDB storage with thumbnails, search, folders, rename, and delete.',
        '<b>Help</b> — searchable topic index plus an interactive walkthrough tutorial.',
    ]
    for item in workspaces_list:
        story.append(Paragraph(f'• {item}', bullet_style))

    story.append(Paragraph('Layout (v7.4.x)', h2_style))
    story.append(Paragraph(
        'Studio, Add Text &amp; Sign, and PDF Tools share the same two-column layout: '
        'controls on the left, live preview on the right. Page navigation (‹ Page X of N ›) '
        'and a page slider live directly beneath each preview pane. The OCR result panel '
        'appears as a second preview card below the main preview, with Copy / Download .txt / '
        'Read aloud actions grouped at its bottom.',
        body_style))

    story.append(Paragraph('Privacy', h2_style))
    story.append(Paragraph(
        'All processing happens locally in the browser. The only network requests are for '
        'CDN-hosted libraries (pdf.js, pdf-lib, Tesseract.js language data) on first use. '
        'Documents never leave the device.',
        body_style))

    story.append(Paragraph('Deployment', h2_style))
    story.append(Paragraph(
        'Static files served from GitHub Pages. No backend required. Clone the repository '
        'and open index.html, or visit the production URL.',
        body_style))

    story.append(PageBreak())

    # ===== Pages 2+: One screenshot per workspace =====
    for ws in WORKSPACES:
        story.append(Paragraph(ws['title'], caption_title_style))
        story.append(Paragraph(ws['caption'], caption_body_style))
        story.append(Spacer(1, 0.15 * inch))
        img = scaled_image(SHOTS / ws['screenshot'], max_w_in=6.8)
        if img is not None:
            story.append(img)
        else:
            story.append(Paragraph(f'[Screenshot not found: {ws["screenshot"]}]', body_style))
        story.append(PageBreak())

    doc.build(story)
    print(f'Wrote {OUT} ({Path(OUT).stat().st_size} bytes)')


if __name__ == '__main__':
    build()
