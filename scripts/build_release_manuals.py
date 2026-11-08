from pathlib import Path
import json,re,html
from docx import Document
from docx.shared import Inches,Pt,RGBColor
from docx.oxml.ns import qn
r=Path(__file__).resolve().parents[1];data=json.loads((r/'docs/RELEASE_CONTENT.json').read_text());version=data['version'];docs=r/'docs'
def plain(s):return html.unescape(re.sub('<[^>]*>','',str(s or ''))).replace('–','-').replace('—','-')
def make(title):
 d=Document();sec=d.sections[0];sec.top_margin=sec.bottom_margin=Inches(.65);sec.left_margin=sec.right_margin=Inches(.75)
 for name in ['Normal','Title','Heading 1','Heading 2','Heading 3']:
  style=d.styles[name];style.font.name='Arial';style.font.color.rgb=RGBColor(0,0,0)
 d.styles['Normal'].font.size=Pt(10);d.styles['Normal'].paragraph_format.space_after=Pt(5)
 d.styles['Title'].font.size=Pt(24);d.styles['Heading 1'].font.size=Pt(16);d.styles['Heading 2'].font.size=Pt(12)
 d.add_paragraph(title,'Title');d.add_paragraph(f'Version {version} Test Build 5\nBuild {data["build"]}\nBuilt {data["buildUtc"]}')
 for node in list(d.element.iter(qn("w:pBdr")))+list(d.styles.element.iter(qn("w:pBdr"))):node.getparent().remove(node)
 return d
manual=make('DocuScan Pro Help Manual')
manual.add_paragraph('Scan and import images, edit and sign PDFs, manage pages, and keep documents in your local Library. This manual follows the Help content included in this test build. Review OCR and edited output before sharing it.')
manual.add_heading('What changed in this build',1)
manual.add_paragraph('Multiline PDF form fields now use expandable text boxes. Press Enter to start a new line; line breaks and blank lines are retained when you Apply Changes and reopen the PDF. Single-line fields remain single-line and read-only fields remain protected. The self-test includes a multiline form save and reopen check.')
manual.add_paragraph('Blank static hybrid XFA forms, including the tested March 2024 W-9, can be converted to an editable PDF copy. Open in PDF Tools and choose Create editable copy. Choose Forms and Apply Changes, fill the fields, then Apply Changes again. Use Edit in Sign to add a signature. Conversion removes XFA scripts and validation. Dynamic, signed or populated XFA forms remain blocked. Download original XFA returns the unchanged source.')
for text in ['PDF naming, renaming, folders, stamps and folder selection use app dialogs. Save accepts the name; Cancel or Escape dismisses the dialog. PDF filenames are made portable and receive one .pdf extension.', 'Scan shows loading stages separately from recognition progress and identifies the current page. First use still downloads OCR assets; the English model is not bundled in this build.', 'Text in Sign is staged for placement: type text, tap Text, then tap the page once. W-9 and other existing PDF forms support text and checkbox edits.', 'Device Self-Test offers isolated fixture workflows. Its temporary Library is separate from your documents. NOT RUN results identify work that the test did not exercise. A component or layout pass does not certify every button.']:
 manual.add_paragraph(text)
manual.add_heading('Before you test',1)
manual.add_paragraph('Keep backups of important documents. Use the bundled sample images and PDFs for the first pass. In About, confirm version 7.75.0 and build 7.75.0-test5. If a previous version remains visible after deployment, close and reopen the app and reload once. Avoid clearing browser storage because that can remove local Library documents.')
manual.add_paragraph('Automatic cross-device sync is not included. Export Library Backup and Restore Library Backup move copies manually through Files or another location you choose. Native camera, share, print and accessibility behavior must still be checked on physical devices.')
for workspace,title in [('home','Home'),('studio','Document Studio'),('sign','Sign'),('tools','PDF Tools'),('library','Library'),('help','Help and diagnostics')]:
 manual.add_page_break();manual.add_heading(title,1)
 for t in data['topics']:
  if (t.get('workspace') or 'help')!=workspace:continue
  manual.add_heading(plain(t['title']),2)
  if t.get('purpose'):manual.add_paragraph(plain(t['purpose']))
  if t.get('prerequisites'):manual.add_paragraph('Before starting: '+plain(t['prerequisites']))
  for i,step in enumerate(t.get('steps',[]),1):
   p=manual.add_paragraph();p.add_run(f'{i}. '+plain(step.get('title'))+'. ').bold=True;p.add_run(plain(step.get('body')))
  if t.get('troubleshooting'):manual.add_paragraph('If something goes wrong: '+plain(t['troubleshooting']))
manual.add_page_break();manual.add_heading('Physical device test checklist',1)
for text in ['Import three JPGs, run Scan, review all page text, create a named PDF, and reopen it from Library. Cancel a second creation and confirm no extra PDF was saved.', 'Open a PDF in Sign. Tap Text repeatedly, place it once, then use Undo and Redo. Add a drawn signature and watermark, export and reopen the result.', 'Open the blank W-9 in PDF Tools. Detect existing fields, enter sample text, select a checkbox, apply changes, save and reopen the PDF. Confirm both values are retained.', 'Run About > Device Self-Test with fixture workflows enabled. Download JSON and identify PASS, FAIL and NOT RUN results separately. Stop a run and confirm the app remains usable.', 'On the actual device, capture a photo, share a PDF through the native share sheet, and print or preview printing. These interactions cannot be certified by viewport emulation.']:
 manual.add_paragraph(text,style='List Number')
manual.save(docs/f'DocuScan-Pro-Help-Manual-v{version}.docx')
overview=make('DocuScan Pro Test Build Overview')
overview.add_paragraph('Test Build 5 adds explicit conversion for supported blank static hybrid XFA forms such as the tested W-9. Keep the original, fill the copy in PDF Tools, then sign it in Sign. Full XFA behavior is not retained. Physical iPad verification is still required.')
overview.add_paragraph('This complete test package includes the application, sample files, updated Help and UI reference workbooks, manuals, automated scripts and test evidence. It is intended for hands-on device testing before a public release.')
for title,text in [('Studio','Import or capture pages, improve images, scan text, and create a PDF. OCR shows loading and recognition progress. Creating a PDF saves it to Library; Download is a separate device copy.'),('Sign','Add text, signatures, dates, markup and watermarks. Text is placed once on the preview after you select the tool. Undo and Redo restore the object state.'),('PDF Tools','Use the categories for page changes, annotation, extraction, existing form fields and other operations. Text and checkbox values are saved as interactive PDF fields.'),('Library','Choose an action, select files, and confirm. Folders, naming and move choices use app dialogs. Backups and restores are manual; there is no automatic sync.'),('Test coverage','Desktop and mobile viewport workflow checks passed. Generated OCR scoring tests and worker-control unit tests are separate from real OCR accuracy. Physical camera, native share and print, accessibility review and remaining feature workflows still require testing.')]:
 overview.add_heading(title,2);overview.add_paragraph(text)
overview.save(docs/f'DocuScan-Pro-Overview-v{version}.docx')
print('manuals generated',version)
