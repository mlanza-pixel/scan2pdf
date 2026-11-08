from pathlib import Path
import json,subprocess,sys,hashlib
p=Path(__file__).resolve().parents[1]
checks={
 'version':json.loads((p/'release.json').read_text())['version']=='7.7.0',
 'documentation':all((p/'docs'/n).exists() for n in ['DocuScan-Pro-UI-Field-Reference-v7.7.xlsx','legacy/DocuScan-Pro-Help-Manual.pdf','legacy/DocuScan-Pro-Help-Manual.docx','legacy/DocuScan-Pro-Overview.pdf']),
 'screenshot toolkit':(p/'scripts/universal_capture_v77.py').exists(),
 'stress tests':(p/'scripts/test_stress_v77.py').exists(),
 'audio module':(p/'js/interface-sounds.js').exists(),
 'test scripts':len(list((p/'scripts').glob('test_*.py')))>=15,
 'screen directories':all((p/'screenshots'/d).is_dir() for d in ['iphone','ipad','android','desktop']),
}
for name,ok in checks.items():print(('PASS' if ok else 'FAIL'),name)
(p/'tests/results/v77-release-integrity.json').write_text(json.dumps(checks,indent=2))
sys.exit(0 if all(checks.values()) else 1)
