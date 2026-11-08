"""Generate a 10-page test PDF for the PDF Tools walkthrough test.

Each page is distinct (different page number, color stripe, body text) so
the walkthrough can verify that operations like Split, Reorder, Rotate,
Delete Pages, and Reorder actually move/swap/remove the correct pages.
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor

OUT = Path('/home/z/my-project/assets/samples/test-10page.pdf')
OUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = LETTER
MARGIN = 0.75 * inch

# 10 distinct accent colors so a glance can identify each page
COLORS = [
    HexColor('#007AFF'),  # blue
    HexColor('#FF9500'),  # orange
    HexColor('#34C759'),  # green
    HexColor('#FF3B30'),  # red
    HexColor('#5856D6'),  # purple
    HexColor('#AF52DE'),  # magenta
    HexColor('#FF2D55'),  # pink
    HexColor('#5AC8FA'),  # cyan
    HexColor('#FFCC00'),  # yellow
    HexColor('#8E8E93'),  # gray
]

PARAGRAPHS = [
    "This is page one of the ten-page test document. Each page has a unique accent color so that operations like Rotate, Reorder, Split, and Delete Pages can be visually verified.",
    "Page two. The same layout is used for every page; only the page number, color stripe, and body text differ.",
    "Page three. If a rotation operation is applied to this PDF, every page should rotate by the same angle.",
    "Page four. For Split operations, the test will request a specific range (e.g. '1-3') and verify the output contains only the requested pages.",
    "Page five. For Reorder operations, the test will specify a new page order and verify the output matches.",
    "Page six. For Delete Pages, the test will remove specific pages and confirm the remaining pages are in the correct sequence.",
    "Page seven. For Watermark operations, the test will apply a diagonal watermark and verify it appears on every page.",
    "Page eight. For Header/Footer operations, the test will add a header line and verify it appears at the top of every page.",
    "Page nine. For OCR operations, this text provides a sample that Tesseract.js should recognize accurately.",
    "Page ten. The final page. For Merge operations, this PDF can be merged with a second document and the resulting page count should equal the sum.",
]


def make_page(c, page_num):
    color = COLORS[page_num - 1]
    # Top color stripe (full width)
    c.setFillColor(color)
    c.rect(0, PAGE_H - 0.5 * inch, PAGE_W, 0.5 * inch, fill=1, stroke=0)
    # Page title
    c.setFillColor(HexColor('#1C1C1E'))
    c.setFont('Helvetica-Bold', 24)
    c.drawString(MARGIN, PAGE_H - 1.2 * inch, f'Test Document — Page {page_num}')
    # Subtitle
    c.setFont('Helvetica', 14)
    c.setFillColor(color)
    c.drawString(MARGIN, PAGE_H - 1.55 * inch, f'Accent color #{page_num}')
    # Body text (wrapped manually)
    c.setFillColor(HexColor('#1C1C1E'))
    c.setFont('Helvetica', 12)
    text = PARAGRAPHS[page_num - 1]
    # Simple word-wrap
    max_w = PAGE_W - 2 * MARGIN
    words = text.split()
    line = ''
    y = PAGE_H - 2 * inch
    for word in words:
        test = (line + ' ' + word).strip()
        if c.stringWidth(test, 'Helvetica', 12) <= max_w:
            line = test
        else:
            c.drawString(MARGIN, y, line)
            y -= 18
            line = word
    if line:
        c.drawString(MARGIN, y, line)
        y -= 18
    # Footer page indicator
    c.setFont('Helvetica', 10)
    c.setFillColor(HexColor('#8E8E93'))
    c.drawCentredString(PAGE_W / 2, 0.4 * inch, f'— {page_num} / 10 —')


def main():
    c = canvas.Canvas(str(OUT), pagesize=LETTER)
    for n in range(1, 11):
        make_page(c, n)
        c.showPage()
    c.save()
    print(f'Wrote {OUT} ({OUT.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
