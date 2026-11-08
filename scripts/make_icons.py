"""Generate PNG icons (192 and 512) from the SVG icon for DocuScan Pro PWA."""
import cairosvg
from pathlib import Path

ICONS_DIR = Path('/home/z/my-project/assets/icons')
svg_path = ICONS_DIR / 'icon.svg'

for size in (192, 512):
    out = ICONS_DIR / f'icon-{size}.png'
    cairosvg.svg2png(url=str(svg_path), write_to=str(out),
                     output_width=size, output_height=size)
    print(f'wrote {out} ({out.stat().st_size} bytes)')

# Apple touch icon (180)
out = ICONS_DIR / 'apple-touch-icon.png'
cairosvg.svg2png(url=str(svg_path), write_to=str(out),
                 output_width=180, output_height=180)
print(f'wrote {out} ({out.stat().st_size} bytes)')
