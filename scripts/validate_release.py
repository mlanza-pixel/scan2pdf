"""Fail a release if app content or generated documentation is stale."""
from pathlib import Path
import hashlib,json,zipfile,xml.etree.ElementTree as ET,re
r=Path(__file__).resolve().parents[1]
meta=json.loads((r/'release.json').read_text());manifest=json.loads((r/'docs/RELEASE_DOCS_MANIFEST.json').read_text())
assert manifest['version']==meta['version'] and manifest['build']==meta['build'],'Documentation version mismatch'
for group in ['sources','documents']:
 for name,expected in manifest[group].items():
  p=r/name
  assert p.is_file(),f'Missing {name}'
  assert hashlib.sha256(p.read_bytes()).hexdigest()==expected,f'Stale {group}: {name}; regenerate release documentation'
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
for filename in manifest['workbooks']:
 with zipfile.ZipFile(r/filename) as z:
  strings=[]
  if 'xl/sharedStrings.xml' in z.namelist():
   strings=[''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
  for part in z.namelist():
   if not re.fullmatch(r'xl/worksheets/sheet\d+\.xml',part):continue
   cells={c.attrib['r']:c for c in ET.fromstring(z.read(part)).findall('.//s:c',ns)}
   def value(cell):
    c=cells.get(cell)
    if c is None:return ''
    if c.attrib.get('t')=='inlineStr':return ''.join(c.find('s:is',ns).itertext())
    v=c.find('s:v',ns)
    return strings[int(v.text)] if v is not None and c.attrib.get('t')=='s' else v.text if v is not None else ''
   assert value('B3')==meta['version'],f'Workbook sheet has stale version: {filename}/{part}'
   assert value('D3')==meta['build'],f'Workbook sheet has stale build: {filename}/{part}'
index=(r/'index.html').read_text();app=(r/'js/app.js').read_text();sw=(r/'sw.js').read_text();diag=(r/'js/device-self-test.js').read_text()
assert f'<title>DocuScan Pro {meta["version"]}</title>' in index
assert f"APP_BUILD = '{meta['build']}'" in app and meta['buildUtc'] in app
assert meta['cacheVersion'] in sw and meta['diagnosticSuite'] in diag
print(f'PASS: release {meta["version"]}, source fingerprints, manuals, and every workbook sheet match {meta["build"]}')
