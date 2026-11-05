#!/usr/bin/env python3
"""Rebuild the editable help-text reference directly from in-app help source."""
from pathlib import Path
import re,html
from artifact_tool import Workbook,SpreadsheetFile
root=Path(__file__).resolve().parents[1];src=(root/'js/help-system.js').read_text()
wb=Workbook.create();sh=wb.worksheets.add('Help Topics and Steps')
head=['Page','Topic ID','Topic Title','Step / Field','Current Help Text','Change To','Description','Test ID','Expected Result','Version','Status']
sh.get_range('A1:K1').values=[head];rows=[]
# The Help source has one entry per topic, each with a steps array. Capture exact user-facing strings.
start=src.index('const HELP_TOPICS = [');end=src.index('\n];',start);section=src[start:end]
parts=re.split(r"\n  \{\s*\n    id: '\s*",section)[1:]
for part in parts:
 topic=part.split("'",1)[0];title=re.search(r"\btitle: '((?:\\'|[^'])*)'",part);workspace=re.search(r"\bworkspace: '([^']+)'",part)
 name=title.group(1) if title else topic;page=workspace.group(1) if workspace else 'Help'
 for label,pat in [('Title',r"\btitle: '((?:\\'|[^'])*)'"),('Subtitle',r"\bsub: '((?:\\'|[^'])*)'"),('Purpose',r"\bpurpose: '((?:\\'|[^'])*)'"),('Prerequisites',r"\bprerequisites: '((?:\\'|[^'])*)'"),('Troubleshooting',r"\btroubleshooting: '((?:\\'|[^'])*)'")]:
  match=re.search(pat,part)
  if match:rows.append([page,topic,name,label,html.unescape(re.sub('<[^>]*>','',match.group(1)).replace("\\'","'")),'',f'In-app Help {label}',f'HELP-{topic}-{label.upper()}','Text matches approved manual','7.7.0','Review'])
 for i,match in enumerate(re.finditer(r"\{\s*title:\s*'((?:\\'|[^'])*)',\s*body:\s*'((?:\\'|[^'])*)'",part),1):
  rows.append([page,topic,name,f'Step {i}: {match.group(1)}',html.unescape(re.sub('<[^>]*>','',match.group(2)).replace("\\'","'")),'','Tour/help step',f'HELP-{topic}-STEP-{i:02d}','Visible and accurate in app','7.7.0','Review'])
for offset in range(0,len(rows),120):sh.get_range_by_indexes(1+offset,0,len(rows[offset:offset+120]),len(head)).values=rows[offset:offset+120]
sh.get_range('A1:K1').format.fill='#17365D';sh.get_range('A1:K1').format.font.color='#FFFFFF';sh.get_range('A:K').format.column_width=22;sh.get_range('E:E').format.column_width=90;sh.get_range('F:F').format.column_width=50;sh.freeze_panes.freeze_rows(1)
sh2=wb.worksheets.add('Instructions');sh2.get_range('A1:B3').values=[['Instructions','Fill in Change To and return this workbook with Topic ID and Step / Field.'],['Source','Extracted from js/help-system.js; proposed corrections to old help wording are documented in the updated v7.7 manual.'],['Version','7.7.0']];sh2.get_range('A:A').format.column_width=25;sh2.get_range('B:B').format.column_width=105
out=root/'docs/DocuScan-Pro-Help-Content-Inventory-v7.7.xlsx';SpreadsheetFile.export_xlsx(wb).save(str(out));print('help rows:',len(rows),'file:',out)
