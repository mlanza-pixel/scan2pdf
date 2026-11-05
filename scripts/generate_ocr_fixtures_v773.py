#!/usr/bin/env python3
"""Deterministic OCR fixtures, independently implemented (not vendored ocrtestdata).
Pillow + reportlab; optional qrcode. Synthetic content only.
"""
import argparse, hashlib, io, json, random, pathlib, datetime
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

CASES = [('clean',0,0,0),('low_contrast',0,0,1),('rotated',3,0,0),('blurred',0,1,0),('noisy',0,0,2)]

def font(size):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','C:/Windows/Fonts/arial.ttf']:
        if pathlib.Path(p).exists(): return ImageFont.truetype(p,size)
    return ImageFont.load_default()

def page_image(index,case, width=1000,height=1400):
    rng=random.Random(index*923+17)
    im=Image.new('RGB',(width,height),'white'); d=ImageDraw.Draw(im)
    invoice=f'DS-{index:05d}'; amount=f'{(index*17)%9999}.{index%100:02d}'
    lines=['DOCUSCAN PRO OCR VALIDATION',f'INVOICE {invoice}',f'TOTAL USD {amount}',f'PAGE {index:03d}', 'SYNTHETIC DOCUMENT - NOT PERSONAL DATA', 'The quick brown fox jumps over the lazy dog.', 'Order reference ALPHA BETA GAMMA 2026']
    for j,line in enumerate(lines): d.text((55,90+j*125),line,fill=(24,24,24),font=font(32 if j else 39))
    for j in range(12):
        d.line((55,1040+j*20,940,1040+j*20),fill=(155,155,155),width=1)
    if case=='low_contrast':
        im=Image.blend(Image.new('RGB',im.size,'white'),im,.35)
    elif case=='rotated': im=im.rotate(3,resample=Image.Resampling.BICUBIC,fillcolor='white')
    elif case=='blurred': im=im.filter(ImageFilter.GaussianBlur(1.5))
    elif case=='noisy':
        d=ImageDraw.Draw(im)
        for _ in range(15000):
            x=rng.randrange(width);y=rng.randrange(height);v=rng.randrange(155,245)
            d.point((x,y),fill=(v,v,v))
    return im, {'page':index,'case':case,'invoice':invoice,'amount':amount,'expectedLines':lines}

def generate(out,count,quality):
    out.mkdir(parents=True,exist_ok=True)
    name=f'ocr_{count:03d}pages_q{quality}.pdf'; pdfpath=out/name
    c=canvas.Canvas(str(pdfpath),pagesize=(612,792),pageCompression=1)
    manifest=[]
    for i in range(1,count+1):
        case=CASES[(i-1)%len(CASES)][0]
        img,record=page_image(i,case)
        stream=io.BytesIO();img.save(stream,format='JPEG',quality=quality,optimize=False)
        stream.seek(0)
        c.drawImage(ImageReader(stream),0,0,width=612,height=792)
        c.showPage();manifest.append(record)
    c.save()
    size=pdfpath.stat().st_size
    if size < count*15000: raise RuntimeError(f'Unrealistically small PDF: {size} bytes / {count} pages')
    sha=hashlib.sha256(pdfpath.read_bytes()).hexdigest()
    data={'schema':'docuscan-ocr-fixtures-v1','generator':'scripts/generate_ocr_fixtures_v773.py','filename':name,'pages':count,'bytes':size,'sha256':sha,'quality':quality,'pagePixels':[1000,1400],'synthetic':True,'groundTruth':manifest,'accuracyMetric':'normalized character error rate and token recall; compare recognized text to expectedLines'}
    (out/(name+'.groundtruth.json')).write_text(json.dumps(data,indent=2),encoding='utf8')
    print(f'{name}: {size/1048576:.2f} MiB / {count} pages, {sha[:12]}')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',default='tests/fixtures/generated');p.add_argument('--pages',type=int,nargs='+',default=[5,10,25]);p.add_argument('--quality',type=int,default=78)
    a=p.parse_args()
    for n in a.pages:
        if n<1 or n>200: p.error('page count must be 1..200')
        generate(pathlib.Path(a.out),n,a.quality)
