#!/usr/bin/env python3
"""Verify generated image-backed PDFs and fixture provenance; not OCR recognition."""
import argparse,hashlib,json,pathlib,sys
from pypdf import PdfReader
p=argparse.ArgumentParser();p.add_argument('directory',nargs='?',default='tests/fixtures/generated');a=p.parse_args()
files=sorted(pathlib.Path(a.directory).glob('*.groundtruth.json'))
if not files: raise SystemExit('FAIL: no ground truth manifests')
for mf in files:
    m=json.loads(mf.read_text());f=mf.parent/m['filename'];data=f.read_bytes()
    assert hashlib.sha256(data).hexdigest()==m['sha256'],f'hash mismatch {f}'
    assert len(data)==m['bytes'] and len(data)>m['pages']*15000,'file size below threshold'
    pdf=PdfReader(str(f));assert len(pdf.pages)==m['pages'],'page count mismatch'
    for i,page in enumerate(pdf.pages):
        images=list(page.images)
        assert images,f'page {i+1} missing image'
    assert len(m['groundTruth'])==m['pages'],'ground truth mismatch'
    print(f'PASS {f.name}: {len(pdf.pages)} image pages, {len(data)/1048576:.2f} MiB, sha256 verified')
print(f'PASS {len(files)} realistic PDF fixtures; OCR recognition itself NOT tested by this verifier')
