"""Create sample PDFs and images for DocuScan Pro test cases.
Uses reportlab (already installed) and Pillow to generate:
  - test-contract.pdf       (a one-page contract-style PDF)
  - multi-page-test.pdf     (a 3-page PDF for merge/split/reorder tests)
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from PIL import Image, ImageDraw, ImageFont

OUT = Path('/home/z/my-project/assets/samples')
OUT.mkdir(parents=True, exist_ok=True)


def make_contract_pdf():
    path = OUT / 'test-contract.pdf'
    c = canvas.Canvas(str(path), pagesize=letter)
    w, h = letter
    # Title
    c.setFont('Helvetica-Bold', 24)
    c.drawString(72, h - 100, 'Sample Service Agreement')
    # Body
    c.setFont('Helvetica', 11)
    y = h - 160
    body = [
        'This Service Agreement (the "Agreement") is entered into as of the',
        'effective date set forth below, between DocuScan Pro Demo ("Provider")',
        'and the undersigned party ("Client").',
        '',
        '1. SERVICES. Provider shall perform the services described in the',
        '   Statement of Work attached as Exhibit A.',
        '',
        '2. TERM. This Agreement begins on the Effective Date and continues',
        '   until completion of the services, unless earlier terminated.',
        '',
        '3. PAYMENT. Client shall pay Provider the fees set forth in Exhibit B.',
        '',
        '4. CONFIDENTIALITY. Each party agrees to keep confidential information',
        '   received from the other party.',
        '',
        'IN WITNESS WHEREOF, the parties have executed this Agreement.',
        '',
        'Provider: __________________________',
        '',
        'Client:   __________________________',
        '',
        'Date:     __________________________',
    ]
    for line in body:
        c.drawString(72, y, line)
        y -= 16
    c.showPage()
    c.save()
    print(f'wrote {path}')
    return path


def make_multipage_pdf():
    path = OUT / 'multi-page-test.pdf'
    c = canvas.Canvas(str(path), pagesize=letter)
    w, h = letter
    for page_num in (1, 2, 3):
        c.setFont('Helvetica-Bold', 36)
        c.drawCentredString(w / 2, h / 2 + 60, f'Page {page_num}')
        c.setFont('Helvetica', 14)
        c.drawCentredString(w / 2, h / 2, 'DocuScan Pro multi-page test document')
        c.setFont('Helvetica', 10)
        c.drawCentredString(w / 2, h / 2 - 30, f'Generated for integration testing at {page_num} of 3')
        c.showPage()
    c.save()
    print(f'wrote {path}')
    return path


def make_sample_image(text='Sample scanned page', name='sample-page-1.jpg'):
    img = Image.new('RGB', (1240, 1754), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 36)
        title_font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 56)
    except Exception:
        font = ImageFont.load_default()
        title_font = font
    draw.text((80, 80), 'DocuScan Pro', fill=(0, 122, 255), font=title_font)
    y = 200
    for line in [
        text,
        '',
        'INVOICE / RECEIPT',
        '',
        'Amount: $1,234.56',
        'Date: 2026-10-29',
        '',
        '_________________________________',
        'Authorized signature',
    ]:
        draw.text((80, y), line, fill=(28, 28, 30), font=font)
        y += 60
    out = OUT / name
    img.save(out, 'JPEG', quality=85)
    print(f'wrote {out}')
    return out


if __name__ == '__main__':
    make_contract_pdf()
    make_multipage_pdf()
    make_sample_image()
