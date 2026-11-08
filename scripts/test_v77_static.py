from pathlib import Path
from bs4 import BeautifulSoup
import json,re,sys
p=Path(__file__).resolve().parents[1];s=BeautifulSoup((p/'index.html').read_text(),'html.parser');checks={}
checks['6 workspaces']=len(s.select('.workspace'))==6
checks['six ordered tool groups']=[b.get('data-group') for b in s.select('#toolsGroups > button')]==['content','extract','pages','properties','combine','batch']
checks['all six tool groups have panels']=set(b.get('data-group') for b in s.select('#toolsGroups > button'))==set(x.get('data-tools-for') for x in s.select('.tools-tools-for-group'))
checks['OCR Invert first']= [b.get('data-tab') for b in s.select('[data-tools-for="extract"] .tools-tab')][:2]==['ocrpdf','invert']
checks['all tools initially collapsed']=all(x.has_attr('hidden') for x in s.select('.tools-tools-for-group'))
checks['unique IDs']=len([x.get('id') for x in s.select('[id]')])==len(set(x.get('id') for x in s.select('[id]')))
checks['tour in header']=bool(s.select('header #globalTour'))
checks['sound in header']=bool(s.select('header #btnSoundMode'))
checks['navigation relabelled']='Edit in Sign' in s.get_text() and 'Edit in Tools' in s.get_text()
checks['legacy documentation']=len(list((p/'docs/legacy').glob('*')))>=4
checks['field workbook']=(p/'docs/DocuScan-Pro-UI-Field-Reference-v7.7.xlsx').exists()
checks['reusable screenshot toolkit']=(p/'scripts/universal_capture_v77.py').exists()
checks['release version']=json.loads((p/'release.json').read_text())['version']=='7.7.0'
checks['collapse implementation']='if (isAlreadyActive) {' in (p/'js/app.js').read_text()
for k,v in checks.items():print(('PASS' if v else 'FAIL'),k)
(p/'tests/results/v77-static-results.json').write_text(json.dumps(checks,indent=2))
sys.exit(0 if all(checks.values()) else 1)
