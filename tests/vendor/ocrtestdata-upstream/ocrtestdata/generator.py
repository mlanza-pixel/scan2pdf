"""
PDF and page generator.

Responsibilities:
- Create pages as PIL Images (text pages or QR pages).
- Ensure margins of at least 1.5 cm.
- Adjust font size to emulate Word 11pt.
- Fill ~90% of page height with text on text pages.
- Some text portions are rendered "bold" (simulated if bold font not available).
- QR pages contain only a centered QR code in the upper 10% of the page area.
- Randomly choose color or grayscale mode per page.
- Save pages as a single PDF (image-based) without metadata.
"""

import math
import random
import textwrap
from typing import List, Optional, Tuple
from pathlib import Path
from faker import Faker
from PIL import Image, ImageDraw, ImageFont
import qrcode

from .io_utils import a4_pixels

# Constants
CM_TO_INCH = 0.3937007874
MIN_MARGIN_CM = 1.5  # 1.5 cm margin
QR_SIZE_CM = 2.0  # 2 cm x 2 cm QR code


def _pt_to_px(pt: float, dpi: int) -> int:
    """
    Convert points (1/72 inch) to pixels at given DPI.
    Word '11' corresponds to 11 pt.
    """
    return int(round(pt * dpi / 72.0))


def _cm_to_px(cm: float, dpi: int) -> int:
    return int(round((cm * CM_TO_INCH) * dpi))


def _choose_color_mode() -> str:
    """
    Randomly choose 'RGB' (color) or 'L' (grayscale).
    """
    return "RGB" if random.random() < 0.5 else "L"


def _load_font(preferred_size_px: int) -> Tuple[Optional[ImageFont.FreeTypeFont], Optional[ImageFont.FreeTypeFont]]:
    """
    Try to load Ubuntu-R.ttf and Ubuntu-B.ttf from <script>/fonts.
    If not available, fall back to common system fonts.
    Returns (regular, bold) or (None, None).
    """
    script_dir = Path(__file__).resolve().parent
    fonts_dir = script_dir / "fonts"

    # Preferred Ubuntu fonts in local fonts directory
    candidates = [
        fonts_dir / "Ubuntu-R.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/Library/Fonts/Arial.ttf",
        "C:\\Windows\\Fonts\\arial.ttf",
    ]
    bold_candidates = [
        fonts_dir / "Ubuntu-B.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
    ]

    regular = None
    bold = None

    for p in candidates:
        try:
            regular = ImageFont.truetype(str(p), preferred_size_px)
            break
        except Exception:
            regular = None

    for p in bold_candidates:
        try:
            bold = ImageFont.truetype(str(p), preferred_size_px)
            break
        except Exception:
            bold = None

    return regular, bold


def _simulate_bold(draw: ImageDraw.Draw, pos: Tuple[int, int], text: str, font: ImageFont.ImageFont, fill):
    """
    Simulate bold by drawing text multiple times with slight offsets.
    """
    x, y = pos
    # Draw text multiple times with small offsets
    draw.text((x, y), text, font=font, fill=fill)
    draw.text((x + 1, y), text, font=font, fill=fill)


def _wrap_text_to_box(text: str, draw: ImageDraw.Draw, font: ImageFont.ImageFont, box_width: int, box_height: int) -> List[str]:
    """
    Wrap text to fit into a box of width box_width and height box_height.
    Returns a list of lines that fit.
    We try to fill approximately 90% of the box height.
    """
    # Conservative approach: estimate average char width
    try:
        avg_char_width = font.getbbox("x")[2] - font.getbbox("x")[0]
    except Exception:
        avg_char_width = 7
    if avg_char_width <= 0:
        avg_char_width = 7
    max_chars_per_line = max(10, box_width // avg_char_width)
    wrapped = textwrap.wrap(text, width=max_chars_per_line)
    # Now ensure we don't exceed box_height
    try:
        line_height = font.getbbox("Ay")[3] - font.getbbox("Ay")[1]
    except Exception:
        line_height = int(round(14))
    max_lines = max(1, box_height // line_height)
    # We want to fill ~90% of box height: compute target lines
    target_lines = max(1, int(round(max_lines * 0.9)))
    # If wrapped has fewer lines than target, we can add more text by re-wrapping with smaller width
    if len(wrapped) < target_lines:
        # reduce width to create more lines
        new_width = max(10, int(max_chars_per_line * 0.8))
        wrapped = textwrap.wrap(text, width=new_width)
    # Trim to max_lines
    return wrapped[:max_lines]


def create_text_page(
    faker: Faker,
    dpi: int,
    page_size_px: Tuple[int, int],
    margin_px: int,
    font_px: int,
) -> Image.Image:
    """
    Create a single text page as a PIL Image.
    - Fills ~70% of page height with text.
    - Some portions are bold.
    - Ensures margin of at least MIN_MARGIN_CM.
    - Randomly chooses color or grayscale.
    """
    mode = _choose_color_mode()
    width, height = page_size_px
    if mode == "RGB":
        bg_color = (255, 255, 255)
        text_color = (0, 0, 0)
    else:
        bg_color = 255
        text_color = 0

    img = Image.new(mode, (width, height), color=bg_color)
    draw = ImageDraw.Draw(img)

    # Load font (or fallback)
    regular_font, bold_font = _load_font(font_px)
    if regular_font is None:
        # fallback to default
        regular_font = ImageFont.load_default()
    if bold_font is None:
        bold_font = None  # we'll simulate bold

    # Compute text box
    box_left = margin_px
    box_top = margin_px
    box_right = width - margin_px
    box_bottom = height - margin_px
    box_width = box_right - box_left
    box_height = box_bottom - box_top

    # Generate text until we have enough content to fill ~90% of box height
    paragraphs = []
    # Aim for a generous amount of text; we'll wrap and trim later
    for _ in range(6):
        paragraphs.append(faker.paragraph(nb_sentences=random.randint(10, 80)))
    full_text = "\n\n".join(paragraphs)

    # Wrap text to lines that fit the box
    lines = _wrap_text_to_box(full_text, draw, regular_font, box_width, box_height)

    # Compute line height
    try:
        line_height = regular_font.getbbox("Ay")[3] - regular_font.getbbox("Ay")[1]
    except Exception:
        line_height = int(round(font_px * 1.2))

    # Compute vertical start to roughly fill 90% of box height
    target_lines = int(round(len(lines)))
    used_height = target_lines * line_height
    # If used_height is less than 90% of box_height, we can increase lines by re-wrapping shorter width
    if used_height < 0.90 * box_height:
        # attempt to create more lines by re-wrapping with smaller width
        lines = _wrap_text_to_box(full_text, draw, regular_font, int(box_width * 0.9), box_height)
        target_lines = len(lines)
        used_height = target_lines * line_height

    # Start drawing at top of box
    y = box_top
    # Draw lines; randomly make some lines bold
    for i, line in enumerate(lines):
        x = box_left
        # Randomly bold some lines (approx 10-20% of lines)
        make_bold = random.random() < 0.15
        if make_bold and bold_font is not None:
            draw.text((x, y), line, font=bold_font, fill=text_color)
        elif make_bold and bold_font is None:
            _simulate_bold(draw, (x, y), line, regular_font, text_color)
        else:
            draw.text((x, y), line, font=regular_font, fill=text_color)
        y += line_height
        # Stop if we exceed 90% of box height
        if (y - box_top) >= 0.9 * box_height:
            break

    return img


def create_qr_page(
    qr_text: str,
    dpi: int,
    page_size_px: Tuple[int, int],
    margin_px: int,
) -> Image.Image:
    """
    Create a QR-only page:
    - QR code is 2cm x 2cm (converted to pixels using dpi).
    - QR is centered horizontally and placed within the upper 10% of the page height.
    - No text on this page.
    """
    mode = "RGB" 
    width, height = page_size_px
    bg_color = (255, 255, 255)
    qr_fill = (0, 0, 0)

    img = Image.new(mode, (width, height), color=bg_color)

    # Compute QR size in pixels
    qr_px = _cm_to_px(QR_SIZE_CM, dpi)
    # Generate QR using qrcode library
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(qr_text)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color=qr_fill, back_color=bg_color).convert("RGB" if mode == "RGB" else "L")

    # Resize QR to exact qr_px x qr_px
    qr_img = qr_img.resize((qr_px, qr_px), resample=Image.NEAREST)

    # Compute placement: centered horizontally, vertical position within upper 10% of page
    upper_band_height = int(round(0.10 * height))
    # Place QR centered horizontally and vertically inside the upper band
    x = (width - qr_px) // 2
    y = max(margin_px, (upper_band_height - qr_px) // 2)

    img.paste(qr_img, (x, y))
    return img


def save_pages_as_pdf(pages: List[Image.Image], out_pdf_path: str, dpi: int) -> None:
    """
    Save a list of PIL Images as a single PDF file.
    Ensure no metadata is written. Use PIL's save with save_all and append_images.
    """
    if not pages:
        raise ValueError("No pages to save")

    # Convert all pages to RGB for PDF (Pillow will convert if needed)
    converted = []
    for p in pages:
        if p.mode != "RGB":
            converted.append(p.convert("RGB"))
        else:
            converted.append(p)

    # Save without metadata: do not pass any info dict
    first, rest = converted[0], converted[1:]
    # Use resolution parameter to set DPI
    first.save(out_pdf_path, "PDF", save_all=True, append_images=rest, resolution=dpi)

def generate_pdf(
    faker: Faker,
    out_pdf_path: str,
    pages_per_pdf: int,
    dpi: int,
    qr_text: Optional[str] = None,
) -> int:
    """
    Generate a PDF at out_pdf_path with pages_per_pdf pages.
    Returns the number of pages created (pages_per_pdf).
    The PDF is written to out_pdf_path (path must be writable).
    """
    # Compute page size and margins
    page_w, page_h = a4_pixels(dpi)
    margin_px = _cm_to_px(MIN_MARGIN_CM, dpi)
    # Compute font size to emulate Word 11pt
    font_px = _pt_to_px(11, dpi)

    pages = []
    for page_index in range(1, pages_per_pdf + 1):
        # Decide if this page is a QR page: every 3rd page if qr_text provided
        if qr_text and (page_index % 3 == 0):
            page_img = create_qr_page(qr_text, dpi, (page_w, page_h), margin_px)
        else:
            page_img = create_text_page(faker, dpi, (page_w, page_h), margin_px, font_px)
        pages.append(page_img)

    # Save pages as PDF
    save_pages_as_pdf(pages, out_pdf_path, dpi)
    return len(pages)
